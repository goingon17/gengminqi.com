import { getGameConfig, getRoleAlignment, type Alignment, type Player, type PlayerId, type Role } from "@/lib/game";
import { sha256Base64Url } from "@/lib/crypto/codec";

export type RoleProtocolPlayer = Player & {
  keyFingerprint?: string | null;
};

export type RoleAssignment = {
  playerId: PlayerId;
  name: string;
  seat: number;
  role: Role;
  alignment: Alignment;
};

export type RoleDeal = {
  roomId: string;
  seed: string;
  assignments: RoleAssignment[];
};

export type RolePrivateView = {
  self: RoleAssignment;
  visiblePlayers: RoleAssignment[];
  note: string;
};

export type RoleSeedReveal = {
  playerId: PlayerId;
  commitment: string;
  secret: string;
};

export function buildRoleDeal(roomId: string, players: RoleProtocolPlayer[], seed: string): RoleDeal {
  const seatedPlayers = normalizeProtocolPlayers(players);
  const config = getGameConfig(seatedPlayers.length);
  const roles = deterministicShuffle([...config.roleDeck], `${roomId}:${seed}`);

  return {
    roomId,
    seed,
    assignments: seatedPlayers.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      seat: player.seat,
      role: roles[index],
      alignment: getRoleAlignment(roles[index]),
    })),
  };
}

export function privateViewForPlayer(deal: RoleDeal, playerId: PlayerId): RolePrivateView {
  const self = deal.assignments.find((assignment) => assignment.playerId === playerId);
  if (!self) {
    throw new Error("Player is not part of this role deal.");
  }

  if (self.role === "merlin") {
    return {
      self,
      visiblePlayers: deal.assignments.filter((assignment) => assignment.alignment === "evil"),
      note: "Merlin privately sees the evil team.",
    };
  }

  if (self.alignment === "evil") {
    return {
      self,
      visiblePlayers: deal.assignments.filter((assignment) => assignment.alignment === "evil" && assignment.playerId !== playerId),
      note: "Evil players privately see each other.",
    };
  }

  return {
    self,
    visiblePlayers: [],
    note: "Loyal servants see no hidden identities.",
  };
}

export async function verifyRoleReveal(reveal: RoleSeedReveal): Promise<boolean> {
  return reveal.commitment === await roleSeedCommitment(reveal.playerId, reveal.secret);
}

export function roleSeedCommitment(playerId: PlayerId, secret: string): Promise<string> {
  return sha256Base64Url(`${playerId}:${secret}`);
}

export async function combineRoleSeed(roomId: string, genesisHash: string, reveals: RoleSeedReveal[]): Promise<string> {
  const verified = [];
  for (const reveal of reveals) {
    if (!(await verifyRoleReveal(reveal))) {
      throw new Error("Role seed reveal does not match its commitment.");
    }
    verified.push(reveal);
  }

  verified.sort((left, right) => left.playerId.localeCompare(right.playerId));
  if (verified.length !== reveals.length) {
    throw new Error("Role seed reveal does not match its commitment.");
  }

  return sha256Base64Url(
    JSON.stringify({
      roomId,
      genesisHash,
      reveals: verified.map((reveal) => ({
        playerId: reveal.playerId,
        commitment: reveal.commitment,
        secret: reveal.secret,
      })),
    }),
  );
}

export function roleBiasSimulation(playerCount: number, rounds: number): Array<Record<Role, number>> {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    seat: index + 1,
  }));
  const counts = Array.from({ length: playerCount }, () => ({
    merlin: 0,
    assassin: 0,
    "loyal-servant": 0,
    minion: 0,
  }));

  for (let round = 0; round < rounds; round += 1) {
    const deal = buildRoleDeal("SIM", players, `round-${round}`);
    for (const [seatIndex, assignment] of deal.assignments.entries()) {
      counts[seatIndex][assignment.role] += 1;
    }
  }

  return counts;
}

function normalizeProtocolPlayers(players: RoleProtocolPlayer[]): RoleProtocolPlayer[] {
  const normalized = [...players].sort((left, right) => left.seat - right.seat);
  if (normalized.length < 5 || normalized.length > 10) {
    throw new Error("Role protocol requires 5-10 players.");
  }

  const ids = new Set(normalized.map((player) => player.id));
  if (ids.size !== normalized.length) {
    throw new Error("Role protocol players must be unique.");
  }

  return normalized;
}

function deterministicShuffle<T>(values: T[], seed: string): T[] {
  const random = seededRandom(seed);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const tmp = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = tmp;
  }
  return values;
}

function seededRandom(seed: string): () => number {
  let state = fnv1a64(seed);
  return () => {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= 0xffff_ffff_ffff_ffffn;
    return Number(state >> 11n) / 2 ** 53;
  };
}

function fnv1a64(input: string): bigint {
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x0000_0100_0000_01b3n) & 0xffff_ffff_ffff_ffffn;
  }
  return hash;
}
