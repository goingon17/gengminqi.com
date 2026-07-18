import { describe, expect, it } from "vitest";
import { isRelayEnvelope, parseClientFrame, type RelayEnvelope } from "@/lib/protocol/envelope";

describe("relay envelope protocol", () => {
  it("parses join, heartbeat, lock, replay, and envelope client frames", () => {
    const envelope = makeEnvelope();

    expect(parseClientFrame(JSON.stringify({ type: "join", roomId: "AVN042", playerId: "p1", name: "Merlin" }))).toEqual({
      type: "join",
      roomId: "AVN042",
      playerId: "p1",
      name: "Merlin",
    });
    expect(parseClientFrame(JSON.stringify({ type: "heartbeat", roomId: "AVN042", playerId: "p1" }))).toEqual({
      type: "heartbeat",
      roomId: "AVN042",
      playerId: "p1",
    });
    expect(parseClientFrame(JSON.stringify({ type: "room.lock", roomId: "AVN042", playerId: "p1" }))).toEqual({
      type: "room.lock",
      roomId: "AVN042",
      playerId: "p1",
    });
    expect(parseClientFrame(JSON.stringify({ type: "replay", roomId: "AVN042" }))).toEqual({
      type: "replay",
      roomId: "AVN042",
    });
    expect(parseClientFrame(JSON.stringify({ type: "envelope", envelope }))).toEqual({ type: "envelope", envelope });
  });

  it("rejects malformed or overlarge frames", () => {
    expect(parseClientFrame("{nope")).toBeNull();
    expect(parseClientFrame(JSON.stringify({ type: "join", roomId: "", playerId: "p1", name: "Merlin" }))).toBeNull();
    expect(parseClientFrame("x".repeat(16_385))).toBeNull();
  });

  it("validates relay envelopes at the trust boundary", () => {
    expect(isRelayEnvelope(makeEnvelope())).toBe(true);
    expect(isRelayEnvelope({ ...makeEnvelope(), sequence: 1.2 })).toBe(false);
    expect(isRelayEnvelope({ ...makeEnvelope(), recipients: [42] })).toBe(false);
  });
});

function makeEnvelope(): RelayEnvelope {
  return {
    protocolVersion: 1,
    roomId: "AVN042",
    senderId: "p1",
    recipients: "broadcast",
    sequence: 1,
    previousHash: "genesis",
    messageType: "room.public_event",
    ciphertext: "eyJ0ZXh0IjoiaGkifQ==",
    signature: "stage3-test",
    sentAt: Date.now(),
  };
}
