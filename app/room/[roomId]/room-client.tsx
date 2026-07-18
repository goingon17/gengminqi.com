"use client";

import {
  Activity,
  AlertTriangle,
  Castle,
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  Flag,
  Lock,
  PauseCircle,
  Radio,
  RefreshCcw,
  Send,
  Shield,
  Sparkles,
  Swords,
  Users,
  Vote,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsonFromBase64Url, jsonToBase64Url } from "@/lib/crypto/codec";
import {
  appendRoomEnvelope,
  clearRoomSecrets,
  loadOrCreateRoleSeed,
  loadOrCreatePlayerIdentity,
  loadRoomEnvelopes,
  type StoredRoleSeed,
} from "@/lib/crypto/local-store";
import {
  publicKeysFromIdentity,
  type PlayerIdentity,
} from "@/lib/crypto/player-identity";
import type { RelayEnvelope } from "@/lib/protocol/envelope";
import {
  buildGenesis,
  genesisChecksum,
  genesisDigest,
  genesisReady,
} from "@/lib/protocol/genesis";
import {
  createSignedEnvelope,
  relayEnvelopeHash,
  verifyRelayEnvelope,
} from "@/lib/protocol/signed-envelope";
import {
  combineRoleSeed,
  roleSeedCommitment,
  type RoleAssignment,
  type RolePrivateView,
  type RoleProtocolPlayer,
  type RoleSeedReveal,
} from "@/lib/protocol/role-assignment";
import {
  activeVoteKey,
  deriveGameProtocolSnapshot,
  gameProtocolPayloadFromEnvelope,
  gameVoteCommitment,
  gameVoteScope,
  randomVoteSalt,
  type GameProtocolSnapshot,
  type GameProtocolPayload,
  type MissionVoteChoice,
  type TeamVoteChoice,
} from "@/lib/protocol/game-protocol";
import { currentLeader, currentQuest, type GameState } from "@/lib/game";
import type { PublicRoom } from "@/lib/relay/rooms";

type SocketState = "idle" | "joining" | "open" | "polling" | "closed" | "error";

type RelayEvent =
  | {
      type: "joined";
      roomId: string;
      connectionId: string;
      redisConfigured: boolean;
      room?: PublicRoom;
    }
  | {
      type: "room";
      room: PublicRoom;
    }
  | {
      type: "presence";
      roomId: string;
      peers: Array<{ playerId: string; name: string }>;
    }
  | {
      type: "heartbeat";
      now: number;
      roomId?: string;
    }
  | {
      type: "envelope";
      envelope: RelayEnvelope;
      relay: "local" | "redis";
    }
  | {
      type: "replay";
      roomId: string;
      envelopes: RelayEnvelope[];
      redisConfigured: boolean;
    }
  | {
      type: "error";
      message: string;
    };

type PublicRoomEvent = {
  id: string;
  senderId: string;
  text: string;
  sequence: number;
  hash: string;
  verified: boolean;
  receivedAt: number;
  relay: "local" | "redis" | "polling" | "replay" | "stored";
};

type RoomSyncResponse = {
  room: PublicRoom | null;
  envelopes: RelayEnvelope[];
  redisConfigured: boolean;
  transport: "polling";
  error?: string;
};

type PollingSyncBody =
  | {
      type: "join";
      playerId: string;
      name: string;
      publicKeys: ReturnType<typeof publicKeysFromIdentity>;
    }
  | {
      type: "heartbeat";
      playerId: string;
    }
  | {
      type: "lock";
      playerId: string;
    }
  | {
      type: "envelope";
      envelope: RelayEnvelope;
    }
  | {
      type: "replay";
    };

type GenesisSummary = {
  ready: boolean;
  hash: string;
  words: string[];
};

type RoleContribution = {
  playerId: string;
  name: string;
  commitment?: string;
  secret?: string;
  committedAt?: number;
  revealedAt?: number;
};

type RoleProtocolStatus = "waiting" | "commit" | "reveal" | "assigning" | "ready" | "error";

type RoleWorkerEvent =
  | {
      type: "assigned";
      generatedAt: number;
      elapsedMs: number;
      jiffAvailable: boolean;
      view: RolePrivateView;
      assignments: RoleAssignment[];
    }
  | {
      type: "error";
      message: string;
    };

type RoleProtocolEvent =
  | {
      type: "none";
    }
  | {
      type: "invalid";
      message: string;
    }
  | {
      type: "commit" | "reveal";
      contribution: RoleContribution;
    };

type LocalVoteDraft = {
  choice: TeamVoteChoice | MissionVoteChoice;
  salt: string;
  commitment: string;
};

const HEARTBEAT_MS = 12_000;
const POLLING_MS = 3_000;
const CLOCK_TICK_MS = 5_000;
const PROTOCOL_WAIT_MS = 75_000;

export function RoomClient({ roomId }: { roomId: string }) {
  const normalizedRoomId = useMemo(() => normalizeRoom(roomId), [roomId]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingActiveRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});
  const startPollingRef = useRef<() => void>(() => {});
  const pollReplayRef = useRef<() => void>(() => {});
  const storedLogLoadedRef = useRef(false);
  const seenHashesRef = useRef(new Set<string>());
  const lastHashBySenderRef = useRef(new Map<string, string>());
  const lastSequenceBySenderRef = useRef(new Map<string, number>());
  const roleWorkerRef = useRef<Worker | null>(null);

  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [roleSeed, setRoleSeed] = useState<StoredRoleSeed | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("idle");
  const [redisConfigured, setRedisConfigured] = useState(false);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [events, setEvents] = useState<PublicRoomEvent[]>([]);
  const [roleContributions, setRoleContributions] = useState<Record<string, RoleContribution>>({});
  const [roleStatus, setRoleStatus] = useState<RoleProtocolStatus>("waiting");
  const [roleView, setRoleView] = useState<RolePrivateView | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [roleVisible, setRoleVisible] = useState(false);
  const [roleWorkerNote, setRoleWorkerNote] = useState("Worker idle");
  const [gamePayloads, setGamePayloads] = useState<GameProtocolPayload[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [voteDrafts, setVoteDrafts] = useState<Record<string, LocalVoteDraft>>({});
  const [assassinationTarget, setAssassinationTarget] = useState("");
  const [secretsCleared, setSecretsCleared] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [lastActivityAt, setLastActivityAt] = useState(0);
  const [terminated, setTerminated] = useState(false);
  const [genesis, setGenesis] = useState<GenesisSummary>({
    ready: false,
    hash: "",
    words: [],
  });
  const [draft, setDraft] = useState("Ready at the table");
  const [error, setError] = useState<string | null>(null);

  const signingKeysByPlayer = useMemo(() => {
    const keys = new Map<string, JsonWebKey>();
    if (identity) {
      keys.set(identity.playerId, identity.signingPublicKey);
    }
    for (const player of room?.players ?? []) {
      if (player.publicKeys) {
        keys.set(player.id, player.publicKeys.signingPublicKey);
      }
    }
    return keys;
  }, [identity, room]);

  const rolePlayers = useMemo<RoleProtocolPlayer[]>(
    () =>
      (room?.players ?? [])
        .filter((player) => Boolean(player.publicKeys))
        .sort((left, right) => left.seat - right.seat)
        .map((player) => ({
          id: player.id,
          name: player.name,
          seat: player.seat,
          keyFingerprint: player.publicKeys?.keyFingerprint,
        })),
    [room],
  );
  const rolePlayerIds = useMemo(() => rolePlayers.map((player) => player.id), [rolePlayers]);
  const commitCount = rolePlayerIds.filter((id) => roleContributions[id]?.commitment).length;
  const revealCount = rolePlayerIds.filter((id) => roleContributions[id]?.secret).length;
  const localCommitted = Boolean(playerId && roleContributions[playerId]?.commitment);
  const localRevealed = Boolean(playerId && roleContributions[playerId]?.secret);
  const gameSnapshot = useMemo(() => deriveGameProtocolSnapshot(rolePlayers, gamePayloads), [gamePayloads, rolePlayers]);
  const gameState = gameSnapshot.state;
  const gameQuest = gameState && gameState.phase !== "ended" ? currentQuest(gameState) : null;
  const gameLeader = gameState && gameState.phase !== "ended" ? currentLeader(gameState) : null;
  const activeGameKey = gameState ? activeVoteKey(gameState) : "";
  const localTeamVote = activeGameKey ? voteDrafts[`team:${activeGameKey}`] : undefined;
  const localMissionVote = activeGameKey ? voteDrafts[`mission:${activeGameKey}`] : undefined;
  const proposedTeam = gameState?.activeProposal?.team ?? [];

  const addEvent = useCallback((event: PublicRoomEvent) => {
    setEvents((current) => {
      if (current.some((item) => item.id === event.id)) {
        return current;
      }
      return [event, ...current].slice(0, 24);
    });
  }, []);

  const markActivity = useCallback(() => {
    setLastActivityAt(currentTimestamp());
  }, []);

  const requestReplay = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "replay", roomId: normalizedRoomId }));
      return;
    }
    pollReplayRef.current();
  }, [normalizedRoomId]);

  const acceptEnvelope = useCallback(
    async (envelope: RelayEnvelope, relay: PublicRoomEvent["relay"]) => {
      if (normalizeRoom(envelope.roomId) !== normalizedRoomId) {
        return;
      }

      const hash = await relayEnvelopeHash(envelope);
      if (seenHashesRef.current.has(hash)) {
        return;
      }

      const publicKey = signingKeysByPlayer.get(envelope.senderId);
      if (!publicKey) {
        setError("Waiting for sender public key. Requesting replay.");
        requestReplay();
        return;
      }

      const verified = await verifyRelayEnvelope(envelope, publicKey);
      if (!verified) {
        setError(`Rejected invalid signature from ${envelope.senderId.slice(0, 8)}.`);
        return;
      }

      const expectedSequence = (lastSequenceBySenderRef.current.get(envelope.senderId) ?? 0) + 1;
      const expectedPreviousHash = lastHashBySenderRef.current.get(envelope.senderId) ?? "genesis";

      if (envelope.sequence < expectedSequence) {
        return;
      }

      if (envelope.sequence !== expectedSequence || envelope.previousHash !== expectedPreviousHash) {
        setError("Detected a missing or forked event. Requesting replay.");
        requestReplay();
        return;
      }

      const roleEvent = await roleProtocolEventFromEnvelope(envelope, room?.players.find((player) => player.id === envelope.senderId)?.name);
      if (roleEvent.type === "invalid") {
        setError(roleEvent.message);
        return;
      }

      const gameEvent = await gameProtocolPayloadFromEnvelope(envelope);
      if (gameEvent.type === "invalid") {
        setError(gameEvent.message);
        return;
      }

      seenHashesRef.current.add(hash);
      markActivity();
      lastSequenceBySenderRef.current.set(envelope.senderId, envelope.sequence);
      lastHashBySenderRef.current.set(envelope.senderId, hash);

      if (roleEvent.type === "commit" || roleEvent.type === "reveal") {
        setRoleContributions((current) => mergeRoleContribution(current, roleEvent.contribution));
      }
      if (gameEvent.type === "payload") {
        setGamePayloads((current) => (current.some((payload) => sameGamePayload(payload, gameEvent.payload)) ? current : [...current, gameEvent.payload]));
      }

      if (relay !== "stored") {
        await appendRoomEnvelope({
          roomId: normalizedRoomId,
          hash,
          envelope,
          relay,
          receivedAt: currentTimestamp(),
        });
      }

      addEvent(publicEventFromEnvelope(envelope, relay, hash, verified));
      setError(null);
    },
    [addEvent, markActivity, normalizedRoomId, requestReplay, room?.players, signingKeysByPlayer],
  );

  const handleRelayMessage = useCallback(
    async (raw: string) => {
      const event = parseRelayEvent(raw);
      if (!event) {
        setError("Received an unreadable relay event.");
        return;
      }

      markActivity();

      if (event.type === "joined") {
        setRedisConfigured(event.redisConfigured);
        if (event.room) {
          setRoom(event.room);
        }
        return;
      }

      if (event.type === "room") {
        setRoom(event.room);
        return;
      }

      if (event.type === "presence") {
        return;
      }

      if (event.type === "heartbeat") {
        return;
      }

      if (event.type === "replay") {
        setRedisConfigured(event.redisConfigured);
        for (const envelope of event.envelopes) {
          await acceptEnvelope(envelope, "replay");
        }
        return;
      }

      if (event.type === "envelope") {
        await acceptEnvelope(event.envelope, event.relay);
        return;
      }

      if (event.type === "error") {
        setError(event.message);
      }
    },
    [acceptEnvelope, markActivity],
  );

  const processRoomSync = useCallback(
    async (sync: RoomSyncResponse) => {
      setRedisConfigured(sync.redisConfigured);
      if (sync.room) {
        setRoom(sync.room);
      }
      for (const envelope of sync.envelopes) {
        await acceptEnvelope(envelope, "polling");
      }
      markActivity();
      setError(null);
    },
    [acceptEnvelope, markActivity],
  );

  const postRoomSync = useCallback(
    async (body: PollingSyncBody) => {
      const response = await fetch(`/api/rooms/${encodeURIComponent(normalizedRoomId)}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const sync = (await response.json()) as RoomSyncResponse;
      if (!response.ok) {
        throw new Error(sync.error ?? "Room sync failed.");
      }
      await processRoomSync(sync);
    },
    [normalizedRoomId, processRoomSync],
  );

  const startPolling = useCallback(() => {
    if (!playerId || !identity) {
      return;
    }

    pollingActiveRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }

    setSocketState("polling");
    void postRoomSync({
      type: "join",
      playerId,
      name: playerName,
      publicKeys: publicKeysFromIdentity(identity),
    }).catch(() => {
      setSocketState("error");
      setError("Relay compatibility mode is retrying.");
    });

    if (!pollingTimerRef.current) {
      pollingTimerRef.current = setInterval(() => {
        void postRoomSync({ type: "heartbeat", playerId }).catch(() => {
          setSocketState("error");
          setError("Relay compatibility mode is retrying.");
        });
      }, POLLING_MS);
    }
  }, [identity, playerId, playerName, postRoomSync]);

  useEffect(() => {
    startPollingRef.current = startPolling;
    pollReplayRef.current = () => {
      void postRoomSync({ type: "replay" }).catch(() => {
        setError("Could not replay the room yet.");
      });
    };
  }, [postRoomSync, startPolling]);

  const connect = useCallback(() => {
    if (!playerId || !identity) {
      return;
    }

    pollingActiveRef.current = false;
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    manualDisconnectRef.current = false;
    socketRef.current?.close();
    setSocketState("joining");
    setError(null);

    const socket = new WebSocket(webSocketUrl());
    socketRef.current = socket;
    connectTimeoutRef.current = setTimeout(() => {
      if (socketRef.current !== socket || socket.readyState === WebSocket.OPEN) {
        return;
      }
      setError(null);
      startPollingRef.current();
      socket.close();
    }, 3_500);

    socket.addEventListener("open", () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setSocketState("open");
      socket.send(
        JSON.stringify({
          type: "join",
          roomId: normalizedRoomId,
          playerId,
          name: playerName,
          publicKeys: publicKeysFromIdentity(identity),
        }),
      );
      heartbeatTimerRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "heartbeat", roomId: normalizedRoomId, playerId }));
        }
      }, HEARTBEAT_MS);
    });

    socket.addEventListener("message", (message) => {
      void handleRelayMessage(message.data.toString());
    });

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) {
        return;
      }

      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }

      setSocketState("closed");
      if (!manualDisconnectRef.current && !pollingActiveRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current();
        }, 1_200);
      }
    });

    socket.addEventListener("error", () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setSocketState("polling");
      setError(null);
      startPollingRef.current();
    });
  }, [handleRelayMessage, identity, normalizedRoomId, playerId, playerName]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const timestamp = currentTimestamp();
      setNowMs(timestamp);
      setLastActivityAt((current) => current || timestamp);
    });

    const interval = setInterval(() => {
      const timestamp = currentTimestamp();
      queueMicrotask(() => {
        if (!cancelled) {
          setNowMs(timestamp);
        }
      });
    }, CLOCK_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const timestamp = currentTimestamp();
      setNowMs(timestamp);
      setLastActivityAt(timestamp);

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        requestReplay();
        return;
      }

      if (pollingActiveRef.current) {
        pollReplayRef.current();
        return;
      }

      connectRef.current();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestReplay]);

  useEffect(() => {
    const savedPlayerId = localStorage.getItem("avalon:playerId") ?? crypto.randomUUID();
    const savedName = localStorage.getItem("avalon:playerName") ?? `Player ${savedPlayerId.slice(0, 4)}`;
    localStorage.setItem("avalon:playerId", savedPlayerId);
    localStorage.setItem("avalon:playerName", savedName);
    void loadOrCreatePlayerIdentity(savedPlayerId, savedName)
      .then((loadedIdentity) => {
        queueMicrotask(() => {
          setPlayerId(savedPlayerId);
          setPlayerName(savedName);
          setIdentity(loadedIdentity);
        });
      })
      .catch(() => {
        queueMicrotask(() => {
          setError("Could not open local identity storage.");
        });
      });
  }, []);

  useEffect(() => {
    if (!identity) {
      return;
    }

    void loadOrCreateRoleSeed(normalizedRoomId, identity.playerId)
      .then((seed) => {
        queueMicrotask(() => {
          setRoleSeed(seed);
        });
      })
      .catch(() => {
        queueMicrotask(() => {
          setError("Could not create local role seed.");
        });
      });
  }, [identity, normalizedRoomId]);

  useEffect(() => {
    if (playerId && identity) {
      queueMicrotask(() => {
        connectRef.current();
      });
    }

    return () => {
      manualDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [connect, identity, playerId]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const record = buildGenesis(room);
    void Promise.all([genesisDigest(record), genesisChecksum(record)]).then(([hash, words]) => {
      queueMicrotask(() => {
        setGenesis({
          ready: genesisReady(record),
          hash,
          words,
        });
      });
    });
  }, [room]);

  useEffect(() => {
    if (!room || !identity || storedLogLoadedRef.current) {
      return;
    }

    storedLogLoadedRef.current = true;
    void loadRoomEnvelopes(normalizedRoomId)
      .then(async (stored) => {
        for (const item of stored) {
          await acceptEnvelope(item.envelope, "stored");
        }
      })
      .catch(() => {
        queueMicrotask(() => {
          setError("Could not restore local event log.");
        });
      });
  }, [acceptEnvelope, identity, normalizedRoomId, room]);

  async function runRoleWorker({
    roomId: workerRoomId,
    playerId: workerPlayerId,
    players,
    genesisHash,
    reveals,
  }: {
    roomId: string;
    playerId: string;
    players: RoleProtocolPlayer[];
    genesisHash: string;
    reveals: RoleSeedReveal[];
  }) {
    try {
      const seed = await combineRoleSeed(workerRoomId, genesisHash, reveals);
      const worker = new Worker(new URL("../../../workers/role-mpc.worker.ts", import.meta.url), {
        type: "module",
      });
      roleWorkerRef.current?.terminate();
      roleWorkerRef.current = worker;

      const timeout = setTimeout(() => {
        worker.terminate();
        roleWorkerRef.current = null;
        setRoleStatus("error");
        setRoleWorkerNote("Role worker timed out");
      }, 8_000);

      worker.addEventListener("message", (event: MessageEvent<RoleWorkerEvent>) => {
        clearTimeout(timeout);
        worker.terminate();
        roleWorkerRef.current = null;

        if (event.data.type === "assigned") {
          setRoleView(event.data.view);
          setRoleAssignments(event.data.assignments);
          setRoleStatus("ready");
          setRoleWorkerNote(
            `${event.data.jiffAvailable ? "JIFF loaded" : "JIFF unavailable"} · ${Math.round(event.data.elapsedMs)}ms`,
          );
          return;
        }

        setRoleStatus("error");
        setRoleWorkerNote(event.data.message);
      });

      worker.postMessage({
        type: "assign",
        roomId: workerRoomId,
        playerId: workerPlayerId,
        players,
        seed,
      });
    } catch (workerError) {
      setRoleStatus("error");
      setRoleWorkerNote(workerError instanceof Error ? workerError.message : "Role protocol failed");
    }
  }

  useEffect(() => {
    if (!identity || roleView || roleWorkerRef.current || !genesis.hash || rolePlayerIds.length < 5) {
      return;
    }

    const reveals = rolePlayerIds
      .map((id) => roleContributions[id])
      .filter((contribution): contribution is Required<Pick<RoleContribution, "playerId" | "commitment" | "secret">> & RoleContribution =>
        Boolean(contribution?.commitment && contribution.secret),
      )
      .map((contribution) => ({
        playerId: contribution.playerId,
        commitment: contribution.commitment,
        secret: contribution.secret,
      }));

    if (reveals.length !== rolePlayerIds.length) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setRoleStatus("assigning");
      setRoleWorkerNote("Combining revealed seeds in worker");
      void runRoleWorker({
        roomId: normalizedRoomId,
        playerId: identity.playerId,
        players: rolePlayers,
        genesisHash: genesis.hash,
        reveals,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [genesis.hash, identity, normalizedRoomId, roleContributions, rolePlayerIds, rolePlayers, roleView]);

  async function sendPublicEvent() {
    const text = draft.trim().slice(0, 120);
    if (!text) {
      return;
    }

    await sendSignedPayload("room.public_event", {
      type: "room.public_event",
      text,
      name: playerName,
      sentAt: currentTimestamp(),
    });
    setDraft("Ready at the table");
  }

  async function sendRoleCommit() {
    if (!roleSeed) {
      setError("Local role seed is not ready yet.");
      return;
    }

    await sendSignedPayload("role.seed.commit", {
      type: "role.seed.commit",
      commitment: roleSeed.commitment,
      name: playerName,
      sentAt: currentTimestamp(),
    });
  }

  async function sendRoleReveal() {
    if (!roleSeed) {
      setError("Local role seed is not ready yet.");
      return;
    }

    await sendSignedPayload("role.seed.reveal", {
      type: "role.seed.reveal",
      commitment: roleSeed.commitment,
      secret: roleSeed.secret,
      name: playerName,
      sentAt: currentTimestamp(),
    });
  }

  async function sendTeamProposal() {
    if (!gameState || !gameQuest || selectedTeam.length !== gameQuest.teamSize) {
      setError("Select the exact quest team before proposing.");
      return;
    }

    await sendSignedPayload("game.team.proposed", {
      type: "game.team.proposed",
      team: selectedTeam,
      sentAt: currentTimestamp(),
    });
  }

  async function sendTeamVoteCommit(choice: TeamVoteChoice) {
    if (!gameState) {
      return;
    }

    const scope = gameVoteScope("team", gameState.questIndex, gameState.activeProposal?.attempt ?? 1);
    const salt = randomVoteSalt();
    const commitment = await gameVoteCommitment(playerId, scope, choice, salt);
    setVoteDrafts((current) => ({
      ...current,
      [`team:${activeVoteKey(gameState)}`]: { choice, salt, commitment },
    }));
    await sendSignedPayload("game.team_vote.commit", {
      type: "game.team_vote.commit",
      questIndex: gameState.questIndex,
      attempt: gameState.activeProposal?.attempt ?? 1,
      commitment,
      sentAt: currentTimestamp(),
    });
  }

  async function sendTeamVoteReveal() {
    if (!gameState || !localTeamVote) {
      setError("Commit a team vote before revealing.");
      return;
    }

    await sendSignedPayload("game.team_vote.reveal", {
      type: "game.team_vote.reveal",
      questIndex: gameState.questIndex,
      attempt: gameState.activeProposal?.attempt ?? 1,
      choice: localTeamVote.choice,
      salt: localTeamVote.salt,
      commitment: localTeamVote.commitment,
      sentAt: currentTimestamp(),
    });
  }

  async function sendMissionVoteCommit(choice: MissionVoteChoice) {
    if (!gameState?.activeProposal?.approved) {
      return;
    }

    const safeChoice: MissionVoteChoice = roleView?.self.alignment === "evil" ? choice : "success";
    const scope = gameVoteScope("mission", gameState.questIndex, gameState.activeProposal.attempt);
    const salt = randomVoteSalt();
    const commitment = await gameVoteCommitment(playerId, scope, safeChoice, salt);
    setVoteDrafts((current) => ({
      ...current,
      [`mission:${activeVoteKey(gameState)}`]: { choice: safeChoice, salt, commitment },
    }));
    await sendSignedPayload("game.mission_vote.commit", {
      type: "game.mission_vote.commit",
      questIndex: gameState.questIndex,
      attempt: gameState.activeProposal.attempt,
      commitment,
      sentAt: currentTimestamp(),
    });
  }

  async function sendMissionVoteReveal() {
    if (!gameState?.activeProposal?.approved || !localMissionVote) {
      setError("Commit a mission vote before revealing.");
      return;
    }

    await sendSignedPayload("game.mission_vote.reveal", {
      type: "game.mission_vote.reveal",
      questIndex: gameState.questIndex,
      attempt: gameState.activeProposal.attempt,
      choice: localMissionVote.choice,
      salt: localMissionVote.salt,
      commitment: localMissionVote.commitment,
      sentAt: currentTimestamp(),
    });
  }

  async function sendAssassination() {
    if (!assassinationTarget) {
      setError("Choose an assassination target.");
      return;
    }

    const target = roleAssignments.find((assignment) => assignment.playerId === assassinationTarget);
    await sendSignedPayload("game.assassination.resolved", {
      type: "game.assassination.resolved",
      targetId: assassinationTarget,
      hitMerlin: target?.role === "merlin",
      sentAt: currentTimestamp(),
    });
  }

  async function clearLocalSecrets() {
    if (!identity) {
      return;
    }

    await clearRoomSecrets(normalizedRoomId, identity.playerId);
    setRoleSeed(null);
    setVoteDrafts({});
    setSecretsCleared(true);
  }

  async function sendSignedPayload(messageType: string, payload: Record<string, string | number | boolean | string[]>) {
    if (terminated) {
      setError("Protocol is paused locally. Resume before sending a new event.");
      return;
    }

    const socket = socketRef.current;
    if (!identity) {
      setError("Local identity is not ready yet.");
      return;
    }

    const sequence = (lastSequenceBySenderRef.current.get(playerId) ?? 0) + 1;
    const previousHash = lastHashBySenderRef.current.get(playerId) ?? "genesis";
    const envelope = await createSignedEnvelope({
      roomId: normalizedRoomId,
      senderId: playerId,
      recipients: "broadcast",
      sequence,
      previousHash,
      messageType,
      ciphertext: jsonToBase64Url(payload),
      identity,
    });

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "envelope", envelope }));
      return;
    }

    if (pollingActiveRef.current || socketState === "polling") {
      await postRoomSync({ type: "envelope", envelope });
      return;
    }

    setError("Relay is not connected yet.");
  }

  function abortLocalProtocol() {
    setTerminated(true);
    setError("Protocol paused locally. No new signed events will be sent from this device.");
  }

  function resumeLocalProtocol() {
    setTerminated(false);
    setError(null);
    setLastActivityAt(currentTimestamp());

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      requestReplay();
      return;
    }

    connectRef.current();
  }

  function lockCurrentRoom() {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "room.lock", roomId: normalizedRoomId, playerId }));
      return;
    }

    if (pollingActiveRef.current || socketState === "polling") {
      void postRoomSync({ type: "lock", playerId }).catch((lockError) => {
        setError(errorText(lockError));
      });
      return;
    }

    setError("Relay is not connected yet.");
  }

  function reconnectNow() {
    manualDisconnectRef.current = false;
    pollingActiveRef.current = false;
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    connect();
  }

  function toggleTeamSelection(candidateId: string, teamSize: number) {
    setSelectedTeam((current) => {
      if (current.includes(candidateId)) {
        return current.filter((id) => id !== candidateId);
      }
      if (current.length >= teamSize) {
        return [...current.slice(1), candidateId];
      }
      return [...current, candidateId];
    });
  }

  const rolePhase =
    roleView
      ? "ready"
      : roleStatus === "assigning" || roleStatus === "error"
        ? roleStatus
        : !genesis.ready
          ? "waiting"
          : commitCount < rolePlayerIds.length
            ? "commit"
            : revealCount < rolePlayerIds.length
              ? "reveal"
              : "assigning";
  const offlinePlayers = (room?.players ?? []).filter((player) => !player.online);
  const idleSeconds = nowMs && lastActivityAt ? Math.max(0, Math.round((nowMs - lastActivityAt) / 1000)) : 0;
  const isCurrentLeader = Boolean(gameLeader && gameLeader.id === playerId);
  const isMissionMember = Boolean(gameState?.activeProposal?.team.includes(playerId));
  const isAssassin = roleView?.self.role === "assassin";
  const connectionLabel =
    socketState === "open"
      ? "WebSocket"
      : socketState === "polling"
        ? "Sync relay"
        : socketState;
  const waitCopy = protocolWaitCopy({
    genesisReady: genesis.ready,
    keyedCount: rolePlayerIds.length,
    rolePhase,
    commitCount,
    revealCount,
    gameState,
    gameSnapshot,
    isCurrentLeader,
    isMissionMember,
    isAssassin,
  });
  const systemBanner =
    terminated
      ? {
          tone: "danger",
          title: "Protocol paused locally",
          detail: "This device will keep verifying incoming events, but it will not send new signed protocol events until resumed.",
        }
      : socketState === "polling"
        ? {
            tone: "wait",
            title: "Compatibility relay",
            detail: "WebSocket is unavailable in this browser, so the room is syncing signed events every few seconds.",
          }
      : socketState !== "open"
        ? {
            tone: "danger",
            title: "Relay reconnecting",
            detail: "The room will retry automatically. If the browser was backgrounded, Reconnect also forces a fresh replay.",
          }
        : offlinePlayers.length
          ? {
              tone: "wait",
              title: `${offlinePlayers.length} player${offlinePlayers.length > 1 ? "s" : ""} away`,
              detail: `${offlinePlayers.map((player) => player.name).join(" · ")} must reopen the page before the next round can move smoothly.`,
            }
          : idleSeconds * 1_000 > PROTOCOL_WAIT_MS && gameState?.phase !== "ended"
            ? {
                tone: "wait",
                title: `${idleSeconds}s without relay activity`,
                detail: waitCopy,
              }
            : {
                tone: rolePhase === "ready" ? "ready" : "wait",
                title: rolePhase === "ready" ? "Protocol live" : "Protocol waiting",
                detail: waitCopy,
              };
  const canSendProtocol = (socketState === "open" || socketState === "polling") && !terminated;
  const canSendPublicEvent = canSendProtocol && draft.trim().length > 0;
  const canCommit = canSendProtocol && genesis.ready && Boolean(roleSeed) && !localCommitted;
  const canReveal =
    canSendProtocol &&
    genesis.ready &&
    Boolean(roleSeed) &&
    localCommitted &&
    !localRevealed &&
    commitCount === rolePlayerIds.length;
  const canProposeTeam =
    canSendProtocol &&
    rolePhase === "ready" &&
    gameState?.phase === "proposal" &&
    isCurrentLeader &&
    selectedTeam.length === (gameQuest?.teamSize ?? 0);
  const canCommitTeamVote = canSendProtocol && gameState?.phase === "teamVote" && !localTeamVote;
  const canRevealTeamVote = canSendProtocol && gameState?.phase === "teamVote" && Boolean(localTeamVote);
  const canCommitMissionVote =
    canSendProtocol && gameState?.phase === "missionVote" && isMissionMember && !localMissionVote;
  const canRevealMissionVote =
    canSendProtocol && gameState?.phase === "missionVote" && isMissionMember && Boolean(localMissionVote);
  const canAssassinate =
    canSendProtocol && gameState?.phase === "assassination" && isAssassin && Boolean(assassinationTarget);

  return (
    <main className="room-app">
      <header className="room-header">
        <Link href="/" className="room-brand" aria-label="Back to Avalon home">
          <Castle aria-hidden="true" size={24} />
          <span>The Oath of Avalon</span>
        </Link>
        <div className={`room-connection ${socketState}`}>
          <Radio aria-hidden="true" size={17} />
          <span>{connectionLabel}</span>
        </div>
      </header>

      <section className={`system-banner ${systemBanner.tone}`} aria-live="polite">
        <div>
          {systemBanner.tone === "ready" ? <CheckCircle2 aria-hidden="true" size={19} /> : <AlertTriangle aria-hidden="true" size={19} />}
          <span>
            <strong>{systemBanner.title}</strong>
            <small>{systemBanner.detail}</small>
          </span>
        </div>
        <button type="button" className={terminated ? "quiet-button" : "danger-command"} onClick={terminated ? resumeLocalProtocol : abortLocalProtocol}>
          <PauseCircle aria-hidden="true" size={18} />
          <span>{terminated ? "Resume protocol" : "Abort locally"}</span>
        </button>
      </section>

      <section className="room-layout">
        <aside className="room-sidebar">
          <div>
            <p className="prototype-kicker">Council sigil</p>
            <h1 className="room-title">{normalizedRoomId}</h1>
          </div>
          <div className="room-actions">
            <button type="button" onClick={() => void navigator.clipboard.writeText(window.location.href)}>
              <Copy aria-hidden="true" size={18} />
              <span>Copy summons</span>
            </button>
            <button type="button" className="quiet-button" onClick={reconnectNow}>
              <RefreshCcw aria-hidden="true" size={18} />
              <span>Recall courier</span>
            </button>
            <button type="button" className="danger-command" onClick={lockCurrentRoom} disabled={room?.locked}>
              <Lock aria-hidden="true" size={18} />
              <span>{room?.locked ? "Council sealed" : "Seal council"}</span>
            </button>
          </div>
          <div className="room-stat-grid">
            <RoomStat icon={Users} label="Players" value={`${room?.players.length ?? 0}/10`} />
            <RoomStat icon={Shield} label="Redis" value={redisConfigured ? "ready" : "local"} />
            <RoomStat icon={Activity} label="TTL" value={room ? `${Math.round(room.ttlSeconds / 3600)}h` : "-"} />
          </div>
          <div className="genesis-card">
            <span>Founding oath</span>
            <strong>{genesis.words.length ? genesis.words.join(" · ") : "waiting"}</strong>
            <small>{genesis.ready ? `ready ${genesis.hash.slice(0, 12)}` : "needs 5 keyed players"}</small>
          </div>
        </aside>

        <section className="room-panel">
          <div className="room-panel-heading">
            <div>
              <p className="prototype-kicker">The fellowship</p>
              <h2>Knights at the round table</h2>
            </div>
            <span className={room?.locked ? "ready-chip" : "wait-chip"}>
              {room?.locked ? "Locked" : "Open"}
            </span>
          </div>
          <div className="live-player-list">
            {(room?.players ?? []).map((player) => (
              <article key={player.id} className="live-player-row">
                <div>
                  <strong>{player.name}</strong>
                  <span>Seat {player.seat}</span>
                  <small>{player.publicKeys?.keyFingerprint ?? "missing keys"}</small>
                </div>
                <span className={player.online ? "online-dot online" : "online-dot"}>
                  {player.online ? <CheckCircle2 aria-hidden="true" size={17} /> : <Circle aria-hidden="true" size={17} />}
                  {player.online ? "Online" : "Away"}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="room-panel role-protocol-panel">
          <div className="room-panel-heading">
            <div>
              <p className="prototype-kicker">The oracle · MPC</p>
              <h2>The sealed vision</h2>
            </div>
            <span className={rolePhase === "ready" ? "ready-chip" : "wait-chip"}>{rolePhase}</span>
          </div>
          <div className="role-progress-grid">
            <RoomStat icon={Shield} label="Commit" value={`${commitCount}/${rolePlayerIds.length || "-"}`} />
            <RoomStat icon={Sparkles} label="Reveal" value={`${revealCount}/${rolePlayerIds.length || "-"}`} />
            <RoomStat icon={Activity} label="Worker" value={roleWorkerNote} />
          </div>
          <div className="room-actions role-actions">
            <button type="button" onClick={sendRoleCommit} disabled={!canCommit}>
              <Shield aria-hidden="true" size={18} />
              <span>{localCommitted ? "Seed committed" : "Commit seed"}</span>
            </button>
            <button type="button" className="quiet-button" onClick={sendRoleReveal} disabled={!canReveal}>
              <Sparkles aria-hidden="true" size={18} />
              <span>{localRevealed ? "Seed revealed" : "Reveal seed"}</span>
            </button>
          </div>
          <div className={`private-role-card ${roleVisible && roleView ? "revealed" : ""}`}>
            <div>
              <span>Your private role</span>
              <strong>{roleVisible && roleView ? formatRole(roleView.self.role) : "Sealed"}</strong>
              <p>{roleVisible && roleView ? roleView.note : "Complete commit/reveal, then reveal locally."}</p>
            </div>
            {roleVisible && roleView?.visiblePlayers.length ? (
              <ul>
                {roleView.visiblePlayers.map((player) => (
                  <li key={player.playerId}>
                    {player.name} · {formatRole(player.role)}
                  </li>
                ))}
              </ul>
            ) : null}
            <button type="button" onClick={() => setRoleVisible((current) => !current)} disabled={!roleView}>
              <Eye aria-hidden="true" size={18} />
              <span>{roleVisible ? "Hide role" : "Reveal role"}</span>
            </button>
          </div>
        </section>

        <section className="room-panel game-protocol-panel">
          <div className="room-panel-heading">
            <div>
              <p className="prototype-kicker">The book of quests</p>
              <h2>{gameState ? formatPhase(gameState.phase) : "Waiting for five players"}</h2>
            </div>
            <span className={gameState?.phase === "ended" ? "ready-chip" : "wait-chip"}>
              {gameLeader ? `Leader ${gameLeader.name}` : "Setup"}
            </span>
          </div>

          {gameState ? (
            <>
              <div className="quest-summary-grid">
                {gameState.quests.map((quest) => (
                  <div key={quest.index} className={`quest-summary ${quest.status}`}>
                    <strong>{quest.index + 1}</strong>
                    <span>{quest.teamSize} seats</span>
                    <small>{quest.failCount === undefined ? `${quest.failThreshold} fail` : `${quest.failCount} fail`}</small>
                  </div>
                ))}
              </div>

              {gameState.phase === "proposal" ? (
                <div className="protocol-block">
                  <div>
                    <span>Quest {gameState.questIndex + 1}</span>
                    <strong>Select {gameQuest?.teamSize ?? 0} players</strong>
                    <p>{isCurrentLeader ? "You are the leader." : "Waiting for the leader to propose."}</p>
                  </div>
                  <div className="team-picker">
                    {rolePlayers.map((player) => {
                      const selected = selectedTeam.includes(player.id);
                      return (
                        <button
                          key={player.id}
                          type="button"
                          className={selected ? "selected" : ""}
                          onClick={() => toggleTeamSelection(player.id, gameQuest?.teamSize ?? 0)}
                          disabled={!isCurrentLeader || terminated}
                        >
                          <span>{player.name}</span>
                          <small>Seat {player.seat}</small>
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={sendTeamProposal} disabled={!canProposeTeam}>
                    <Swords aria-hidden="true" size={18} />
                    <span>Propose team</span>
                  </button>
                </div>
              ) : null}

              {gameState.phase === "teamVote" ? (
                <div className="protocol-block">
                  <div>
                    <span>Team vote</span>
                    <strong>{proposedTeam.map((id) => playerNameById(rolePlayers, id)).join(" · ")}</strong>
                    <p>
                      Commit {gameSnapshot.pending.teamVote?.commits ?? 0}/{gameSnapshot.pending.teamVote?.required ?? 0} · Reveal{" "}
                      {gameSnapshot.pending.teamVote?.reveals ?? 0}/{gameSnapshot.pending.teamVote?.required ?? 0}
                    </p>
                  </div>
                  <div className="role-actions">
                    <button type="button" onClick={() => void sendTeamVoteCommit("approve")} disabled={!canCommitTeamVote}>
                      <Vote aria-hidden="true" size={18} />
                      <span>Commit approve</span>
                    </button>
                    <button type="button" className="danger-command" onClick={() => void sendTeamVoteCommit("reject")} disabled={!canCommitTeamVote}>
                      <Vote aria-hidden="true" size={18} />
                      <span>Commit reject</span>
                    </button>
                  </div>
                  <button type="button" className="quiet-button" onClick={sendTeamVoteReveal} disabled={!canRevealTeamVote}>
                    <Eye aria-hidden="true" size={18} />
                    <span>Reveal team vote</span>
                  </button>
                </div>
              ) : null}

              {gameState.phase === "missionVote" ? (
                <div className="protocol-block">
                  <div>
                    <span>Mission vote</span>
                    <strong>{proposedTeam.map((id) => playerNameById(rolePlayers, id)).join(" · ")}</strong>
                    <p>
                      Commit {gameSnapshot.pending.missionVote?.commits ?? 0}/{gameSnapshot.pending.missionVote?.required ?? 0} · Reveal{" "}
                      {gameSnapshot.pending.missionVote?.reveals ?? 0}/{gameSnapshot.pending.missionVote?.required ?? 0}
                    </p>
                  </div>
                  <div className="role-actions">
                    <button type="button" onClick={() => void sendMissionVoteCommit("success")} disabled={!canCommitMissionVote}>
                      <Flag aria-hidden="true" size={18} />
                      <span>Commit success</span>
                    </button>
                    <button type="button" className="danger-command" onClick={() => void sendMissionVoteCommit("fail")} disabled={!canCommitMissionVote || roleView?.self.alignment !== "evil"}>
                      <Flag aria-hidden="true" size={18} />
                      <span>Commit fail</span>
                    </button>
                  </div>
                  <button type="button" className="quiet-button" onClick={sendMissionVoteReveal} disabled={!canRevealMissionVote}>
                    <Eye aria-hidden="true" size={18} />
                    <span>Reveal mission vote</span>
                  </button>
                </div>
              ) : null}

              {gameState.phase === "assassination" ? (
                <div className="protocol-block">
                  <div>
                    <span>Assassination</span>
                    <strong>{isAssassin ? "Choose Merlin" : "Waiting for Assassin"}</strong>
                    <p>Good completed three quests. The assassin gets one shot.</p>
                  </div>
                  <div className="team-picker">
                    {rolePlayers.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={assassinationTarget === player.id ? "selected" : ""}
                        onClick={() => setAssassinationTarget(player.id)}
                        disabled={!isAssassin || terminated}
                      >
                        <span>{player.name}</span>
                        <small>Seat {player.seat}</small>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="danger-command" onClick={sendAssassination} disabled={!canAssassinate}>
                    <Eye aria-hidden="true" size={18} />
                    <span>Resolve assassination</span>
                  </button>
                </div>
              ) : null}

              {gameState.phase === "ended" ? (
                <div className="protocol-block">
                  <div>
                    <span>Game ended</span>
                    <strong>{gameState.winner === "good" ? "Good wins" : "Evil wins"}</strong>
                    <p>{gameState.victoryReason}</p>
                  </div>
                  <div className="end-role-grid">
                    {roleAssignments.map((assignment) => (
                      <article key={assignment.playerId}>
                        <strong>{assignment.name}</strong>
                        <span>{formatRole(assignment.role)}</span>
                      </article>
                    ))}
                  </div>
                  <button type="button" className="quiet-button" onClick={clearLocalSecrets} disabled={secretsCleared}>
                    <Lock aria-hidden="true" size={18} />
                    <span>{secretsCleared ? "Local secrets cleared" : "Clear local secrets"}</span>
                  </button>
                </div>
              ) : null}

              {gameSnapshot.errors.length ? <p className="prototype-error compact">{gameSnapshot.errors[0]}</p> : null}
            </>
          ) : (
            <p className="empty-protocol-copy">Need five keyed players and a completed role protocol before the public game can start.</p>
          )}
        </section>

        <section className="room-panel">
          <div className="room-panel-heading">
            <div>
              <p className="prototype-kicker">The courier ledger</p>
              <h2>Sealed messages in order</h2>
            </div>
          </div>
          <div className="relay-composer">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void sendPublicEvent();
                }
              }}
              maxLength={120}
              autoComplete="off"
              enterKeyHint="send"
              disabled={terminated}
            />
            <button type="button" onClick={sendPublicEvent} disabled={!canSendPublicEvent}>
              <Send aria-hidden="true" size={18} />
              <span>Send</span>
            </button>
          </div>
          {error ? <p className="prototype-error compact">{error}</p> : null}
          <ol className="relay-event-list">
            {events.map((event) => (
              <li key={event.id}>
                <span>#{event.sequence}</span>
                <strong>{event.text}</strong>
                <small>{event.verified ? `${event.relay} · ${event.hash.slice(0, 8)}` : "rejected"}</small>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </main>
  );
}

function RoomStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="room-stat">
      <Icon aria-hidden="true" size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function protocolWaitCopy({
  genesisReady: roomGenesisReady,
  keyedCount,
  rolePhase,
  commitCount,
  revealCount,
  gameState,
  gameSnapshot,
  isCurrentLeader,
  isMissionMember,
  isAssassin,
}: {
  genesisReady: boolean;
  keyedCount: number;
  rolePhase: RoleProtocolStatus;
  commitCount: number;
  revealCount: number;
  gameState: GameState | null;
  gameSnapshot: GameProtocolSnapshot;
  isCurrentLeader: boolean;
  isMissionMember: boolean;
  isAssassin: boolean;
}) {
  if (!roomGenesisReady) {
    const missing = Math.max(5 - keyedCount, 0);
    return missing ? `Need ${missing} more keyed player${missing > 1 ? "s" : ""} before the role seed protocol can start.` : "Waiting for a stable signed room genesis.";
  }

  if (rolePhase === "commit") {
    const missing = Math.max(keyedCount - commitCount, 0);
    return `Waiting for ${missing} sealed role seed commitment${missing > 1 ? "s" : ""}.`;
  }

  if (rolePhase === "reveal") {
    const missing = Math.max(keyedCount - revealCount, 0);
    return `Waiting for ${missing} role seed reveal${missing > 1 ? "s" : ""}.`;
  }

  if (rolePhase === "assigning") {
    return "Combining revealed seeds in the local worker. The cryptography package is loaded only at this step.";
  }

  if (rolePhase === "error") {
    return "The local role worker failed or timed out. Reconnect, request replay, or pause locally before restarting the room.";
  }

  if (!gameState) {
    return "Role protocol is complete. Waiting for the public game state to initialize.";
  }

  if (gameState.phase === "proposal") {
    return isCurrentLeader ? "You are leader. Select the exact quest team, then publish the signed proposal." : "Waiting for the current leader to publish a signed team proposal.";
  }

  if (gameState.phase === "teamVote") {
    const pending = gameSnapshot.pending.teamVote;
    if (!pending) {
      return "Collecting signed team vote envelopes.";
    }

    const missingCommits = Math.max(pending.required - pending.commits, 0);
    if (missingCommits) {
      return `Waiting for ${missingCommits} team vote commitment${missingCommits > 1 ? "s" : ""}.`;
    }

    const missingReveals = Math.max(pending.required - pending.reveals, 0);
    return missingReveals ? `Waiting for ${missingReveals} team vote reveal${missingReveals > 1 ? "s" : ""}.` : "All team votes are revealed. Deriving the next public phase.";
  }

  if (gameState.phase === "missionVote") {
    const pending = gameSnapshot.pending.missionVote;
    if (!pending) {
      return isMissionMember ? "You are on the mission team. Commit a private mission result." : "Waiting for the mission team to commit private mission results.";
    }

    const missingCommits = Math.max(pending.required - pending.commits, 0);
    if (missingCommits) {
      return `Waiting for ${missingCommits} mission vote commitment${missingCommits > 1 ? "s" : ""}.`;
    }

    const missingReveals = Math.max(pending.required - pending.reveals, 0);
    return missingReveals ? `Waiting for ${missingReveals} mission vote reveal${missingReveals > 1 ? "s" : ""}.` : "All mission votes are revealed. Deriving the quest result.";
  }

  if (gameState.phase === "assassination") {
    return isAssassin ? "You are Assassin. Choose Merlin and resolve the final signed event." : "Waiting for Assassin to choose Merlin.";
  }

  return `${gameState.winner === "good" ? "Good" : "Evil"} won. Clear local secrets when every player has recorded the ending.`;
}

function parseRelayEvent(raw: string): RelayEvent | null {
  try {
    return JSON.parse(raw) as RelayEvent;
  } catch {
    return null;
  }
}

function publicEventFromEnvelope(
  envelope: RelayEnvelope,
  relay: PublicRoomEvent["relay"],
  hash: string,
  verified: boolean,
): PublicRoomEvent {
  const payload = jsonFromBase64Url(envelope.ciphertext);
  const body = isRecord(payload) ? payload : {};
  const senderName = typeof body.name === "string" ? body.name : "Player";
  const text =
    typeof body.text === "string"
      ? body.text
      : envelope.messageType === "role.seed.commit"
        ? "committed a sealed role seed"
      : envelope.messageType === "role.seed.reveal"
          ? "revealed a role seed"
          : envelope.messageType === "game.team.proposed"
            ? "proposed a quest team"
            : envelope.messageType === "game.team_vote.commit"
              ? "committed a team vote"
              : envelope.messageType === "game.team_vote.reveal"
                ? "revealed a team vote"
                : envelope.messageType === "game.mission_vote.commit"
                  ? "committed a mission vote"
                  : envelope.messageType === "game.mission_vote.reveal"
                    ? "revealed a mission vote"
                    : envelope.messageType === "game.assassination.resolved"
                      ? "resolved assassination"
                      : envelope.messageType;

  return {
    id: hash,
    senderId: envelope.senderId,
    text: `${senderName}: ${text}`,
    sequence: envelope.sequence,
    hash,
    verified,
    receivedAt: Date.now(),
    relay,
  };
}

async function roleProtocolEventFromEnvelope(envelope: RelayEnvelope, fallbackName?: string): Promise<RoleProtocolEvent> {
  if (envelope.messageType !== "role.seed.commit" && envelope.messageType !== "role.seed.reveal") {
    return { type: "none" };
  }

  const payload = jsonFromBase64Url(envelope.ciphertext);
  if (!isRecord(payload)) {
    return { type: "invalid", message: "Rejected unreadable role protocol event." };
  }

  const name = typeof payload.name === "string" ? payload.name : fallbackName ?? "Player";
  const commitment = typeof payload.commitment === "string" ? payload.commitment : "";
  if (!commitment) {
    return { type: "invalid", message: "Rejected role event without commitment." };
  }

  if (envelope.messageType === "role.seed.commit") {
    return {
      type: "commit",
      contribution: {
        playerId: envelope.senderId,
        name,
        commitment,
        committedAt: envelope.sentAt,
      },
    };
  }

  const secret = typeof payload.secret === "string" ? payload.secret : "";
  if (!secret || commitment !== (await roleSeedCommitment(envelope.senderId, secret))) {
    return { type: "invalid", message: "Rejected role reveal that does not match commitment." };
  }

  return {
    type: "reveal",
    contribution: {
      playerId: envelope.senderId,
      name,
      commitment,
      secret,
      revealedAt: envelope.sentAt,
    },
  };
}

function mergeRoleContribution(
  current: Record<string, RoleContribution>,
  contribution: RoleContribution,
): Record<string, RoleContribution> {
  const existing = current[contribution.playerId];
  if (existing?.commitment && contribution.commitment && existing.commitment !== contribution.commitment) {
    return current;
  }

  return {
    ...current,
    [contribution.playerId]: {
      ...existing,
      ...contribution,
      commitment: existing?.commitment ?? contribution.commitment,
      committedAt: existing?.committedAt ?? contribution.committedAt,
    },
  };
}

function sameGamePayload(left: GameProtocolPayload, right: GameProtocolPayload): boolean {
  if (left.type !== right.type || left.sentAt !== right.sentAt) {
    return false;
  }

  if (left.type === "game.team.proposed" && right.type === "game.team.proposed") {
    return left.proposerId === right.proposerId;
  }

  if (left.type === "game.assassination.resolved" && right.type === "game.assassination.resolved") {
    return left.assassinId === right.assassinId && left.targetId === right.targetId;
  }

  if ("voterId" in left && "voterId" in right) {
    return left.voterId === right.voterId && left.questIndex === right.questIndex && left.attempt === right.attempt;
  }

  return false;
}

function formatRole(role: string): string {
  return role
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatPhase(phase: GameState["phase"]): string {
  const labels: Record<GameState["phase"], string> = {
    proposal: "Team proposal",
    teamVote: "Team vote",
    missionVote: "Mission vote",
    assassination: "Assassination",
    ended: "Game ended",
  };
  return labels[phase];
}

function playerNameById(players: RoleProtocolPlayer[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.name ?? playerId.slice(0, 8);
}

function currentTimestamp(): number {
  return Date.now();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Room action failed.";
}

function webSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/ws`;
}

function normalizeRoom(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
