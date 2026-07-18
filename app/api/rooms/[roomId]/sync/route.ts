import { appendRoomEnvelopeToLog, loadRoomEnvelopeLog } from "@/lib/relay/event-log";
import { redisConfigured } from "@/lib/relay/redis";
import {
  ensureRoomForSocketJoin,
  getRoom,
  isSixCharacterRoomCode,
  lockRoom,
  normalizeRoomId,
  touchRoomPlayer,
  type PublicRoom,
} from "@/lib/relay/rooms";
import { isRelayEnvelope, type RelayEnvelope } from "@/lib/protocol/envelope";
import { isPlayerPublicKeys, type PlayerPublicKeys } from "@/lib/protocol/player-keys";
import { verifyRelayEnvelope } from "@/lib/protocol/signed-envelope";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

type SyncBody =
  | {
      type: "join";
      playerId: string;
      name: string;
      publicKeys?: PlayerPublicKeys;
    }
  | {
      type: "heartbeat";
      playerId: string;
    }
  | {
      type: "lock";
      playerId: string;
    }
  | {
      type: "envelope";
      envelope: RelayEnvelope;
    }
  | {
      type: "replay";
    };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const roomId = await roomIdFromContext(context);
  if (!roomId) {
    return Response.json({ error: "Room code must be six characters." }, { status: 400 });
  }

  const snapshot = await roomSnapshot(roomId);
  if (!snapshot.room) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  return Response.json(snapshot);
}

export async function POST(request: Request, context: RouteContext) {
  const roomId = await roomIdFromContext(context);
  if (!roomId) {
    return Response.json({ error: "Room code must be six characters." }, { status: 400 });
  }

  const body = await readBody(request);
  if (!body) {
    return Response.json({ error: "Invalid sync request." }, { status: 400 });
  }

  try {
    if (body.type === "join") {
      await ensureRoomForSocketJoin(roomId, {
        playerId: body.playerId,
        name: body.name,
        publicKeys: body.publicKeys,
      });
      return Response.json(await roomSnapshot(roomId));
    }

    if (body.type === "heartbeat") {
      const room = await touchRoomPlayer(roomId, body.playerId);
      if (!room) {
        return Response.json({ error: "Room not found." }, { status: 404 });
      }
      return Response.json(await snapshotFromRoom(room));
    }

    if (body.type === "lock") {
      const room = await lockRoom(roomId, body.playerId);
      return Response.json(await snapshotFromRoom(room));
    }

    if (body.type === "envelope") {
      const accepted = await acceptEnvelope(roomId, body.envelope);
      if (!accepted.ok) {
        return Response.json({ error: accepted.error }, { status: accepted.status });
      }
      return Response.json(await snapshotFromRoom(accepted.room));
    }

    return Response.json(await roomSnapshot(roomId));
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

async function acceptEnvelope(roomId: string, envelope: RelayEnvelope): Promise<
  | { ok: true; room: PublicRoom }
  | { ok: false; status: number; error: string }
> {
  const envelopeRoomId = normalizeRoomId(envelope.roomId);
  if (envelopeRoomId !== roomId) {
    return { ok: false, status: 400, error: "Envelope room does not match this request." };
  }

  const room = await touchRoomPlayer(roomId, envelope.senderId);
  if (!room) {
    return { ok: false, status: 404, error: "Room not found." };
  }

  const sender = room.players.find((player) => player.id === envelope.senderId);
  if (sender?.publicKeys) {
    const signatureOk = await verifyRelayEnvelope({ ...envelope, roomId }, sender.publicKeys.signingPublicKey);
    if (!signatureOk) {
      return { ok: false, status: 400, error: "Envelope signature is invalid." };
    }
  }

  await appendRoomEnvelopeToLog({ ...envelope, roomId });
  return { ok: true, room };
}

async function roomSnapshot(roomId: string) {
  const room = await getRoom(roomId);
  return snapshotFromRoom(room);
}

async function snapshotFromRoom(room: PublicRoom | null) {
  return {
    room,
    envelopes: room ? await loadRoomEnvelopeLog(room.roomId) : [],
    redisConfigured: redisConfigured(),
    transport: "polling",
  };
}

async function roomIdFromContext(context: RouteContext): Promise<string | null> {
  const params = await context.params;
  const roomId = normalizeRoomId(params.roomId ?? "");
  return isSixCharacterRoomCode(roomId) ? roomId : null;
}

async function readBody(request: Request): Promise<SyncBody | null> {
  try {
    const parsed = (await request.json()) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type === "join") {
      const publicKeys =
        parsed.publicKeys === undefined ? undefined : isPlayerPublicKeys(parsed.publicKeys) ? parsed.publicKeys : null;
      if (typeof parsed.playerId !== "string" || typeof parsed.name !== "string" || publicKeys === null) {
        return null;
      }
      return {
        type: "join",
        playerId: parsed.playerId,
        name: parsed.name,
        publicKeys,
      };
    }

    if (parsed.type === "heartbeat" || parsed.type === "lock") {
      if (typeof parsed.playerId !== "string") {
        return null;
      }
      return { type: parsed.type, playerId: parsed.playerId };
    }

    if (parsed.type === "envelope" && isRelayEnvelope(parsed.envelope)) {
      return { type: "envelope", envelope: parsed.envelope };
    }

    if (parsed.type === "replay") {
      return { type: "replay" };
    }
  } catch {
    return null;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Room sync failed.";
}
