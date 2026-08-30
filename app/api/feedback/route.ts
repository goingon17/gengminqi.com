import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Helpful = "yes" | "no" | null;
type ReaderState = { viewed: boolean; helpful: Helpful; completed: boolean };
type Sql = NeonQueryFunction<false, false>;

const readerCookie = "gengminqi_reader";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const databaseGlobal = globalThis as typeof globalThis & {
  gengminqiFeedbackSchema?: Promise<void>;
};

function database() {
  const connectionString = process.env.DATABASE_URL?.trim();
  return connectionString ? neon(connectionString) : null;
}

async function ensureSchema(sql: Sql) {
  databaseGlobal.gengminqiFeedbackSchema ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS reader_feedback (
        reader_id UUID PRIMARY KEY,
        viewed BOOLEAN NOT NULL DEFAULT FALSE,
        helpful BOOLEAN,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        contact TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS reader_feedback_created_at_idx
      ON reader_feedback (created_at DESC)
    `;
  })().catch((error) => {
    databaseGlobal.gengminqiFeedbackSchema = undefined;
    throw error;
  });
  return databaseGlobal.gengminqiFeedbackSchema;
}

function cookieReaderId(value?: string) {
  return value && uuidPattern.test(value) ? value : undefined;
}

async function readReader(sql: Sql, readerId?: string): Promise<ReaderState | null> {
  if (!readerId) return null;
  const rows = await sql`
    SELECT viewed, helpful, completed
    FROM reader_feedback
    WHERE reader_id = ${readerId}::uuid
    LIMIT 1
  `;
  const row = rows[0] as { viewed?: boolean; helpful?: boolean | null; completed?: boolean } | undefined;
  if (!row) return null;
  return {
    viewed: row.viewed === true,
    helpful: row.helpful === true ? "yes" : row.helpful === false ? "no" : null,
    completed: row.completed === true,
  };
}

async function readStats(sql: Sql) {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE viewed) AS views,
      COUNT(*) FILTER (WHERE helpful IS TRUE) AS helpful_yes,
      COUNT(*) FILTER (WHERE helpful IS FALSE) AS helpful_no
    FROM reader_feedback
  `;
  const row = rows[0] as { views?: string | number; helpful_yes?: string | number; helpful_no?: string | number } | undefined;
  return {
    views: Math.max(0, Number(row?.views) || 0),
    helpful: {
      yes: Math.max(0, Number(row?.helpful_yes) || 0),
      no: Math.max(0, Number(row?.helpful_no) || 0),
    },
  };
}

async function responseData(sql: Sql, readerId?: string) {
  const [stats, reader] = await Promise.all([readStats(sql), readReader(sql, readerId)]);
  return { ...stats, reader, available: true };
}

export async function GET() {
  const sql = database();
  if (!sql) return NextResponse.json({ views: 0, helpful: { yes: 0, no: 0 }, reader: null, available: false });

  const readerId = cookieReaderId((await cookies()).get(readerCookie)?.value);
  try {
    await ensureSchema(sql);
    return NextResponse.json(await responseData(sql, readerId));
  } catch {
    return NextResponse.json({ views: 0, helpful: { yes: 0, no: 0 }, reader: null, available: false });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== "view" && action !== "helpful" && action !== "finish") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  if (action === "helpful" && typeof body?.value !== "boolean") {
    return NextResponse.json({ error: "invalid vote" }, { status: 400 });
  }

  const contact = typeof body?.contact === "string" ? body.contact.trim().replaceAll("\0", "") : "";
  if (contact.length > 180) return NextResponse.json({ error: "contact too long" }, { status: 400 });

  const sql = database();
  if (!sql) return NextResponse.json({ error: "feedback storage unavailable" }, { status: 503 });

  const cookieStore = await cookies();
  const readerId = cookieReaderId(cookieStore.get(readerCookie)?.value) ?? randomUUID();

  try {
    await ensureSchema(sql);

    if (action === "view") {
      await sql`
        INSERT INTO reader_feedback (reader_id, viewed)
        VALUES (${readerId}::uuid, TRUE)
        ON CONFLICT (reader_id) DO UPDATE
        SET viewed = TRUE, updated_at = NOW()
      `;
    }

    if (action === "helpful") {
      await sql`
        INSERT INTO reader_feedback (reader_id, viewed, helpful)
        VALUES (${readerId}::uuid, TRUE, ${body.value})
        ON CONFLICT (reader_id) DO UPDATE
        SET viewed = TRUE, helpful = EXCLUDED.helpful, updated_at = NOW()
      `;
    }

    if (action === "finish") {
      const updated = await sql`
        UPDATE reader_feedback
        SET completed = TRUE,
            contact = CASE WHEN ${contact} = '' THEN contact ELSE ${contact} END,
            updated_at = NOW()
        WHERE reader_id = ${readerId}::uuid AND helpful IS NOT NULL
        RETURNING reader_id
      `;
      if (updated.length === 0) return NextResponse.json({ error: "vote first" }, { status: 409 });
    }

    const response = NextResponse.json(await responseData(sql, readerId));
    response.cookies.set(readerCookie, readerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "feedback storage unavailable" }, { status: 503 });
  }
}
