import {
  applyGameEvent,
  createInitialGameState,
  currentLeader,
  currentQuest,
  type GameState,
  type Player,
  type PlayerId,
} from "@/lib/game";
import {
  assassinationResolved,
  missionResolved,
  teamProposed,
  teamVoteResolved,
} from "@/lib/game/events";
import { bytesToBase64Url, jsonFromBase64Url, sha256Base64Url } from "@/lib/crypto/codec";
import type { RelayEnvelope } from "@/lib/protocol/envelope";

export type TeamVoteChoice = "approve" | "reject";
export type MissionVoteChoice = "success" | "fail";

export type GameProtocolPayload =
  | {
      type: "game.team.proposed";
      proposerId: PlayerId;
      team: PlayerId[];
      sentAt: number;
    }
  | {
      type: "game.team_vote.commit";
      voterId: PlayerId;
      questIndex: number;
      attempt: number;
      commitment: string;
      sentAt: number;
    }
  | {
      type: "game.team_vote.reveal";
      voterId: PlayerId;
      questIndex: number;
      attempt: number;
      choice: TeamVoteChoice;
      salt: string;
      commitment: string;
      sentAt: number;
    }
  | {
      type: "game.mission_vote.commit";
      voterId: PlayerId;
      questIndex: number;
      attempt: number;
      commitment: string;
      sentAt: number;
    }
  | {
      type: "game.mission_vote.reveal";
      voterId: PlayerId;
      questIndex: number;
      attempt: number;
      choice: MissionVoteChoice;
      salt: string;
      commitment: string;
      sentAt: number;
    }
  | {
      type: "game.assassination.resolved";
      assassinId: PlayerId;
      targetId: PlayerId;
      hitMerlin: boolean;
      sentAt: number;
    };

export type GameProtocolParseResult =
  | {
      type: "none";
    }
  | {
      type: "invalid";
      message: string;
    }
  | {
      type: "payload";
      payload: GameProtocolPayload;
    };

export type GameProtocolPending = {
  teamVote?: {
    questIndex: number;
    attempt: number;
    commits: number;
    reveals: number;
    required: number;
  };
  missionVote?: {
    questIndex: number;
    attempt: number;
    commits: number;
    reveals: number;
    required: number;
  };
};

export type GameProtocolSnapshot = {
  state: GameState | null;
  acceptedPayloads: GameProtocolPayload[];
  pending: GameProtocolPending;
  errors: string[];
};

const GAME_MESSAGE_TYPES = new Set([
  "game.team.proposed",
  "game.team_vote.commit",
  "game.team_vote.reveal",
  "game.mission_vote.commit",
  "game.mission_vote.reveal",
  "game.assassination.resolved",
]);

export function isGameMessageType(type: string): boolean {
  return GAME_MESSAGE_TYPES.has(type);
}

export async function gameProtocolPayloadFromEnvelope(envelope: RelayEnvelope): Promise<GameProtocolParseResult> {
  if (!isGameMessageType(envelope.messageType)) {
    return { type: "none" };
  }

  const raw = jsonFromBase64Url(envelope.ciphertext);
  if (!isRecord(raw)) {
    return { type: "invalid", message: "Rejected unreadable game protocol event." };
  }

  if (raw.type !== envelope.messageType) {
    return { type: "invalid", message: "Rejected game event with mismatched message type." };
  }

  const sentAt = readPositiveInteger(raw.sentAt) ?? envelope.sentAt;

  if (raw.type === "game.team.proposed") {
    const team = readStringArray(raw.team);
    if (!team.length) {
      return { type: "invalid", message: "Rejected empty team proposal." };
    }

    return {
      type: "payload",
      payload: {
        type: "game.team.proposed",
        proposerId: envelope.senderId,
        team,
        sentAt,
      },
    };
  }

  if (raw.type === "game.team_vote.commit") {
    const commitment = readString(raw.commitment);
    const questIndex = readNonNegativeInteger(raw.questIndex);
    const attempt = readPositiveInteger(raw.attempt);
    if (!commitment || questIndex === null || attempt === null) {
      return { type: "invalid", message: "Rejected malformed team vote commit." };
    }

    return {
      type: "payload",
      payload: {
        type: "game.team_vote.commit",
        voterId: envelope.senderId,
        questIndex,
        attempt,
        commitment,
        sentAt,
      },
    };
  }

  if (raw.type === "game.team_vote.reveal") {
    const commitment = readString(raw.commitment);
    const salt = readString(raw.salt);
    const choice = readTeamVoteChoice(raw.choice);
    const questIndex = readNonNegativeInteger(raw.questIndex);
    const attempt = readPositiveInteger(raw.attempt);
    if (!commitment || !salt || !choice || questIndex === null || attempt === null) {
      return { type: "invalid", message: "Rejected malformed team vote reveal." };
    }

    const expected = await gameVoteCommitment(envelope.senderId, gameVoteScope("team", questIndex, attempt), choice, salt);
    if (commitment !== expected) {
      return { type: "invalid", message: "Rejected team vote reveal that does not match commitment." };
    }

    return {
      type: "payload",
      payload: {
        type: "game.team_vote.reveal",
        voterId: envelope.senderId,
        questIndex,
        attempt,
        choice,
        salt,
        commitment,
        sentAt,
      },
    };
  }

  if (raw.type === "game.mission_vote.commit") {
    const commitment = readString(raw.commitment);
    const questIndex = readNonNegativeInteger(raw.questIndex);
    const attempt = readPositiveInteger(raw.attempt);
    if (!commitment || questIndex === null || attempt === null) {
      return { type: "invalid", message: "Rejected malformed mission vote commit." };
    }

    return {
      type: "payload",
      payload: {
        type: "game.mission_vote.commit",
        voterId: envelope.senderId,
        questIndex,
        attempt,
        commitment,
        sentAt,
      },
    };
  }

  if (raw.type === "game.mission_vote.reveal") {
    const commitment = readString(raw.commitment);
    const salt = readString(raw.salt);
    const choice = readMissionVoteChoice(raw.choice);
    const questIndex = readNonNegativeInteger(raw.questIndex);
    const attempt = readPositiveInteger(raw.attempt);
    if (!commitment || !salt || !choice || questIndex === null || attempt === null) {
      return { type: "invalid", message: "Rejected malformed mission vote reveal." };
    }

    const expected = await gameVoteCommitment(envelope.senderId, gameVoteScope("mission", questIndex, attempt), choice, salt);
    if (commitment !== expected) {
      return { type: "invalid", message: "Rejected mission vote reveal that does not match commitment." };
    }

    return {
      type: "payload",
      payload: {
        type: "game.mission_vote.reveal",
        voterId: envelope.senderId,
        questIndex,
        attempt,
        choice,
        salt,
        commitment,
        sentAt,
      },
    };
  }

  if (raw.type === "game.assassination.resolved") {
    const targetId = readString(raw.targetId);
    if (!targetId || typeof raw.hitMerlin !== "boolean") {
      return { type: "invalid", message: "Rejected malformed assassination event." };
    }

    return {
      type: "payload",
      payload: {
        type: "game.assassination.resolved",
        assassinId: envelope.senderId,
        targetId,
        hitMerlin: raw.hitMerlin,
        sentAt,
      },
    };
  }

  return { type: "none" };
}

export function deriveGameProtocolSnapshot(
  players: readonly Player[],
  payloads: readonly GameProtocolPayload[],
): GameProtocolSnapshot {
  if (players.length < 5 || players.length > 10) {
    return {
      state: null,
      acceptedPayloads: [],
      pending: {},
      errors: [],
    };
  }

  const ordered = [...payloads].sort(compareGamePayloads);
  let state = createInitialGameState(players);
  const acceptedPayloads: GameProtocolPayload[] = [];
  const errors: string[] = [];
  const teamCommits = new Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.team_vote.commit" }>>();
  const teamReveals = new Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.team_vote.reveal" }>>();
  const missionCommits = new Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.mission_vote.commit" }>>();
  const missionReveals = new Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.mission_vote.reveal" }>>();

  for (const payload of ordered) {
    try {
      if (payload.type === "game.team.proposed") {
        state = applyGameEvent(state, teamProposed(payload.proposerId, payload.team));
        acceptedPayloads.push(payload);
        continue;
      }

      if (payload.type === "game.team_vote.commit") {
        addUnique(teamCommits, voteKey(payload.questIndex, payload.attempt), payload.voterId, payload);
        acceptedPayloads.push(payload);
        continue;
      }

      if (payload.type === "game.team_vote.reveal") {
        const key = voteKey(payload.questIndex, payload.attempt);
        const committed = teamCommits.get(key)?.get(payload.voterId);
        if (!committed || committed.commitment !== payload.commitment) {
          continue;
        }
        addUnique(teamReveals, key, payload.voterId, payload);
        acceptedPayloads.push(payload);
        const activeKey = activeVoteKey(state);
        const reveals = teamReveals.get(activeKey);
        if (state.phase === "teamVote" && reveals?.size === state.players.length) {
          const revealed = [...reveals.values()];
          state = applyGameEvent(
            state,
            teamVoteResolved(
              revealed.filter((vote) => vote.choice === "approve").map((vote) => vote.voterId),
              revealed.filter((vote) => vote.choice === "reject").map((vote) => vote.voterId),
            ),
          );
        }
        continue;
      }

      if (payload.type === "game.mission_vote.commit") {
        addUnique(missionCommits, voteKey(payload.questIndex, payload.attempt), payload.voterId, payload);
        acceptedPayloads.push(payload);
        continue;
      }

      if (payload.type === "game.mission_vote.reveal") {
        if (state.phase !== "missionVote" || !state.activeProposal?.team.includes(payload.voterId)) {
          continue;
        }
        const key = voteKey(payload.questIndex, payload.attempt);
        const committed = missionCommits.get(key)?.get(payload.voterId);
        if (!committed || committed.commitment !== payload.commitment) {
          continue;
        }
        addUnique(missionReveals, key, payload.voterId, payload);
        acceptedPayloads.push(payload);
        const reveals = missionReveals.get(activeVoteKey(state));
        if (reveals?.size === state.activeProposal.team.length) {
          const failCount = [...reveals.values()].filter((vote) => vote.choice === "fail").length;
          state = applyGameEvent(state, missionResolved(failCount));
        }
        continue;
      }

      if (payload.type === "game.assassination.resolved") {
        state = applyGameEvent(state, assassinationResolved(payload.assassinId, payload.targetId, payload.hitMerlin));
        acceptedPayloads.push(payload);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Game protocol event rejected.");
    }
  }

  return {
    state,
    acceptedPayloads,
    pending: pendingFromState(state, teamCommits, teamReveals, missionCommits, missionReveals),
    errors,
  };
}

export function gameVoteScope(kind: "team" | "mission", questIndex: number, attempt: number): string {
  return `${kind}:${questIndex}:${attempt}`;
}

export async function gameVoteCommitment(
  playerId: PlayerId,
  scope: string,
  choice: string,
  salt: string,
): Promise<string> {
  return sha256Base64Url(`${playerId}:${scope}:${choice}:${salt}`);
}

export function randomVoteSalt(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function activeVoteKey(state: GameState): string {
  return voteKey(state.questIndex, state.activeProposal?.attempt ?? state.rejectionCount + 1);
}

function pendingFromState(
  state: GameState,
  teamCommits: Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.team_vote.commit" }>>,
  teamReveals: Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.team_vote.reveal" }>>,
  missionCommits: Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.mission_vote.commit" }>>,
  missionReveals: Map<string, Map<PlayerId, GameProtocolPayload & { type: "game.mission_vote.reveal" }>>,
): GameProtocolPending {
  if (state.phase === "teamVote") {
    const key = activeVoteKey(state);
    return {
      teamVote: {
        questIndex: state.questIndex,
        attempt: state.activeProposal?.attempt ?? 1,
        commits: teamCommits.get(key)?.size ?? 0,
        reveals: teamReveals.get(key)?.size ?? 0,
        required: state.players.length,
      },
    };
  }

  if (state.phase === "missionVote" && state.activeProposal?.approved) {
    const key = activeVoteKey(state);
    return {
      missionVote: {
        questIndex: state.questIndex,
        attempt: state.activeProposal.attempt,
        commits: missionCommits.get(key)?.size ?? 0,
        reveals: missionReveals.get(key)?.size ?? 0,
        required: state.activeProposal.team.length,
      },
    };
  }

  return {};
}

function addUnique<T>(store: Map<string, Map<PlayerId, T>>, key: string, playerId: PlayerId, value: T): void {
  const values = store.get(key) ?? new Map<PlayerId, T>();
  if (!values.has(playerId)) {
    values.set(playerId, value);
    store.set(key, values);
  }
}

function voteKey(questIndex: number, attempt: number): string {
  return `${questIndex}:${attempt}`;
}

function compareGamePayloads(left: GameProtocolPayload, right: GameProtocolPayload): number {
  if (left.sentAt !== right.sentAt) {
    return left.sentAt - right.sentAt;
  }
  return payloadActor(left).localeCompare(payloadActor(right));
}

function payloadActor(payload: GameProtocolPayload): string {
  if (payload.type === "game.team.proposed") {
    return payload.proposerId;
  }
  if (payload.type === "game.assassination.resolved") {
    return payload.assassinId;
  }
  return payload.voterId;
}

function readTeamVoteChoice(value: unknown): TeamVoteChoice | null {
  return value === "approve" || value === "reject" ? value : null;
}

function readMissionVoteChoice(value: unknown): MissionVoteChoice | null {
  return value === "success" || value === "fail" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
