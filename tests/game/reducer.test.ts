import { describe, expect, it } from "vitest";
import {
  GameRuleError,
  applyGameEvent,
  applyGameEvents,
  assassinationResolved,
  createInitialGameState,
  currentLeader,
  currentQuest,
  getGameConfig,
  getRoleAlignment,
  missionResolved,
  teamProposed,
  teamVoteResolved,
  type GameState,
  type Player,
  type PlayerId,
  type QuestRecord,
} from "@/lib/game";

describe("Avalon game config", () => {
  it("builds official alignment and quest config for 5-10 players", () => {
    const expected = {
      5: { good: 3, evil: 2, teams: [2, 3, 2, 3, 3], thresholds: [1, 1, 1, 1, 1] },
      6: { good: 4, evil: 2, teams: [2, 3, 4, 3, 4], thresholds: [1, 1, 1, 1, 1] },
      7: { good: 4, evil: 3, teams: [2, 3, 3, 4, 4], thresholds: [1, 1, 1, 2, 1] },
      8: { good: 5, evil: 3, teams: [3, 4, 4, 5, 5], thresholds: [1, 1, 1, 2, 1] },
      9: { good: 6, evil: 3, teams: [3, 4, 4, 5, 5], thresholds: [1, 1, 1, 2, 1] },
      10: { good: 6, evil: 4, teams: [3, 4, 4, 5, 5], thresholds: [1, 1, 1, 2, 1] },
    } as const;

    for (const count of [5, 6, 7, 8, 9, 10] as const) {
      const config = getGameConfig(count);
      expect(config.goodCount).toBe(expected[count].good);
      expect(config.evilCount).toBe(expected[count].evil);
      expect(config.questTeamSizes).toEqual(expected[count].teams);
      expect(config.questFailThresholds).toEqual(expected[count].thresholds);
      expect(config.roleDeck).toHaveLength(count);
      expect(config.roleDeck.filter((role) => getRoleAlignment(role) === "good")).toHaveLength(expected[count].good);
      expect(config.roleDeck.filter((role) => getRoleAlignment(role) === "evil")).toHaveLength(expected[count].evil);
      expect(config.roleDeck.filter((role) => role === "merlin")).toHaveLength(1);
      expect(config.roleDeck.filter((role) => role === "assassin")).toHaveLength(1);
    }
  });

  it("rejects unsupported player counts", () => {
    expect(() => getGameConfig(4)).toThrow("5-10");
    expect(() => createInitialGameState(makePlayers(11))).toThrow("5-10");
  });
});

describe("Avalon reducer", () => {
  it("runs a complete good victory simulation for every player count", () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      let state = createInitialGameState(makePlayers(count));

      state = passQuest(state, 0);
      state = passQuest(state, 0);
      state = passQuest(state, 0);

      expect(state.phase).toBe("assassination");

      state = applyGameEvent(state, assassinationResolved("p2", "p3", false));

      expect(state.phase).toBe("ended");
      expect(state.winner).toBe("good");
      expect(state.victoryReason).toBe("assassin_missed_merlin");
      expect(countQuests(state.quests, "success")).toBe(3);
    }
  });

  it("ends with evil after three failed quests", () => {
    let state = createInitialGameState(makePlayers(7));

    state = passQuest(state, 1);
    state = passQuest(state, 1);
    state = passQuest(state, 1);

    expect(state.phase).toBe("ended");
    expect(state.winner).toBe("evil");
    expect(state.victoryReason).toBe("three_failed_quests");
    expect(countQuests(state.quests, "failure")).toBe(3);
  });

  it("ends with evil after five rejected team votes", () => {
    let state = createInitialGameState(makePlayers(5));

    for (let index = 0; index < 5; index += 1) {
      state = proposeCurrentQuest(state);
      state = applyGameEvent(state, teamVoteResolved([], allPlayerIds(state)));
    }

    expect(state.phase).toBe("ended");
    expect(state.winner).toBe("evil");
    expect(state.victoryReason).toBe("five_rejected_teams");
    expect(state.rejectionCount).toBe(5);
    expect(state.proposalHistory).toHaveLength(5);
  });

  it("uses two fail cards for the fourth quest with 7 or more players", () => {
    let state = createInitialGameState(makePlayers(7));

    state = passQuest(state, 0);
    state = passQuest(state, 1);
    state = passQuest(state, 0);
    expect(state.questIndex).toBe(3);

    state = passQuest(state, 1);

    expect(state.phase).toBe("assassination");
    expect(state.quests[3]).toMatchObject({
      status: "success",
      failThreshold: 2,
      failCount: 1,
    });
  });

  it("fails the fourth quest with one fail card below 7 players", () => {
    let state = createInitialGameState(makePlayers(6));

    state = passQuest(state, 0);
    state = passQuest(state, 1);
    state = passQuest(state, 0);
    expect(state.questIndex).toBe(3);

    state = passQuest(state, 1);

    expect(state.phase).toBe("proposal");
    expect(state.quests[3]).toMatchObject({
      status: "failure",
      failThreshold: 1,
      failCount: 1,
    });
  });

  it("allows assassin to steal the win by hitting Merlin", () => {
    let state = createInitialGameState(makePlayers(5));

    state = passQuest(state, 0);
    state = passQuest(state, 0);
    state = passQuest(state, 0);
    state = applyGameEvent(state, assassinationResolved("p2", "p1", true));

    expect(state.phase).toBe("ended");
    expect(state.winner).toBe("evil");
    expect(state.victoryReason).toBe("assassin_hit_merlin");
    expect(state.assassination).toEqual({
      assassinId: "p2",
      targetId: "p1",
      hitMerlin: true,
    });
  });

  it("rotates leadership after every proposal vote", () => {
    let state = createInitialGameState(makePlayers(5));

    expect(currentLeader(state).id).toBe("p1");
    state = proposeCurrentQuest(state);
    state = applyGameEvent(state, teamVoteResolved([], allPlayerIds(state)));
    expect(currentLeader(state).id).toBe("p2");

    state = proposeCurrentQuest(state);
    state = applyGameEvent(state, teamVoteResolved(allPlayerIds(state), []));
    expect(currentLeader(state).id).toBe("p3");
  });

  it("rejects invalid proposals, partial votes, and impossible mission fail counts", () => {
    let state = createInitialGameState(makePlayers(5));

    expect(() => applyGameEvent(state, teamProposed("p2", ["p1", "p2"]))).toThrow(GameRuleError);
    expect(() => applyGameEvent(state, teamProposed("p1", ["p1"]))).toThrow("requires 2 players");
    expect(() => applyGameEvent(state, teamProposed("p1", ["p1", "p1"]))).toThrow("Duplicate");

    state = applyGameEvent(state, teamProposed("p1", ["p1", "p2"]));

    expect(() => applyGameEvent(state, teamVoteResolved(["p1"], ["p2"]))).toThrow("Every player");

    state = applyGameEvent(state, teamVoteResolved(allPlayerIds(state), []));

    expect(() => applyGameEvent(state, missionResolved(3))).toThrow("cannot exceed");
  });

  it("reduces the same event stream to the same state", () => {
    const players = makePlayers(5);
    const events = [
      teamProposed("p1", ["p1", "p2"]),
      teamVoteResolved(["p1", "p2", "p3", "p4", "p5"], []),
      missionResolved(0),
      teamProposed("p2", ["p1", "p2", "p3"]),
      teamVoteResolved(["p1", "p2", "p3", "p4", "p5"], []),
      missionResolved(1),
    ];

    const left = applyGameEvents(createInitialGameState(players), events);
    const right = applyGameEvents(createInitialGameState(players), events);

    expect(left).toEqual(right);
  });
});

function passQuest(state: GameState, failCount: number): GameState {
  const proposed = proposeCurrentQuest(state);
  const approved = applyGameEvent(proposed, teamVoteResolved(allPlayerIds(proposed), []));
  return applyGameEvent(approved, missionResolved(failCount));
}

function proposeCurrentQuest(state: GameState): GameState {
  const leader = currentLeader(state);
  const quest = currentQuest(state);
  return applyGameEvent(state, teamProposed(leader.id, teamForQuest(state, quest)));
}

function teamForQuest(state: GameState, quest: QuestRecord): PlayerId[] {
  return state.players.slice(0, quest.teamSize).map((player) => player.id);
}

function allPlayerIds(state: GameState): PlayerId[] {
  return state.players.map((player) => player.id);
}

function countQuests(quests: readonly QuestRecord[], status: "success" | "failure"): number {
  return quests.filter((quest) => quest.status === status).length;
}

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    seat: index + 1,
  }));
}
