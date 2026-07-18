import type { GameState, Player, PlayerId, QuestRecord } from "@/lib/game/types";

export class GameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

export function assertValidPlayers(players: readonly Player[]): void {
  if (players.length < 5 || players.length > 10) {
    throw new GameRuleError(`Avalon requires 5-10 players; received ${players.length}.`);
  }

  assertUnique(players.map((player) => player.id), "player id");
  assertUnique(players.map((player) => String(player.seat)), "seat");

  for (const player of players) {
    if (!player.id.trim()) {
      throw new GameRuleError("Player id cannot be empty.");
    }
    if (!player.name.trim()) {
      throw new GameRuleError("Player name cannot be empty.");
    }
    if (!Number.isInteger(player.seat) || player.seat < 1) {
      throw new GameRuleError(`Invalid seat for player ${player.id}.`);
    }
  }
}

export function assertKnownPlayerIds(state: GameState, ids: readonly PlayerId[], label: string): void {
  const known = new Set(state.players.map((player) => player.id));
  for (const id of ids) {
    if (!known.has(id)) {
      throw new GameRuleError(`${label} contains unknown player ${id}.`);
    }
  }
}

export function assertUnique(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new GameRuleError(`Duplicate ${label}: ${id}.`);
    }
    seen.add(id);
  }
}

export function currentLeader(state: GameState): Player {
  return state.players[state.leaderIndex];
}

export function currentQuest(state: GameState): QuestRecord {
  const quest = state.quests[state.questIndex];
  if (!quest) {
    throw new GameRuleError(`No quest at index ${state.questIndex}.`);
  }
  return quest;
}

export function nextLeaderIndex(state: GameState): number {
  return (state.leaderIndex + 1) % state.players.length;
}

export function countQuestStatus(state: GameState, status: "success" | "failure"): number {
  return state.quests.filter((quest) => quest.status === status).length;
}

export function assertPhase(state: GameState, phase: GameState["phase"], eventType: string): void {
  if (state.phase !== phase) {
    throw new GameRuleError(`${eventType} is invalid during ${state.phase}.`);
  }
}
