import { getRedis } from "@/lib/relay/redis";

export type RoomPlayer = {
  id: string;
  name: string;
  seat: number;
  joinedAt: number;
  lastSeen: number;
};

export type RoomRecord = {
  roomId: string;
  createdAt: number;
  updatedAt: number;
  locked: boolean;
  ownerId: string;
  players: RoomPlayer[];
};

export type PublicRoomPlayer = RoomPlayer & {
  online: boolean;
};

export type PublicRoom = Omit<RoomRecord, "players"> & {
  players: PublicRoomPlayer[];
  maxPlayers: number;
  ttlSeconds: number;
};

type JoinRoomInput = {
  playerId: string;
  name: string;
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_TTL_SECONDS = 60 * 60 * 6;
export const MAX_ROOM_PLAYERS = 10;
export const PRESENCE_STALE_MS = 45_000;

const globalForRooms = globalThis as typeof globalThis & {
  __avalonRooms?: Map<string, RoomRecord>;
};

const localRooms = globalForRooms.__avalonRooms ?? new Map<string, RoomRecord>();
globalForRooms.__avalonRooms = localRooms;

export async function createRoom(input: JoinRoomInput): Promise<PublicRoom> {
  const now = Date.now();
  const player = buildPlayer(input, 1, now);
  const redis = getRedis();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const roomId = generateRoomCode();
    const room: RoomRecord = {
      roomId,
      createdAt: now,
      updatedAt: now,
      locked: false,
      ownerId: player.id,
      players: [player],
    };

    if (!redis) {
      if (!localRooms.has(roomId)) {
        localRooms.set(roomId, room);
        return toPublicRoom(room, now);
      }
      continue;
    }

    const created = await redis.set(roomKey(roomId), JSON.stringify(room), "EX", ROOM_TTL_SECONDS, "NX");
    if (created === "OK") {
      return toPublicRoom(room, now);
    }
  }

  throw new Error("Could not allocate a room code.");
}

export async function joinRoom(roomIdInput: string, input: JoinRoomInput): Promise<PublicRoom> {
  const roomId = normalizeRoomId(roomIdInput);
  const now = Date.now();
  const existing = await readRoomRecord(roomId);

  if (!existing) {
    throw new Error("Room not found.");
  }

  const playerIndex = existing.players.findIndex((player) => player.id === input.playerId);
  if (existing.locked && playerIndex === -1) {
    throw new Error("Room is locked.");
  }

  if (playerIndex === -1 && existing.players.length >= MAX_ROOM_PLAYERS) {
    throw new Error("Room is full.");
  }

  const players =
    playerIndex === -1
      ? [...existing.players, buildPlayer(input, existing.players.length + 1, now)]
      : existing.players.map((player, index) =>
          index === playerIndex
            ? {
                ...player,
                name: cleanPlayerName(input.name),
                lastSeen: now,
              }
            : player,
        );

  const next: RoomRecord = {
    ...existing,
    updatedAt: now,
    players,
  };

  await writeRoomRecord(next);
  return toPublicRoom(next, now);
}

export async function ensureRoomForSocketJoin(roomIdInput: string, input: JoinRoomInput): Promise<PublicRoom> {
  const roomId = normalizeRoomId(roomIdInput);
  const existing = await readRoomRecord(roomId);

  if (existing) {
    return joinRoom(roomId, input);
  }

  const now = Date.now();
  const room: RoomRecord = {
    roomId,
    createdAt: now,
    updatedAt: now,
    locked: false,
    ownerId: input.playerId,
    players: [buildPlayer(input, 1, now)],
  };

  await writeRoomRecord(room);
  return toPublicRoom(room, now);
}

export async function getRoom(roomIdInput: string): Promise<PublicRoom | null> {
  const room = await readRoomRecord(normalizeRoomId(roomIdInput));
  return room ? toPublicRoom(room, Date.now()) : null;
}

export async function touchRoomPlayer(roomIdInput: string, playerId: string): Promise<PublicRoom | null> {
  const room = await readRoomRecord(normalizeRoomId(roomIdInput));
  if (!room) {
    return null;
  }

  const now = Date.now();
  const players = room.players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          lastSeen: now,
        }
      : player,
  );

  const next = {
    ...room,
    updatedAt: now,
    players,
  };

  await writeRoomRecord(next);
  return toPublicRoom(next, now);
}

export async function lockRoom(roomIdInput: string, requesterId: string): Promise<PublicRoom> {
  const room = await readRoomRecord(normalizeRoomId(roomIdInput));
  if (!room) {
    throw new Error("Room not found.");
  }

  if (!room.players.some((player) => player.id === requesterId)) {
    throw new Error("Only joined players can lock a room.");
  }

  const next = {
    ...room,
    updatedAt: Date.now(),
    locked: true,
  };

  await writeRoomRecord(next);
  return toPublicRoom(next, Date.now());
}

export function normalizeRoomId(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

export function isSixCharacterRoomCode(value: string): boolean {
  return /^[A-Z0-9]{6}$/.test(normalizeRoomId(value));
}

export function clearLocalRoomsForTests(): void {
  localRooms.clear();
}

async function readRoomRecord(roomId: string): Promise<RoomRecord | null> {
  const redis = getRedis();
  if (!redis) {
    return localRooms.get(roomId) ?? null;
  }

  const raw = await redis.get(roomKey(roomId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RoomRecord;
  } catch {
    return null;
  }
}

async function writeRoomRecord(room: RoomRecord): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    localRooms.set(room.roomId, room);
    return;
  }

  await redis.set(roomKey(room.roomId), JSON.stringify(room), "EX", ROOM_TTL_SECONDS);
}

function toPublicRoom(room: RoomRecord, now: number): PublicRoom {
  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      online: now - player.lastSeen <= PRESENCE_STALE_MS,
    })),
    maxPlayers: MAX_ROOM_PLAYERS,
    ttlSeconds: ROOM_TTL_SECONDS,
  };
}

function buildPlayer(input: JoinRoomInput, seat: number, now: number): RoomPlayer {
  return {
    id: cleanPlayerId(input.playerId),
    name: cleanPlayerName(input.name),
    seat,
    joinedAt: now,
    lastSeen: now,
  };
}

function cleanPlayerId(value: string): string {
  const trimmed = value.trim().slice(0, 128);
  if (!trimmed) {
    throw new Error("Player id is required.");
  }
  return trimmed;
}

function cleanPlayerName(value: string): string {
  const trimmed = value.trim().slice(0, 32);
  if (!trimmed) {
    throw new Error("Player name is required.");
  }
  return trimmed;
}

function generateRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
}

function roomKey(roomId: string): string {
  return `avalon:rooms:${roomId}`;
}
