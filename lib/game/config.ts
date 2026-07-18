import type { Alignment, GameConfig, Role } from "@/lib/game/types";

const QUEST_TEAM_SIZES: Record<number, readonly [number, number, number, number, number]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

const ALIGNMENT_COUNTS: Record<number, { good: number; evil: number }> = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

export function getGameConfig(playerCount: number): GameConfig {
  const counts = ALIGNMENT_COUNTS[playerCount];
  const questTeamSizes = QUEST_TEAM_SIZES[playerCount];

  if (!counts || !questTeamSizes) {
    throw new Error(`Avalon requires 5-10 players; received ${playerCount}.`);
  }

  return {
    playerCount,
    goodCount: counts.good,
    evilCount: counts.evil,
    questTeamSizes,
    questFailThresholds: buildFailThresholds(playerCount),
    roleDeck: buildRoleDeck(counts.good, counts.evil),
  };
}

export function getRoleAlignment(role: Role): Alignment {
  return role === "assassin" || role === "minion" ? "evil" : "good";
}

function buildFailThresholds(playerCount: number): readonly [number, number, number, number, number] {
  return playerCount >= 7 ? [1, 1, 1, 2, 1] : [1, 1, 1, 1, 1];
}

function buildRoleDeck(goodCount: number, evilCount: number): readonly Role[] {
  return [
    "merlin",
    ...Array.from({ length: goodCount - 1 }, () => "loyal-servant" as const),
    "assassin",
    ...Array.from({ length: evilCount - 1 }, () => "minion" as const),
  ];
}
