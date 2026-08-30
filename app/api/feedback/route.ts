import { randomUUID } from "node:crypto";
import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Helpful = "yes" | "no" | null;
type ReaderState = { viewed: boolean; helpful: Helpful; completed: boolean };
type Store = { kind: "tcp"; client: IORedis } | { kind: "rest"; client: UpstashRedis };

const viewsKey = "gengminqi:fhe:views:v1";
const helpfulKey = "gengminqi:fhe:helpful:v1";
const readersKey = "gengminqi:fhe:readers:v1";
const contactsKey = "gengminqi:fhe:contacts:v1";
const readerCookie = "gengminqi_reader";
const emptyReader: ReaderState = { viewed: false, helpful: null, completed: false };

const redisGlobal = globalThis as typeof globalThis & {
  gengminqiFeedbackTcpRedis?: IORedis;
  gengminqiFeedbackRestRedis?: UpstashRedis;
};

function restCredentials() {
  const env = process.env;
  const candidates: Array<[string | undefined, string | undefined]> = [
    [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN],
    [env.KV_REST_API_URL, env.KV_REST_API_TOKEN],
    [env.REDIS_URL_UPSTASH_REDIS_REST_URL, env.REDIS_URL_UPSTASH_REDIS_REST_TOKEN],
    [env.REDIS_URL_KV_REST_API_URL, env.REDIS_URL_KV_REST_API_TOKEN],
    [env.REDIS_URL_REST_URL, env.REDIS_URL_REST_TOKEN],
    [env.REDIS_URL_URL, env.REDIS_URL_TOKEN],
    [env.REDIS_URL?.startsWith("http") ? env.REDIS_URL : undefined, env.REDIS_URL_REST_TOKEN ?? env.REDIS_URL_TOKEN],
  ];
  for (const [url, token] of candidates) if (url?.startsWith("http") && token) return { url, token };
  return null;
}

function feedbackStore(): Store | null {
  const tcpUrl = process.env.REDIS_URL?.trim();
  if (tcpUrl?.startsWith("redis://") || tcpUrl?.startsWith("rediss://")) {
    redisGlobal.gengminqiFeedbackTcpRedis ??= new IORedis(tcpUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2500,
      enableReadyCheck: false,
    });
    return { kind: "tcp", client: redisGlobal.gengminqiFeedbackTcpRedis };
  }
  const credentials = restCredentials();
  if (!credentials) return null;
  redisGlobal.gengminqiFeedbackRestRedis ??= new UpstashRedis(credentials);
  return { kind: "rest", client: redisGlobal.gengminqiFeedbackRestRedis };
}

async function ensureConnected(redis: IORedis) {
  if (redis.status === "wait") await redis.connect();
}

function parseReader(raw: unknown): ReaderState {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return { ...emptyReader };
    const reader = value as Partial<ReaderState>;
    return {
      viewed: reader.viewed === true,
      helpful: reader.helpful === "yes" || reader.helpful === "no" ? reader.helpful : null,
      completed: reader.completed === true,
    };
  } catch {
    return { ...emptyReader };
  }
}

async function readReader(store: Store, readerId?: string) {
  if (!readerId) return { ...emptyReader };
  if (store.kind === "tcp") {
    await ensureConnected(store.client);
    return parseReader(await store.client.hget(readersKey, readerId));
  }
  return parseReader(await store.client.hget<unknown>(readersKey, readerId));
}

async function writeReader(store: Store, readerId: string, state: ReaderState) {
  const serialized = JSON.stringify(state);
  if (store.kind === "tcp") return store.client.hset(readersKey, readerId, serialized);
  return store.client.hset(readersKey, { [readerId]: serialized });
}

async function incrementView(store: Store) {
  if (store.kind === "tcp") return store.client.incr(viewsKey);
  return store.client.incr(viewsKey);
}

async function incrementHelpful(store: Store, value: Exclude<Helpful, null>, amount: number) {
  if (store.kind === "tcp") return store.client.hincrby(helpfulKey, value, amount);
  return store.client.hincrby(helpfulKey, value, amount);
}

async function saveContact(store: Store, readerId: string, contact: string) {
  const record = JSON.stringify({ contact, createdAt: new Date().toISOString(), article: "fhe-introduction" });
  if (store.kind === "tcp") return store.client.hset(contactsKey, readerId, record);
  return store.client.hset(contactsKey, { [readerId]: record });
}

async function readStats(store: Store) {
  if (store.kind === "tcp") await ensureConnected(store.client);
  const [rawViews, rawHelpful] = await Promise.all([
    store.client.get(viewsKey),
    store.client.hgetall<Record<string, unknown>>(helpfulKey),
  ]);
  return {
    views: Math.max(0, Number(rawViews) || 0),
    helpful: {
      yes: Math.max(0, Number(rawHelpful?.yes) || 0),
      no: Math.max(0, Number(rawHelpful?.no) || 0),
    },
  };
}

async function responseData(store: Store, readerId?: string) {
  const [stats, reader] = await Promise.all([readStats(store), readReader(store, readerId)]);
  return { ...stats, reader, available: true };
}

export async function GET() {
  const store = feedbackStore();
  if (!store) return NextResponse.json({ views: 0, helpful: { yes: 0, no: 0 }, reader: null, available: false });
  const readerId = (await cookies()).get(readerCookie)?.value;
  try {
    return NextResponse.json(await responseData(store, readerId));
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

  const rawContact = typeof body?.contact === "string" ? body.contact.trim().replaceAll("\0", "") : "";
  if (rawContact.length > 180) return NextResponse.json({ error: "contact too long" }, { status: 400 });

  const store = feedbackStore();
  if (!store) return NextResponse.json({ error: "feedback storage unavailable" }, { status: 503 });

  const cookieStore = await cookies();
  const readerId = cookieStore.get(readerCookie)?.value ?? randomUUID();

  try {
    const reader = await readReader(store, readerId);
    if (!reader.viewed) {
      await incrementView(store);
      reader.viewed = true;
    }

    if (action === "helpful") {
      const nextHelpful = body.value ? "yes" : "no";
      if (reader.helpful && reader.helpful !== nextHelpful) await incrementHelpful(store, reader.helpful, -1);
      if (reader.helpful !== nextHelpful) await incrementHelpful(store, nextHelpful, 1);
      reader.helpful = nextHelpful;
    }

    if (action === "finish") {
      if (!reader.helpful) return NextResponse.json({ error: "vote first" }, { status: 409 });
      if (rawContact) await saveContact(store, readerId, rawContact);
      reader.completed = true;
    }

    await writeReader(store, readerId, reader);
    const response = NextResponse.json(await responseData(store, readerId));
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
