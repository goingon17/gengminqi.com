import {
  bytesToArrayBuffer,
  bytesToBase64Url,
  base64UrlToBytes,
  stableStringify,
  textToBytes,
  type JsonValue,
} from "@/lib/crypto/codec";
import { importSigningPrivateKey, importSigningPublicKey, type PlayerIdentity } from "@/lib/crypto/player-identity";
import type { RelayEnvelope } from "@/lib/protocol/envelope";

export type UnsignedRelayEnvelope = Omit<RelayEnvelope, "signature">;

export type SignedEnvelopeInput = {
  roomId: string;
  senderId: string;
  recipients: string[] | "broadcast";
  sequence: number;
  previousHash: string;
  messageType: string;
  ciphertext: string;
  sentAt?: number;
  identity: PlayerIdentity;
};

export async function createSignedEnvelope(input: SignedEnvelopeInput): Promise<RelayEnvelope> {
  const unsigned: UnsignedRelayEnvelope = {
    protocolVersion: 1,
    roomId: input.roomId,
    senderId: input.senderId,
    recipients: input.recipients,
    sequence: input.sequence,
    previousHash: input.previousHash,
    messageType: input.messageType,
    ciphertext: input.ciphertext,
    sentAt: input.sentAt ?? Date.now(),
  };
  const privateKey = await importSigningPrivateKey(input.identity);
  const signature = await signUnsignedEnvelope(unsigned, privateKey);

  return {
    ...unsigned,
    signature,
  };
}

export async function signUnsignedEnvelope(envelope: UnsignedRelayEnvelope, privateKey: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    bytesToArrayBuffer(textToBytes(canonicalUnsignedEnvelope(envelope))),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyRelayEnvelope(envelope: RelayEnvelope, publicKey: JsonWebKey): Promise<boolean> {
  try {
    const key = await importSigningPublicKey(publicKey);
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      bytesToArrayBuffer(base64UrlToBytes(envelope.signature)),
      bytesToArrayBuffer(textToBytes(canonicalUnsignedEnvelope(envelope))),
    );
  } catch {
    return false;
  }
}

export async function relayEnvelopeHash(envelope: RelayEnvelope): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytesToArrayBuffer(textToBytes(stableStringify(envelopeToJson(envelope)))),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export function canonicalUnsignedEnvelope(envelope: UnsignedRelayEnvelope | RelayEnvelope): string {
  return stableStringify(unsignedEnvelopeToJson(envelope));
}

function unsignedEnvelopeToJson(envelope: UnsignedRelayEnvelope | RelayEnvelope): { [key: string]: JsonValue } {
  return {
    ciphertext: envelope.ciphertext,
    messageType: envelope.messageType,
    previousHash: envelope.previousHash,
    protocolVersion: envelope.protocolVersion,
    recipients: envelope.recipients === "broadcast" ? "broadcast" : [...envelope.recipients],
    roomId: envelope.roomId,
    senderId: envelope.senderId,
    sentAt: envelope.sentAt,
    sequence: envelope.sequence,
  };
}

function envelopeToJson(envelope: RelayEnvelope): JsonValue {
  return {
    ...unsignedEnvelopeToJson(envelope),
    signature: envelope.signature,
  };
}
