import { parseClientFrame, type RelayEnvelope } from "@/lib/protocol/envelope";
import { fieldsToObject, getRedis, redisConfigured } from "@/lib/relay/redis";

type RelaySocket = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type Connection = {
  connectionId: string;
  roomId: string | null;
  playerId: string | null;
  name: string | null;
  joinedAt: number;
  lastSeen: number;
};

type ServerEvent =
  | {
      type: "joined";
      roomId: string;
      connectionId: string;
      redisConfigured: boolean;
    }
  | {
      type: "presence";
      roomId: string;
      peers: Array<{ playerId: string; name: string }>;
    }
  | {
      type: "envelope";
      envelope: RelayEnvelope;
      relay: "local" | "redis";
    }
  | {
      type: "replay";
      roomId: string;
      envelopes: RelayEnvelope[];
      redisConfigured: boolean;
    }
  | {
      type: "error";
      message: string;
    };

type RedisStreamEntry = [string, string[]];
type RedisStreamResponse = Array<[string, RedisStreamEntry[]]>;

type HubState = {
  instanceId: string;
  conns: Map<RelaySocket, Connection>;
  streaming: boolean;
  streamClient: ReturnType<typeof getRedis>;
  lastFanoutId: string;
};

const FANOUT_STREAM = "avalon:stage0:fanout";
const ROOM_STREAM_PREFIX = "avalon:stage0:room:";
const FANOUT_MAXLEN = 5_000;
const ROOM_MAXLEN = 1_000;
const ROOM_TTL_SECONDS = 60 * 60 * 6;
const BLOCK_MS = 5_000;

const globalForHub = globalThis as typeof globalThis & {
  __avalonStage0Hub?: HubState;
};

const hub =
  globalForHub.__avalonStage0Hub ??
  {
    instanceId: crypto.randomUUID(),
    conns: new Map<RelaySocket, Connection>(),
    streaming: false,
    streamClient: null,
    lastFanoutId: "0-0",
  };

globalForHub.__avalonStage0Hub = hub;

export function register(ws: RelaySocket): void {
  hub.conns.set(ws, {
    connectionId: crypto.randomUUID(),
    roomId: null,
    playerId: null,
    name: null,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  });

  void startStream();
}

export async function unregister(ws: RelaySocket): Promise<void> {
  const conn = hub.conns.get(ws);
  hub.conns.delete(ws);

  if (conn?.roomId) {
    broadcastPresence(conn.roomId);
  }
}

export async function handleClientFrame(ws: RelaySocket, raw: string): Promise<void> {
  const frame = parseClientFrame(raw);
  const conn = hub.conns.get(ws);

  if (!frame || !conn) {
    send(ws, { type: "error", message: "Invalid stage0 frame" });
    return;
  }

  conn.lastSeen = Date.now();

  if (frame.type === "join") {
    conn.roomId = normalizeRoomId(frame.roomId);
    conn.playerId = frame.playerId;
    conn.name = frame.name;

    send(ws, {
      type: "joined",
      roomId: conn.roomId,
      connectionId: conn.connectionId,
      redisConfigured: redisConfigured(),
    });

    await replayRoom(ws, conn.roomId);
    broadcastPresence(conn.roomId);
    return;
  }

  if (frame.type === "replay") {
    await replayRoom(ws, normalizeRoomId(frame.roomId));
    return;
  }

  if (!conn.roomId || !conn.playerId) {
    send(ws, { type: "error", message: "Join a room before sending envelopes" });
    return;
  }

  if (normalizeRoomId(frame.envelope.roomId) !== conn.roomId || frame.envelope.senderId !== conn.playerId) {
    send(ws, { type: "error", message: "Envelope sender or room does not match this socket" });
    return;
  }

  broadcastEnvelope(frame.envelope, "local");
  await persistEnvelope(frame.envelope);
}

export function getRelayStatus() {
  return {
    instanceId: hub.instanceId,
    localConnections: hub.conns.size,
    redisConfigured: redisConfigured(),
    fanoutStream: FANOUT_STREAM,
    roomTtlSeconds: ROOM_TTL_SECONDS,
  };
}

function broadcastPresence(roomId: string): void {
  const peers = Array.from(hub.conns.values())
    .filter((conn) => conn.roomId === roomId && conn.playerId && conn.name)
    .map((conn) => ({
      playerId: conn.playerId as string,
      name: conn.name as string,
    }));

  broadcastToRoom(roomId, { type: "presence", roomId, peers });
}

function broadcastEnvelope(envelope: RelayEnvelope, relay: "local" | "redis"): void {
  broadcastToRoom(envelope.roomId, { type: "envelope", envelope, relay });
}

function broadcastToRoom(roomId: string, event: ServerEvent): void {
  for (const [socket, conn] of hub.conns) {
    if (conn.roomId === roomId) {
      send(socket, event);
    }
  }
}

async function replayRoom(ws: RelaySocket, roomId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    send(ws, { type: "replay", roomId, envelopes: [], redisConfigured: false });
    return;
  }

  try {
    const entries = (await redis.xrevrange(roomStreamKey(roomId), "+", "-", "COUNT", 100)) as RedisStreamEntry[];
    const envelopes = entries
      .map((entry) => fieldsToObject(entry[1]).d)
      .filter(Boolean)
      .map(parseEnvelopePayload)
      .filter((envelope): envelope is RelayEnvelope => envelope !== null)
      .reverse();

    send(ws, { type: "replay", roomId, envelopes, redisConfigured: true });
  } catch {
    send(ws, { type: "replay", roomId, envelopes: [], redisConfigured: true });
  }
}

async function persistEnvelope(envelope: RelayEnvelope): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  const data = JSON.stringify(envelope);

  await redis.xadd(
    FANOUT_STREAM,
    "MAXLEN",
    "~",
    FANOUT_MAXLEN,
    "*",
    "d",
    data,
    "o",
    hub.instanceId,
  );

  const key = roomStreamKey(envelope.roomId);
  await redis.xadd(key, "MAXLEN", "~", ROOM_MAXLEN, "*", "d", data);
  await redis.expire(key, ROOM_TTL_SECONDS);
}

async function startStream(): Promise<void> {
  if (hub.streaming) {
    return;
  }

  const redis = getRedis();
  if (!redis) {
    return;
  }

  hub.streaming = true;
  hub.streamClient = redis.duplicate();

  try {
    const tail = (await redis.xrevrange(FANOUT_STREAM, "+", "-", "COUNT", 1)) as RedisStreamEntry[];
    hub.lastFanoutId = tail[0]?.[0] ?? "0-0";
  } catch {
    hub.lastFanoutId = "0-0";
  }

  void runReadLoop();
}

async function runReadLoop(): Promise<void> {
  const client = hub.streamClient;
  if (!client) {
    hub.streaming = false;
    return;
  }

  while (hub.streaming) {
    try {
      const res = (await client.xread(
        "BLOCK",
        BLOCK_MS,
        "STREAMS",
        FANOUT_STREAM,
        hub.lastFanoutId,
      )) as RedisStreamResponse | null;

      if (!res) {
        continue;
      }

      for (const [, entries] of res) {
        for (const [id, flat] of entries) {
          hub.lastFanoutId = id;
          const fields = fieldsToObject(flat);
          if (fields.o === hub.instanceId) {
            continue;
          }

          const envelope = parseEnvelopePayload(fields.d);
          if (envelope) {
            broadcastEnvelope(envelope, "redis");
          }
        }
      }
    } catch {
      await sleep(1_000);
    }
  }
}

function parseEnvelopePayload(value: string | undefined): RelayEnvelope | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as RelayEnvelope;
    return parsed.protocolVersion === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function send(ws: RelaySocket, event: ServerEvent): void {
  if (ws.readyState !== 1) {
    return;
  }

  ws.send(JSON.stringify(event));
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
}

function roomStreamKey(roomId: string): string {
  return `${ROOM_STREAM_PREFIX}${roomId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
