import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });

  // Honeypot: bots fill every field. Pretend success.
  if (clean(body.website, 200)) return NextResponse.json({ ok: true });

  const name = clean(body.name, 60);
  const contact = clean(body.contact, 120);
  const message = clean(body.message, 1000);
  const fingerprint = clean(body.fingerprint, 64);
  if (!name || !contact) return NextResponse.json({ error: "请留下名字和联系方式。" }, { status: 400 });

  const sql = db();
  if (!sql) return NextResponse.json({ error: "暂时无法接收，直接加微信吧。" }, { status: 503 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = createHash("sha256").update(`gmq:${ip}`).digest("hex").slice(0, 32);

  try {
    await ensureSchema(sql);
    const [{ n }] = (await sql`
      SELECT COUNT(*)::int AS n FROM exchanged_cards
      WHERE ip_hash = ${ipHash} AND created_at > NOW() - INTERVAL '1 hour'
    `) as { n: number }[];
    if (n >= 5) return NextResponse.json({ error: "发得有点多了，休息一下再来。" }, { status: 429 });

    await sql`
      INSERT INTO exchanged_cards (name, contact, message, fingerprint, ip_hash, user_agent)
      VALUES (${name}, ${contact}, ${message || null}, ${fingerprint || null}, ${ipHash}, ${request.headers.get("user-agent")?.slice(0, 300) ?? null})
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("exchange failed", error);
    return NextResponse.json({ error: "发送失败，稍后再试，或直接加微信。" }, { status: 500 });
  }
}
