import { sha256Base64Url, stableStringify, type JsonValue } from "@/lib/crypto/codec";
import type { PlayerPublicKeys } from "@/lib/protocol/player-keys";

export type PlayerIdentity = PlayerPublicKeys & {
  playerId: string;
  name: string;
  signingPrivateKey: JsonWebKey;
  encryptionPrivateKey: JsonWebKey;
  createdAt: number;
  updatedAt: number;
};

export async function createPlayerIdentity(playerId: string, name: string, now = Date.now()): Promise<PlayerIdentity> {
  const signing = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const encryption = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const signingPublicKey = await crypto.subtle.exportKey("jwk", signing.publicKey);
  const signingPrivateKey = await crypto.subtle.exportKey("jwk", signing.privateKey);
  const encryptionPublicKey = await crypto.subtle.exportKey("jwk", encryption.publicKey);
  const encryptionPrivateKey = await crypto.subtle.exportKey("jwk", encryption.privateKey);
  const keyFingerprint = await publicKeyFingerprint({ signingPublicKey, encryptionPublicKey });

  return {
    playerId: cleanPlayerId(playerId),
    name: cleanPlayerName(name),
    signingPublicKey,
    signingPrivateKey,
    encryptionPublicKey,
    encryptionPrivateKey,
    keyFingerprint,
    createdAt: now,
    updatedAt: now,
  };
}

export function publicKeysFromIdentity(identity: PlayerIdentity): PlayerPublicKeys {
  return {
    signingPublicKey: identity.signingPublicKey,
    encryptionPublicKey: identity.encryptionPublicKey,
    keyFingerprint: identity.keyFingerprint,
  };
}

export async function publicKeyFingerprint(keys: Omit<PlayerPublicKeys, "keyFingerprint">): Promise<string> {
  const digest = await sha256Base64Url(
    stableStringify({
      encryptionPublicKey: keys.encryptionPublicKey as JsonValue,
      signingPublicKey: keys.signingPublicKey as JsonValue,
    }),
  );
  return digest.slice(0, 22);
}

export async function importSigningPrivateKey(identity: PlayerIdentity): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    identity.signingPrivateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

export async function importSigningPublicKey(publicKey: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
}

export async function updateIdentityName(identity: PlayerIdentity, name: string): Promise<PlayerIdentity> {
  return {
    ...identity,
    name: cleanPlayerName(name),
    updatedAt: Date.now(),
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
  return trimmed || "Player";
}
