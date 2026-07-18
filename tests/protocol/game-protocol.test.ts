import { describe, expect, it } from "vitest";
import {
  deriveGameProtocolSnapshot,
  gameProtocolPayloadFromEnvelope,
  gameVoteCommitment,
  gameVoteScope,
  type GameProtocolPayload,
  type MissionVoteChoice,
  type TeamVoteChoice,
} from "@/lib/protocol/game-protocol";
import type { RelayEnvelope } from "@/lib/protocol/envelope";
import { jsonToBase64Url, type JsonValue } from "@/lib/crypto/codec";

describe("game protocol derivation", () => {
  it("runs three successful quests into assassination", async () => {
    const players = makePlayers(5);
    const payloads: GameProtocolPayload[] = [];

    payloads.push(propose("p1", ["p1", "p2"], 1));
    payloads.push(...(await teamVotes(0, 1, players.map((player) => player.id), "approve", 2)));
    payloads.push(...(await missionVotes(0, 1, ["p1", "p2"], "success", 20)));

    payloads.push(propose("p2", ["p1", "p2", "p3"], 80));
    payloads.push(...(await teamVotes(1, 1, players.map((player) => player.id), "approve", 81)));
    payloads.push(...(await missionVotes(1, 1, ["p1", "p2", "p3"], "success", 120)));

    payloads.push(propose("p3", ["p2", "p3"], 170));
    payloads.push(...(await teamVotes(2, 1, players.map((player) => player.id), "approve", 171)));
    payloads.push(...(await missionVotes(2, 1, ["p2", "p3"], "success", 210)));

    const snapshot = deriveGameProtocolSnapshot(players, payloads);

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.state?.phase).toBe("assassination");
    expect(snapshot.state?.quests.filter((quest) => quest.status === "success")).toHaveLength(3);
  });

  it("uses rejected teams and approved teams to rotate leaders", async () => {
    const players = makePlayers(5);
    const payloads: GameProtocolPayload[] = [
      propose("p1", ["p1", "p2"], 1),
      ...(await teamVotes(0, 1, ["p1", "p2", "p3", "p4", "p5"], "reject", 2)),
      propose("p2", ["p1", "p2"], 50),
      ...(await teamVotes(0, 2, ["p1", "p2", "p3", "p4", "p5"], "approve", 51)),
    ];

    const snapshot = deriveGameProtocolSnapshot(players, payloads);

    expect(snapshot.state?.phase).toBe("missionVote");
    expect(snapshot.state?.activeProposal?.leaderId).toBe("p2");
    expect(snapshot.state?.rejectionCount).toBe(1);
  });

  it("resolves failed missions and evil wins after three failures", async () => {
    const players = makePlayers(7);
    const payloads: GameProtocolPayload[] = [];

    payloads.push(propose("p1", ["p1", "p2"], 1));
    payloads.push(...(await teamVotes(0, 1, playerIds(players), "approve", 2)));
    payloads.push(...(await missionVotes(0, 1, ["p1", "p2"], "fail", 20)));

    payloads.push(propose("p2", ["p1", "p2", "p3"], 80));
    payloads.push(...(await teamVotes(1, 1, playerIds(players), "approve", 81)));
    payloads.push(...(await missionVotes(1, 1, ["p1", "p2", "p3"], "fail", 120)));

    payloads.push(propose("p3", ["p2", "p3", "p4"], 170));
    payloads.push(...(await teamVotes(2, 1, playerIds(players), "approve", 171)));
    payloads.push(...(await missionVotes(2, 1, ["p2", "p3", "p4"], "fail", 210)));

    const snapshot = deriveGameProtocolSnapshot(players, payloads);

    expect(snapshot.state?.phase).toBe("ended");
    expect(snapshot.state?.winner).toBe("evil");
    expect(snapshot.state?.victoryReason).toBe("three_failed_quests");
  });

  it("rejects malformed vote reveal envelopes at the boundary", async () => {
    const envelope = envelopeFor("p1", "game.team_vote.reveal", {
      type: "game.team_vote.reveal",
      questIndex: 0,
      attempt: 1,
      choice: "approve",
      salt: "salt",
      commitment: "wrong",
      sentAt: 1,
    });

    await expect(gameProtocolPayloadFromEnvelope(envelope)).resolves.toEqual({
      type: "invalid",
      message: "Rejected team vote reveal that does not match commitment.",
    });
  });
});

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    seat: index + 1,
  }));
}

function playerIds(players: Array<{ id: string }>): string[] {
  return players.map((player) => player.id);
}

function propose(proposerId: string, team: string[], sentAt: number): GameProtocolPayload {
  return {
    type: "game.team.proposed",
    proposerId,
    team,
    sentAt,
  };
}

async function teamVotes(
  questIndex: number,
  attempt: number,
  voters: string[],
  choice: TeamVoteChoice,
  sentAt: number,
): Promise<GameProtocolPayload[]> {
  const payloads: GameProtocolPayload[] = [];
  for (const [index, voterId] of voters.entries()) {
    const salt = `salt-${questIndex}-${attempt}-${voterId}`;
    const commitment = await gameVoteCommitment(voterId, gameVoteScope("team", questIndex, attempt), choice, salt);
    payloads.push({
      type: "game.team_vote.commit",
      voterId,
      questIndex,
      attempt,
      commitment,
      sentAt: sentAt + index,
    });
    payloads.push({
      type: "game.team_vote.reveal",
      voterId,
      questIndex,
      attempt,
      choice,
      salt,
      commitment,
      sentAt: sentAt + 20 + index,
    });
  }
  return payloads;
}

async function missionVotes(
  questIndex: number,
  attempt: number,
  voters: string[],
  choice: MissionVoteChoice,
  sentAt: number,
): Promise<GameProtocolPayload[]> {
  const payloads: GameProtocolPayload[] = [];
  for (const [index, voterId] of voters.entries()) {
    const salt = `mission-${questIndex}-${attempt}-${voterId}`;
    const commitment = await gameVoteCommitment(voterId, gameVoteScope("mission", questIndex, attempt), choice, salt);
    payloads.push({
      type: "game.mission_vote.commit",
      voterId,
      questIndex,
      attempt,
      commitment,
      sentAt: sentAt + index,
    });
    payloads.push({
      type: "game.mission_vote.reveal",
      voterId,
      questIndex,
      attempt,
      choice,
      salt,
      commitment,
      sentAt: sentAt + 20 + index,
    });
  }
  return payloads;
}

function envelopeFor(senderId: string, messageType: string, payload: { [key: string]: JsonValue }): RelayEnvelope {
  return {
    protocolVersion: 1,
    roomId: "AVN042",
    senderId,
    recipients: "broadcast",
    sequence: 1,
    previousHash: "genesis",
    messageType,
    ciphertext: jsonToBase64Url(payload),
    signature: "test",
    sentAt: 1,
  };
}
