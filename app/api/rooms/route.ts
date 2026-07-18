import {
  createRoom,
  getRoom,
  isSixCharacterRoomCode,
  joinRoom,
  normalizeRoomId,
} from "@/lib/relay/rooms";
import { isPlayerPublicKeys, type PlayerPublicKeys } from "@/lib/protocol/player-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomId = normalizeRoomId(url.searchParams.get("roomId") ?? "");

  if (!isSixCharacterRoomCode(roomId)) {
    return Response.json({ error: "Room code must be six characters." }, { status: 400 });
  }

  const room = await getRoom(roomId);
  if (!room) {
    return Response.json({ error: "Room not found." }, { status: 404 });
  }

  return Response.json({ room });
}

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body) {
    return Response.json({ error: "Invalid room request." }, { status: 400 });
  }

  try {
    const room = await createRoom({ playerId: body.playerId, name: body.name, publicKeys: body.publicKeys });
    return Response.json({ room }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const body = await readBody(request);
  if (!body || typeof body.roomId !== "string" || !isSixCharacterRoomCode(body.roomId)) {
    return Response.json({ error: "Room code must be six characters." }, { status: 400 });
  }

  try {
    const room = await joinRoom(body.roomId, { playerId: body.playerId, name: body.name, publicKeys: body.publicKeys });
    return Response.json({ room });
  } catch (error) {
    const message = errorMessage(error);
    return Response.json({ error: message }, { status: message === "Room not found." ? 404 : 400 });
  }
}

async function readBody(request: Request): Promise<{
  roomId?: string;
  playerId: string;
  name: string;
  publicKeys?: PlayerPublicKeys;
} | null> {
  try {
    const parsed = (await request.json()) as unknown;
    if (!isRecord(parsed) || typeof parsed.playerId !== "string" || typeof parsed.name !== "string") {
      return null;
    }

    const publicKeys =
      parsed.publicKeys === undefined ? undefined : isPlayerPublicKeys(parsed.publicKeys) ? parsed.publicKeys : null;
    if (publicKeys === null) {
      return null;
    }

    return {
      roomId: typeof parsed.roomId === "string" ? parsed.roomId : undefined,
      playerId: parsed.playerId,
      name: parsed.name,
      publicKeys,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Room operation failed.";
}
