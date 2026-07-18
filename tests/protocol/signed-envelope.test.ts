import { describe, expect, it } from "vitest";
import { jsonToBase64Url } from "@/lib/crypto/codec";
import { createPlayerIdentity } from "@/lib/crypto/player-identity";
import { buildGenesis, genesisChecksum, genesisDigest } from "@/lib/protocol/genesis";
import {
  createSignedEnvelope,
  relayEnvelopeHash,
  verifyRelayEnvelope,
} from "@/lib/protocol/signed-envelope";
import type { PublicRoom } from "@/lib/relay/rooms";

describe("signed relay envelopes", () => {
  it("verifies legitimate envelopes and rejects tampering", async () => {
    const identity = await createPlayerIdentity("p1", "Merlin", 1);
    const envelope = await createSignedEnvelope({
      roomId: "AVN042",
      senderId: "p1",
      recipients: "broadcast",
      sequence: 1,
      previousHash: "genesis",
      messageType: "room.public_event",
      ciphertext: jsonToBase64Url({ text: "ready" }),
      identity,
      sentAt: 2,
    });

    await expect(verifyRelayEnvelope(envelope, identity.signingPublicKey)).resolves.toBe(true);
    await expect(
      verifyRelayEnvelope({ ...envelope, ciphertext: jsonToBase64Url({ text: "tampered" }) }, identity.signingPublicKey),
    ).resolves.toBe(false);
  });

  it("rejects envelopes signed by another player", async () => {
    const alice = await createPlayerIdentity("p1", "Merlin", 1);
    const bob = await createPlayerIdentity("p2", "Assassin", 1);
    const envelope = await createSignedEnvelope({
      roomId: "AVN042",
      senderId: "p1",
      recipients: "broadcast",
      sequence: 1,
      previousHash: "genesis",
      messageType: "room.public_event",
      ciphertext: jsonToBase64Url({ text: "ready" }),
      identity: bob,
      sentAt: 2,
    });

    await expect(verifyRelayEnvelope(envelope, alice.signingPublicKey)).resolves.toBe(false);
  });

  it("hashes signed envelopes deterministically", async () => {
    const identity = await createPlayerIdentity("p1", "Merlin", 1);
    const envelope = await createSignedEnvelope({
      roomId: "AVN042",
      senderId: "p1",
      recipients: "broadcast",
      sequence: 1,
      previousHash: "genesis",
      messageType: "room.public_event",
      ciphertext: jsonToBase64Url({ text: "ready" }),
      identity,
      sentAt: 2,
    });

    await expect(relayEnvelopeHash(envelope)).resolves.toBe(await relayEnvelopeHash({ ...envelope }));
  });
});

describe("genesis checksum", () => {
  it("changes when the signed player set changes", async () => {
    const alice = await createPlayerIdentity("p1", "Merlin", 1);
    const bob = await createPlayerIdentity("p2", "Assassin", 1);
    const left = buildGenesis(makeRoom([alice]));
    const right = buildGenesis(makeRoom([alice, bob]));

    expect(await genesisDigest(left)).not.toBe(await genesisDigest(right));
    expect(await genesisChecksum(left)).toHaveLength(4);
  });
});

function makeRoom(players: Awaited<ReturnType<typeof createPlayerIdentity>>[]): PublicRoom {
  return {
    roomId: "AVN042",
    createdAt: 1,
    updatedAt: 1,
    locked: false,
    ownerId: players[0]?.playerId ?? "p1",
    players: players.map((identity, index) => ({
      id: identity.playerId,
      name: identity.name,
      seat: index + 1,
      joinedAt: 1,
      lastSeen: 1,
      online: true,
      publicKeys: {
        signingPublicKey: identity.signingPublicKey,
        encryptionPublicKey: identity.encryptionPublicKey,
        keyFingerprint: identity.keyFingerprint,
      },
    })),
    maxPlayers: 10,
    ttlSeconds: 21_600,
  };
}
