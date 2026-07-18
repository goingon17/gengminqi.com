import { fieldsToObject, getRedis } from "@/lib/relay/redis";
import { isRelayEnvelope, type RelayEnvelope } from "@/lib/protocol/envelope";

type RedisStreamEntry = [string, string[]];

const ROOM_STREAM_PREFIX = "avalon:relay:room:";
const ROOM_MAXLEN = 1_000;
const ROOM_TTL_SECONDS = 60 * 60 * 6;

const globalForEventLog = globalThis as typeof globalThis & {
  __avalonRelayEvents?: Map<string, RelayEnvelope[]>;
};

const localRoomEvents = globalForEventLog.__avalonRelayEvents ?? new Map<string, RelayEnvelope[]>();
globalForEventLog.__avalonRelayEvents = localRoomEvents;

export async function appendRoomEnvelopeToLog(envelope: RelayEnvelope): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    const current = localRoomEvents.get(envelope.roomId) ?? [];
    localRoomEvents.set(envelope.roomId, [...current, envelope].slice(-ROOM_MAXLEN));
    return;
  }

  const key = roomStreamKey(envelope.roomId);
  await redis.xadd(key, "MAXLEN", "~", ROOM_MAXLEN, "*", "d", JSON.stringify(envelope));
  await redis.expire(key, ROOM_TTL_SECONDS);
}

export async function loadRoomEnvelopeLog(roomId: string): Promise<RelayEnvelope[]> {
  const redis = getRedis();
  if (!redis) {
    return [...(localRoomEvents.get(roomId) ?? [])];
  }

  const entries = (await redis.xrevrange(roomStreamKey(roomId), "+", "-", "COUNT", ROOM_MAXLEN)) as RedisStreamEntry[];
  return entries
    .map((entry) => fieldsToObject(entry[1]).d)
    .filter(Boolean)
    .map(parseEnvelopePayload)
    .filter((envelope): envelope is RelayEnvelope => envelope !== null)
    .reverse();
}

export function clearLocalRoomEnvelopeLog(): void {
  localRoomEvents.clear();
}

function parseEnvelopePayload(value: string | undefined): RelayEnvelope | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRelayEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function roomStreamKey(roomId: string): string {
  return `${ROOM_STREAM_PREFIX}${roomId}`;
}
