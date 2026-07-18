import type {
  AssassinationResolvedEvent,
  MissionResolvedEvent,
  PlayerId,
  TeamProposedEvent,
  TeamVoteResolvedEvent,
} from "@/lib/game/types";

export function teamProposed(proposerId: PlayerId, team: readonly PlayerId[]): TeamProposedEvent {
  return {
    type: "team.proposed",
    proposerId,
    team,
  };
}

export function teamVoteResolved(
  approvals: readonly PlayerId[],
  rejections: readonly PlayerId[],
): TeamVoteResolvedEvent {
  return {
    type: "team.vote.resolved",
    approvals,
    rejections,
  };
}

export function missionResolved(failCount: number): MissionResolvedEvent {
  return {
    type: "mission.resolved",
    failCount,
  };
}

export function assassinationResolved(
  assassinId: PlayerId,
  targetId: PlayerId,
  hitMerlin: boolean,
): AssassinationResolvedEvent {
  return {
    type: "assassination.resolved",
    assassinId,
    targetId,
    hitMerlin,
  };
}
