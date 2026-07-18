import { sha256Bytes, bytesToBase64Url, stableStringify, type JsonValue } from "@/lib/crypto/codec";
import type { PublicRoom } from "@/lib/relay/rooms";

export type GenesisPlayer = {
  id: string;
  name: string;
  seat: number;
  signingPublicKey: JsonWebKey | null;
  encryptionPublicKey: JsonWebKey | null;
  keyFingerprint: string | null;
};

export type GenesisRecord = {
  protocolVersion: 1;
  roomId: string;
  players: GenesisPlayer[];
  roleConfig: string[];
  createdAt: number;
};

const CHECKSUM_WORDS = [
  "amber",
  "ash",
  "basil",
  "brook",
  "cairn",
  "cedar",
  "cinder",
  "clover",
  "copper",
  "crown",
  "dawn",
  "ember",
  "falcon",
  "fern",
  "flint",
  "forge",
  "glade",
  "harbor",
  "hazel",
  "ivy",
  "juniper",
  "lantern",
  "laurel",
  "maple",
  "meadow",
  "moss",
  "onyx",
  "raven",
  "river",
  "rowan",
  "silver",
  "thorn",
  "vale",
  "wolf",
  "yew",
];

export function buildGenesis(room: PublicRoom): GenesisRecord {
  return {
    protocolVersion: 1,
    roomId: room.roomId,
    players: [...room.players]
      .sort((left, right) => left.seat - right.seat)
      .map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        signingPublicKey: player.publicKeys?.signingPublicKey ?? null,
        encryptionPublicKey: player.publicKeys?.encryptionPublicKey ?? null,
        keyFingerprint: player.publicKeys?.keyFingerprint ?? null,
      })),
    roleConfig: ["merlin", "assassin", "loyal_servant", "minion"],
    createdAt: room.createdAt,
  };
}

export function genesisReady(genesis: GenesisRecord): boolean {
  return genesis.players.length >= 5 && genesis.players.every((player) => player.signingPublicKey && player.encryptionPublicKey);
}

export async function genesisDigest(genesis: GenesisRecord): Promise<string> {
  return bytesToBase64Url(await genesisDigestBytes(genesis));
}

export async function genesisChecksum(genesis: GenesisRecord, wordCount = 4): Promise<string[]> {
  const digest = await genesisDigestBytes(genesis);
  return Array.from({ length: wordCount }, (_, index) => CHECKSUM_WORDS[digest[index] % CHECKSUM_WORDS.length]);
}

async function genesisDigestBytes(genesis: GenesisRecord): Promise<Uint8Array> {
  return sha256Bytes(stableStringify(genesisToJson(genesis)));
}

function genesisToJson(genesis: GenesisRecord): JsonValue {
  return {
    createdAt: genesis.createdAt,
    players: genesis.players.map((player) => ({
      encryptionPublicKey: player.encryptionPublicKey as JsonValue | null,
      id: player.id,
      keyFingerprint: player.keyFingerprint,
      name: player.name,
      seat: player.seat,
      signingPublicKey: player.signingPublicKey as JsonValue | null,
    })),
    protocolVersion: genesis.protocolVersion,
    roleConfig: genesis.roleConfig,
    roomId: genesis.roomId,
  };
}
