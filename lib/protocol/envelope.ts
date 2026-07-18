import { isPlayerPublicKeys, type PlayerPublicKeys } from "@/lib/protocol/player-keys";

export type RelayEnvelope = {
  protocolVersion: 1;
  roomId: string;
  senderId: string;
  recipients: string[] | "broadcast";
  sequence: number;
  previousHash: string;
  messageType: string;
  ciphertext: string;
  signature: string;
  sentAt: number;
};

export type ClientFrame =
  | {
      type: "join";
      roomId: string;
      playerId: string;
      name: string;
      publicKeys?: PlayerPublicKeys;
    }
  | {
      type: "heartbeat";
      roomId: string;
      playerId: string;
    }
  | {
      type: "room.lock";
      roomId: string;
      playerId: string;
    }
  | {
      type: "envelope";
      envelope: RelayEnvelope;
    }
  | {
      type: "replay";
      roomId: string;
    };

export function parseClientFrame(raw: string): ClientFrame | null {
  if (raw.length > 16_384) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type === "join") {
      const roomId = readString(parsed.roomId, 64);
      const playerId = readString(parsed.playerId, 128);
      const name = readString(parsed.name, 48);
      const publicKeys =
        parsed.publicKeys === undefined ? undefined : isPlayerPublicKeys(parsed.publicKeys) ? parsed.publicKeys : null;

      if (!roomId || !playerId || !name || publicKeys === null) {
        return null;
      }

      return { type: "join", roomId, playerId, name, publicKeys };
    }

    if (parsed.type === "heartbeat") {
      const roomId = readString(parsed.roomId, 64);
      const playerId = readString(parsed.playerId, 128);

      if (!roomId || !playerId) {
        return null;
      }

      return { type: "heartbeat", roomId, playerId };
    }

    if (parsed.type === "room.lock") {
      const roomId = readString(parsed.roomId, 64);
      const playerId = readString(parsed.playerId, 128);

      if (!roomId || !playerId) {
        return null;
      }

      return { type: "room.lock", roomId, playerId };
    }

    if (parsed.type === "replay") {
      const roomId = readString(parsed.roomId, 64);
      return roomId ? { type: "replay", roomId } : null;
    }

    if (parsed.type === "envelope" && isRelayEnvelope(parsed.envelope)) {
      return { type: "envelope", envelope: parsed.envelope };
    }
  } catch {
    return null;
  }

  return null;
}

export function isRelayEnvelope(value: unknown): value is RelayEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  if (value.protocolVersion !== 1) {
    return false;
  }

  if (
    !readString(value.roomId, 64) ||
    !readString(value.senderId, 128) ||
    !readString(value.previousHash, 128) ||
    !readString(value.messageType, 96) ||
    !readString(value.ciphertext, 12_000) ||
    !readString(value.signature, 512)
  ) {
    return false;
  }

  if (
    typeof value.sequence !== "number" ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 0 ||
    value.sequence > 1_000_000
  ) {
    return false;
  }

  if (typeof value.sentAt !== "number" || !Number.isInteger(value.sentAt) || value.sentAt <= 0) {
    return false;
  }

  if (value.recipients === "broadcast") {
    return true;
  }

  return Array.isArray(value.recipients) && value.recipients.every((item) => readString(item, 128));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}
