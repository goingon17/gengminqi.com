import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChoiceId = "mpc" | "zkp" | "e2ee";
const choices: ChoiceId[] = ["mpc", "zkp", "e2ee"];
const countsKey = "gengminqi:reader-vote:counts:v1";
const votersKey = "gengminqi:reader-vote:voters:v1";
const voterCookie = "gengminqi_reader";

const redisGlobal = globalThis as typeof globalThis & { gengminqiVoteRedis?: Redis };

function isChoice(value: unknown): value is ChoiceId {
  return typeof value === "string" && choices.includes(value as ChoiceId);
}

function redisClient() {
  const url = process.env.REDIS_URL?.trim();
  if (!url || (!url.startsWith("redis://") && !url.startsWith("rediss://"))) return null;
  redisGlobal.gengminqiVoteRedis ??= new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2500,
    enableReadyCheck: false,
  });
  return redisGlobal.gengminqiVoteRedis;
}

function normalizeCounts(raw: Record<string, string>) {
  return {
    mpc: Math.max(0, Number(raw.mpc) || 0),
    zkp: Math.max(0, Number(raw.zkp) || 0),
    e2ee: Math.max(0, Number(raw.e2ee) || 0),
  };
}

async function ensureConnected(redis: Redis) {
  if (redis.status === "wait") await redis.connect();
}

export async function GET() {
  const cookieStore = await cookies();
  const voterId = cookieStore.get(voterCookie)?.value;
  const redis = redisClient();
  if (!redis) return NextResponse.json({ counts: normalizeCounts({}), selected: null, available: false });

  try {
    await ensureConnected(redis);
    const [rawCounts, selected] = await Promise.all([
      redis.hgetall(countsKey),
      voterId ? redis.hget(votersKey, voterId) : Promise.resolve(null),
    ]);
    return NextResponse.json({ counts: normalizeCounts(rawCounts), selected: isChoice(selected) ? selected : null, available: true });
  } catch {
    return NextResponse.json({ counts: normalizeCounts({}), selected: null, available: false });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const choice = body?.choice;
  if (!isChoice(choice)) return NextResponse.json({ error: "invalid choice" }, { status: 400 });

  const redis = redisClient();
  if (!redis) return NextResponse.json({ error: "vote storage unavailable" }, { status: 503 });

  const cookieStore = await cookies();
  const voterId = cookieStore.get(voterCookie)?.value ?? randomUUID();

  try {
    await ensureConnected(redis);
    const previous = await redis.hget(votersKey, voterId);
    const transaction = redis.multi();
    if (isChoice(previous) && previous !== choice) transaction.hincrby(countsKey, previous, -1);
    if (previous !== choice) transaction.hincrby(countsKey, choice, 1);
    transaction.hset(votersKey, voterId, choice);
    await transaction.exec();

    const counts = normalizeCounts(await redis.hgetall(countsKey));
    const response = NextResponse.json({ counts, selected: choice, available: true });
    response.cookies.set(voterCookie, voterId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch {
    return NextResponse.json({ error: "vote storage unavailable" }, { status: 503 });
  }
}
