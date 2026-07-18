export type PlayerId = string;

export type Alignment = "good" | "evil";

export type Role = "merlin" | "assassin" | "loyal-servant" | "minion";

export type Player = {
  id: PlayerId;
  name: string;
  seat: number;
};

export type GameConfig = {
  playerCount: number;
  goodCount: number;
  evilCount: number;
  questTeamSizes: readonly [number, number, number, number, number];
  questFailThresholds: readonly [number, number, number, number, number];
  roleDeck: readonly Role[];
};

export type QuestStatus = "pending" | "success" | "failure";

export type QuestRecord = {
  index: number;
  teamSize: number;
  failThreshold: number;
  status: QuestStatus;
  team?: readonly PlayerId[];
  failCount?: number;
  proposalAttempt?: number;
};

export type ProposalRecord = {
  questIndex: number;
  attempt: number;
  leaderId: PlayerId;
  team: readonly PlayerId[];
  approvals?: readonly PlayerId[];
  rejections?: readonly PlayerId[];
  approved?: boolean;
};

export type GamePhase =
  | "proposal"
  | "teamVote"
  | "missionVote"
  | "assassination"
  | "ended";

export type VictoryReason =
  | "three_failed_quests"
  | "five_rejected_teams"
  | "assassin_hit_merlin"
  | "assassin_missed_merlin";

export type GameWinner = Alignment;

export type AssassinationRecord = {
  assassinId: PlayerId;
  targetId: PlayerId;
  hitMerlin: boolean;
};

export type GameState = {
  phase: GamePhase;
  players: readonly Player[];
  config: GameConfig;
  leaderIndex: number;
  questIndex: number;
  rejectionCount: number;
  quests: readonly QuestRecord[];
  proposalHistory: readonly ProposalRecord[];
  activeProposal?: ProposalRecord;
  winner?: GameWinner;
  victoryReason?: VictoryReason;
  assassination?: AssassinationRecord;
};

export type TeamProposedEvent = {
  type: "team.proposed";
  proposerId: PlayerId;
  team: readonly PlayerId[];
};

export type TeamVoteResolvedEvent = {
  type: "team.vote.resolved";
  approvals: readonly PlayerId[];
  rejections: readonly PlayerId[];
};

export type MissionResolvedEvent = {
  type: "mission.resolved";
  failCount: number;
};

export type AssassinationResolvedEvent = {
  type: "assassination.resolved";
  assassinId: PlayerId;
  targetId: PlayerId;
  hitMerlin: boolean;
};

export type GameEvent =
  | TeamProposedEvent
  | TeamVoteResolvedEvent
  | MissionResolvedEvent
  | AssassinationResolvedEvent;
