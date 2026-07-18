import {
  isRelayEnvelope,
  parseClientFrame,
  type RelayEnvelope,
} from "@/lib/protocol/envelope";
import {
  appendRoomEnvelopeToLog,
  loadRoomEnvelopeLog,
} from "@/lib/relay/event-log";
import { fieldsToObject, getRedis, redisConfigured } from "@/lib/relay/redis";
import {
  ensureRoomForSocketJoin,
  getRoom,
  lockRoom,
  normalizeRoomId,
  touchRoomPlayer,
  type PublicRoom,
} from "@/lib/relay/rooms";
import { verifyRelayEnvelope } from "@/lib/protocol/signed-envelope";

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
  sentAt: number[];
  heartbeatTimer: ReturnType<typeof setInterval>;
};

type ServerEvent =
  | {
      type: "joined";
      roomId: string;
      connectionId: string;
      redisConfigured: boolean;
      room?: PublicRoom;
    }
  | {
      type: "presence";
      roomId: string;
      peers: Array<{ playerId: string; name: string }>;
    }
  | {
      type: "room";
      room: PublicRoom;
    }
  | {
      type: "heartbeat";
      now: number;
      roomId?: string;
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

type FanoutPayload =
  | {
      kind: "envelope";
      envelope: RelayEnvelope;
      origin: string;
    }
  | {
      kind: "room";
      roomId: string;
      origin: string;
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

const FANOUT_STREAM = "avalon:relay:fanout";
const FANOUT_MAXLEN = 5_000;
const ROOM_TTL_SECONDS = 60 * 60 * 6;
const BLOCK_MS = 5_000;
const HEARTBEAT_MS = 15_000;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 30;

const globalForHub = globalThis as typeof globalThis & {
  __avalonRelayHub?: HubState;
};

const hub =
  globalForHub.__avalonRelayHub ??
  {
    instanceId: crypto.randomUUID(),
    conns: new Map<RelaySocket, Connection>(),
    streaming: false,
    streamClient: null,
    lastFanoutId: "0-0",
  };

globalForHub.__avalonRelayHub = hub;

export function register(ws: RelaySocket): void {
  const heartbeatTimer = setInterval(() => {
    const conn = hub.conns.get(ws);
    send(ws, { type: "heartbeat", now: Date.now(), roomId: conn?.roomId ?? undefined });
  }, HEARTBEAT_MS);

  hub.conns.set(ws, {
    connectionId: crypto.randomUUID(),
    roomId: null,
    playerId: null,
    name: null,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    sentAt: [],
    heartbeatTimer,
  });

  void startStream();
}

export async function unregister(ws: RelaySocket): Promise<void> {
  const conn = hub.conns.get(ws);
  if (conn) {
    clearInterval(conn.heartbeatTimer);
  }

  hub.conns.delete(ws);

  if (conn?.roomId) {
    await broadcastRoomUpdate(conn.roomId);
  }
}

export async function handleClientFrame(ws: RelaySocket, raw: string): Promise<void> {
  const conn = hub.conns.get(ws);

  if (!conn || !allowFrame(conn)) {
    send(ws, { type: "error", message: "Relay rate limit exceeded." });
    return;
  }

  const frame = parseClientFrame(raw);

  if (!frame) {
    send(ws, { type: "error", message: "Invalid relay frame." });
    return;
  }

  conn.lastSeen = Date.now();

  if (frame.type === "join") {
    const room = await ensureRoomForSocketJoin(frame.roomId, {
      playerId: frame.playerId,
      name: frame.name,
      publicKeys: frame.publicKeys,
    });

    conn.roomId = room.roomId;
    conn.playerId = frame.playerId;
    conn.name = frame.name;

    send(ws, {
      type: "joined",
      roomId: room.roomId,
      connectionId: conn.connectionId,
      redisConfigured: redisConfigured(),
      room,
    });

    await replayRoom(ws, room.roomId);
    await broadcastRoomUpdate(room.roomId);
    return;
  }

  if (frame.type === "heartbeat") {
    if (!sameConnection(conn, frame.roomId, frame.playerId)) {
      send(ws, { type: "error", message: "Heartbeat does not match this socket." });
      return;
    }

    const room = await touchRoomPlayer(frame.roomId, frame.playerId);
    if (room) {
      send(ws, { type: "heartbeat", now: Date.now(), roomId: room.roomId });
      await broadcastRoomUpdate(room.roomId);
    }
    return;
  }

  if (frame.type === "room.lock") {
    if (!sameConnection(conn, frame.roomId, frame.playerId)) {
      send(ws, { type: "error", message: "Lock request does not match this socket." });
      return;
    }

    try {
      const room = await lockRoom(frame.roomId, frame.playerId);
      broadcastToRoom(room.roomId, { type: "room", room });
      await publishRoomUpdate(room.roomId);
    } catch (error) {
      send(ws, { type: "error", message: errorMessage(error) });
    }
    return;
  }

  if (frame.type === "replay") {
    await replayRoom(ws, normalizeRoomId(frame.roomId));
    return;
  }

  if (!conn.roomId || !conn.playerId) {
    send(ws, { type: "error", message: "Join a room before sending envelopes." });
    return;
  }

  const envelopeRoomId = normalizeRoomId(frame.envelope.roomId);
  if (envelopeRoomId !== conn.roomId || frame.envelope.senderId !== conn.playerId) {
    send(ws, { type: "error", message: "Envelope sender or room does not match this socket." });
    return;
  }

  const room = await touchRoomPlayer(conn.roomId, conn.playerId);
  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }

  const envelope = {
    ...frame.envelope,
    roomId: envelopeRoomId,
  };
  const sender = room.players.find((player) => player.id === conn.playerId);

  if (sender?.publicKeys) {
    const signatureOk = await verifyRelayEnvelope(envelope, sender.publicKeys.signingPublicKey);
    if (!signatureOk) {
      send(ws, { type: "error", message: "Envelope signature is invalid." });
      return;
    }
  }

  broadcastEnvelope(envelope, "local");
  await persistEnvelope(envelope);
}

export function getRelayStatus() {
  return {
    instanceId: hub.instanceId,
    localConnections: hub.conns.size,
    redisConfigured: redisConfigured(),
    fanoutStream: FANOUT_STREAM,
    roomTtlSeconds: ROOM_TTL_SECONDS,
    heartbeatMs: HEARTBEAT_MS,
    rateLimit: {
      frameCount: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    },
  };
}

async function broadcastRoomUpdate(roomId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) {
    return;
  }

  broadcastToRoom(room.roomId, { type: "room", room });
  broadcastPresence(room);
  await publishRoomUpdate(room.roomId);
}

function broadcastPresence(room: PublicRoom): void {
  const peers = room.players
    .filter((player) => player.online)
    .map((player) => ({
      playerId: player.id,
      name: player.name,
    }));

  broadcastToRoom(room.roomId, { type: "presence", roomId: room.roomId, peers });
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
    send(ws, { type: "replay", roomId, envelopes: await loadRoomEnvelopeLog(roomId), redisConfigured: false });
    return;
  }

  try {
    send(ws, { type: "replay", roomId, envelopes: await loadRoomEnvelopeLog(roomId), redisConfigured: true });
  } catch {
    send(ws, { type: "replay", roomId, envelopes: [], redisConfigured: true });
  }
}

async function persistEnvelope(envelope: RelayEnvelope): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    await appendRoomEnvelopeToLog(envelope);
    return;
  }

  await redis.xadd(
    FANOUT_STREAM,
    "MAXLEN",
    "~",
    FANOUT_MAXLEN,
    "*",
    "d",
    JSON.stringify({ kind: "envelope", envelope, origin: hub.instanceId } satisfies FanoutPayload),
  );

  await appendRoomEnvelopeToLog(envelope);
}

async function publishRoomUpdate(roomId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  await redis.xadd(
    FANOUT_STREAM,
    "MAXLEN",
    "~",
    FANOUT_MAXLEN,
    "*",
    "d",
    JSON.stringify({ kind: "room", roomId, origin: hub.instanceId } satisfies FanoutPayload),
  );
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
          const payload = parseFanoutPayload(fieldsToObject(flat).d);
          if (!payload || payload.origin === hub.instanceId) {
            continue;
          }

          if (payload.kind === "envelope") {
            broadcastEnvelope(payload.envelope, "redis");
          } else {
            const room = await getRoom(payload.roomId);
            if (room) {
              broadcastToRoom(room.roomId, { type: "room", room });
              broadcastPresence(room);
            }
          }
        }
      }
    } catch {
      await sleep(1_000);
    }
  }
}

function parseFanoutPayload(value: string | undefined): FanoutPayload | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || typeof parsed.origin !== "string") {
      return null;
    }

    if (parsed.kind === "envelope" && isRelayEnvelope(parsed.envelope)) {
      return {
        kind: "envelope",
        envelope: parsed.envelope,
        origin: parsed.origin,
      };
    }

    if (parsed.kind === "room" && typeof parsed.roomId === "string") {
      return {
        kind: "room",
        roomId: normalizeRoomId(parsed.roomId),
        origin: parsed.origin,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function sameConnection(conn: Connection, roomId: string, playerId: string): boolean {
  return conn.roomId === normalizeRoomId(roomId) && conn.playerId === playerId;
}

function allowFrame(conn: Connection): boolean {
  const now = Date.now();
  conn.sentAt = conn.sentAt.filter((time) => now - time <= RATE_WINDOW_MS);
  if (conn.sentAt.length >= RATE_LIMIT) {
    return false;
  }
  conn.sentAt.push(now);
  return true;
}

function send(ws: RelaySocket, event: ServerEvent): void {
  if (ws.readyState !== 1) {
    return;
  }

  ws.send(JSON.stringify(event));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Room operation failed.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
