import { randomUUID } from "node:crypto";
import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChoiceId = "mpc" | "zkp" | "e2ee";
type VoteStore = { kind: "tcp"; client: IORedis } | { kind: "rest"; client: UpstashRedis };

const choices: ChoiceId[] = ["mpc", "zkp", "e2ee"];
const countsKey = "gengminqi:reader-vote:counts:v1";
const votersKey = "gengminqi:reader-vote:voters:v1";
const voterCookie = "gengminqi_reader";

const redisGlobal = globalThis as typeof globalThis & {
  gengminqiVoteTcpRedis?: IORedis;
  gengminqiVoteRestRedis?: UpstashRedis;
};

function isChoice(value: unknown): value is ChoiceId {
  return typeof value === "string" && choices.includes(value as ChoiceId);
}

function firstRestCredentials() {
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

  for (const [url, token] of candidates) {
    if (url?.startsWith("http") && token) return { url, token };
  }
  return null;
}

function voteStore(): VoteStore | null {
  const tcpUrl = process.env.REDIS_URL?.trim();
  if (tcpUrl?.startsWith("redis://") || tcpUrl?.startsWith("rediss://")) {
    redisGlobal.gengminqiVoteTcpRedis ??= new IORedis(tcpUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2500,
      enableReadyCheck: false,
    });
    return { kind: "tcp", client: redisGlobal.gengminqiVoteTcpRedis };
  }

  const credentials = firstRestCredentials();
  if (!credentials) return null;
  redisGlobal.gengminqiVoteRestRedis ??= new UpstashRedis(credentials);
  return { kind: "rest", client: redisGlobal.gengminqiVoteRestRedis };
}

function normalizeCounts(raw: Record<string, unknown> | null | undefined) {
  return {
    mpc: Math.max(0, Number(raw?.mpc) || 0),
    zkp: Math.max(0, Number(raw?.zkp) || 0),
    e2ee: Math.max(0, Number(raw?.e2ee) || 0),
  };
}

async function ensureTcpConnected(redis: IORedis) {
  if (redis.status === "wait") await redis.connect();
}

async function readCounts(store: VoteStore) {
  if (store.kind === "tcp") {
    await ensureTcpConnected(store.client);
    return normalizeCounts(await store.client.hgetall(countsKey));
  }
  return normalizeCounts(await store.client.hgetall<Record<string, unknown>>(countsKey));
}

async function readSelection(store: VoteStore, voterId?: string) {
  if (!voterId) return null;
  if (store.kind === "tcp") {
    await ensureTcpConnected(store.client);
    return store.client.hget(votersKey, voterId);
  }
  return store.client.hget<string>(votersKey, voterId);
}

async function recordVote(store: VoteStore, voterId: string, choice: ChoiceId) {
  const previous = await readSelection(store, voterId);

  if (store.kind === "tcp") {
    const transaction = store.client.multi();
    if (isChoice(previous) && previous !== choice) transaction.hincrby(countsKey, previous, -1);
    if (previous !== choice) transaction.hincrby(countsKey, choice, 1);
    transaction.hset(votersKey, voterId, choice);
    await transaction.exec();
    return;
  }

  const transaction = store.client.multi();
  if (isChoice(previous) && previous !== choice) transaction.hincrby(countsKey, previous, -1);
  if (previous !== choice) transaction.hincrby(countsKey, choice, 1);
  transaction.hset(votersKey, { [voterId]: choice });
  await transaction.exec();
}

export async function GET() {
  const cookieStore = await cookies();
  const voterId = cookieStore.get(voterCookie)?.value;
  const store = voteStore();
  if (!store) return NextResponse.json({ counts: normalizeCounts(null), selected: null, available: false });

  try {
    const [counts, selected] = await Promise.all([readCounts(store), readSelection(store, voterId)]);
    return NextResponse.json({ counts, selected: isChoice(selected) ? selected : null, available: true });
  } catch {
    return NextResponse.json({ counts: normalizeCounts(null), selected: null, available: false });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const choice = body?.choice;
  if (!isChoice(choice)) return NextResponse.json({ error: "invalid choice" }, { status: 400 });

  const store = voteStore();
  if (!store) return NextResponse.json({ error: "vote storage unavailable" }, { status: 503 });

  const cookieStore = await cookies();
  const voterId = cookieStore.get(voterCookie)?.value ?? randomUUID();

  try {
    await recordVote(store, voterId, choice);
    const counts = await readCounts(store);
    const response = NextResponse.json({ counts, selected: choice, available: true });
    response.cookies.set(voterCookie, voterId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch {
    return NextResponse.json({ error: "vote storage unavailable" }, { status: 503 });
  }
}
