import Redis from "ioredis";

let sharedRedis: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (sharedRedis !== undefined) {
    return sharedRedis;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    sharedRedis = null;
    return sharedRedis;
  }

  sharedRedis = new Redis(url, {
    maxRetriesPerRequest: null,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });

  return sharedRedis;
}

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function fieldsToObject(flat: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out[flat[i]] = flat[i + 1];
  }
  return out;
}
