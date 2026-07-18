import { getGameConfig } from "@/lib/game/config";
import type {
  AssassinationResolvedEvent,
  GameEvent,
  GameState,
  MissionResolvedEvent,
  Player,
  QuestStatus,
  TeamProposedEvent,
  TeamVoteResolvedEvent,
} from "@/lib/game/types";
import {
  GameRuleError,
  assertKnownPlayerIds,
  assertPhase,
  assertUnique,
  assertValidPlayers,
  countQuestStatus,
  currentLeader,
  currentQuest,
  nextLeaderIndex,
} from "@/lib/game/rules";

export function createInitialGameState(
  players: readonly Player[],
  options: { leaderIndex?: number } = {},
): GameState {
  assertValidPlayers(players);

  const config = getGameConfig(players.length);
  const leaderIndex = options.leaderIndex ?? 0;

  if (!Number.isInteger(leaderIndex) || leaderIndex < 0 || leaderIndex >= players.length) {
    throw new GameRuleError(`Invalid leader index ${leaderIndex}.`);
  }

  return {
    phase: "proposal",
    players: players.map((player) => ({ ...player })),
    config,
    leaderIndex,
    questIndex: 0,
    rejectionCount: 0,
    quests: config.questTeamSizes.map((teamSize, index) => ({
      index,
      teamSize,
      failThreshold: config.questFailThresholds[index],
      status: "pending",
    })),
    proposalHistory: [],
  };
}

export function applyGameEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "team.proposed":
      return applyTeamProposed(state, event);
    case "team.vote.resolved":
      return applyTeamVoteResolved(state, event);
    case "mission.resolved":
      return applyMissionResolved(state, event);
    case "assassination.resolved":
      return applyAssassinationResolved(state, event);
  }
}

export function applyGameEvents(state: GameState, events: readonly GameEvent[]): GameState {
  return events.reduce((current, event) => applyGameEvent(current, event), state);
}

function applyTeamProposed(state: GameState, event: TeamProposedEvent): GameState {
  assertPhase(state, "proposal", event.type);

  const quest = currentQuest(state);
  const leader = currentLeader(state);

  if (event.proposerId !== leader.id) {
    throw new GameRuleError(`Only current leader ${leader.id} can propose a team.`);
  }

  assertUnique(event.team, "team member");
  assertKnownPlayerIds(state, event.team, "Team");

  if (event.team.length !== quest.teamSize) {
    throw new GameRuleError(`Quest ${quest.index + 1} requires ${quest.teamSize} players.`);
  }

  return {
    ...state,
    phase: "teamVote",
    activeProposal: {
      questIndex: state.questIndex,
      attempt: state.rejectionCount + 1,
      leaderId: leader.id,
      team: [...event.team],
    },
  };
}

function applyTeamVoteResolved(state: GameState, event: TeamVoteResolvedEvent): GameState {
  assertPhase(state, "teamVote", event.type);

  if (!state.activeProposal) {
    throw new GameRuleError("Cannot resolve team vote without an active proposal.");
  }

  assertUnique(event.approvals, "approval vote");
  assertUnique(event.rejections, "rejection vote");
  assertKnownPlayerIds(state, event.approvals, "Approvals");
  assertKnownPlayerIds(state, event.rejections, "Rejections");

  const voters = [...event.approvals, ...event.rejections];
  assertUnique(voters, "team vote");

  if (voters.length !== state.players.length) {
    throw new GameRuleError("Every player must reveal exactly one team vote.");
  }

  const approved = event.approvals.length > event.rejections.length;
  const resolvedProposal = {
    ...state.activeProposal,
    approvals: [...event.approvals],
    rejections: [...event.rejections],
    approved,
  };
  const proposalHistory = [...state.proposalHistory, resolvedProposal];
  const leaderIndex = nextLeaderIndex(state);

  if (approved) {
    return {
      ...state,
      phase: "missionVote",
      leaderIndex,
      activeProposal: resolvedProposal,
      proposalHistory,
    };
  }

  const rejectionCount = state.rejectionCount + 1;

  if (rejectionCount >= 5) {
    return {
      ...state,
      phase: "ended",
      leaderIndex,
      rejectionCount,
      activeProposal: undefined,
      proposalHistory,
      winner: "evil",
      victoryReason: "five_rejected_teams",
    };
  }

  return {
    ...state,
    phase: "proposal",
    leaderIndex,
    rejectionCount,
    activeProposal: undefined,
    proposalHistory,
  };
}

function applyMissionResolved(state: GameState, event: MissionResolvedEvent): GameState {
  assertPhase(state, "missionVote", event.type);

  if (!state.activeProposal?.approved) {
    throw new GameRuleError("Cannot resolve mission without an approved team.");
  }

  if (!Number.isInteger(event.failCount) || event.failCount < 0) {
    throw new GameRuleError("Mission fail count must be a non-negative integer.");
  }

  const quest = currentQuest(state);
  if (event.failCount > state.activeProposal.team.length) {
    throw new GameRuleError("Mission fail count cannot exceed approved team size.");
  }

  const failed = event.failCount >= quest.failThreshold;
  const status: QuestStatus = failed ? "failure" : "success";
  const quests = state.quests.map((item) =>
    item.index === quest.index
      ? {
          ...item,
          status,
          team: [...state.activeProposal!.team],
          failCount: event.failCount,
          proposalAttempt: state.activeProposal!.attempt,
        }
      : item,
  );

  const nextState: GameState = {
    ...state,
    quests,
    activeProposal: undefined,
    rejectionCount: 0,
  };
  const failures = countQuestStatus(nextState, "failure");
  const successes = countQuestStatus(nextState, "success");

  if (failures >= 3) {
    return {
      ...nextState,
      phase: "ended",
      winner: "evil",
      victoryReason: "three_failed_quests",
    };
  }

  if (successes >= 3) {
    return {
      ...nextState,
      phase: "assassination",
    };
  }

  return {
    ...nextState,
    phase: "proposal",
    questIndex: state.questIndex + 1,
  };
}

function applyAssassinationResolved(
  state: GameState,
  event: AssassinationResolvedEvent,
): GameState {
  assertPhase(state, "assassination", event.type);
  assertKnownPlayerIds(state, [event.assassinId], "Assassin");
  assertKnownPlayerIds(state, [event.targetId], "Assassination target");

  return {
    ...state,
    phase: "ended",
    winner: event.hitMerlin ? "evil" : "good",
    victoryReason: event.hitMerlin ? "assassin_hit_merlin" : "assassin_missed_merlin",
    assassination: {
      assassinId: event.assassinId,
      targetId: event.targetId,
      hitMerlin: event.hitMerlin,
    },
  };
}
