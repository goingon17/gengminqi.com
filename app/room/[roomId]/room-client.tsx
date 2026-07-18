"use client";

import {
  Activity,
  Castle,
  CheckCircle2,
  Circle,
  Copy,
  Lock,
  Radio,
  RefreshCcw,
  Send,
  Shield,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsonFromBase64Url, jsonToBase64Url } from "@/lib/crypto/codec";
import {
  appendRoomEnvelope,
  loadOrCreatePlayerIdentity,
  loadRoomEnvelopes,
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
import type { PublicRoom } from "@/lib/relay/rooms";

type SocketState = "idle" | "joining" | "open" | "closed" | "error";

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
  relay: "local" | "redis" | "replay" | "stored";
};

type GenesisSummary = {
  ready: boolean;
  hash: string;
  words: string[];
};

const HEARTBEAT_MS = 12_000;

export function RoomClient({ roomId }: { roomId: string }) {
  const normalizedRoomId = useMemo(() => normalizeRoom(roomId), [roomId]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualDisconnectRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});
  const storedLogLoadedRef = useRef(false);
  const seenHashesRef = useRef(new Set<string>());
  const lastHashBySenderRef = useRef(new Map<string, string>());
  const lastSequenceBySenderRef = useRef(new Map<string, number>());

  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("idle");
  const [redisConfigured, setRedisConfigured] = useState(false);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [events, setEvents] = useState<PublicRoomEvent[]>([]);
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

  const addEvent = useCallback((event: PublicRoomEvent) => {
    setEvents((current) => {
      if (current.some((item) => item.id === event.id)) {
        return current;
      }
      return [event, ...current].slice(0, 24);
    });
  }, []);

  const requestReplay = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "replay", roomId: normalizedRoomId }));
    }
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

      seenHashesRef.current.add(hash);
      lastSequenceBySenderRef.current.set(envelope.senderId, envelope.sequence);
      lastHashBySenderRef.current.set(envelope.senderId, hash);

      if (relay !== "stored") {
        await appendRoomEnvelope({
          roomId: normalizedRoomId,
          hash,
          envelope,
          relay,
          receivedAt: Date.now(),
        });
      }

      addEvent(publicEventFromEnvelope(envelope, relay, hash, verified));
      setError(null);
    },
    [addEvent, normalizedRoomId, requestReplay, signingKeysByPlayer],
  );

  const handleRelayMessage = useCallback(
    async (raw: string) => {
      const event = parseRelayEvent(raw);
      if (!event) {
        setError("Received an unreadable relay event.");
        return;
      }

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
    [acceptEnvelope],
  );

  const connect = useCallback(() => {
    if (!playerId || !identity) {
      return;
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

    socket.addEventListener("open", () => {
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

      setSocketState("closed");
      if (!manualDisconnectRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current();
        }, 1_200);
      }
    });

    socket.addEventListener("error", () => {
      setSocketState("error");
      setError("Socket error. Reconnect will retry.");
    });
  }, [handleRelayMessage, identity, normalizedRoomId, playerId, playerName]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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

  async function sendPublicEvent() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Socket is not connected yet.");
      return;
    }

    if (!identity) {
      setError("Local identity is not ready yet.");
      return;
    }

    const text = draft.trim().slice(0, 120);
    if (!text) {
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
      messageType: "room.public_event",
      ciphertext: jsonToBase64Url({
        text,
        name: playerName,
        sentAt: Date.now(),
      }),
      identity,
    });

    socket.send(JSON.stringify({ type: "envelope", envelope }));
    setDraft("Ready at the table");
  }

  function lockCurrentRoom() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Socket is not connected yet.");
      return;
    }

    socket.send(JSON.stringify({ type: "room.lock", roomId: normalizedRoomId, playerId }));
  }

  function reconnectNow() {
    manualDisconnectRef.current = false;
    connect();
  }

  return (
    <main className="room-app">
      <header className="room-header">
        <Link href="/" className="room-brand" aria-label="Back to Avalon home">
          <Castle aria-hidden="true" size={24} />
          <span>Avalon</span>
        </Link>
        <div className={`room-connection ${socketState}`}>
          <Radio aria-hidden="true" size={17} />
          <span>{socketState}</span>
        </div>
      </header>

      <section className="room-layout">
        <aside className="room-sidebar">
          <div>
            <p className="prototype-kicker">Room</p>
            <h1 className="room-title">{normalizedRoomId}</h1>
          </div>
          <div className="room-actions">
            <button type="button" onClick={() => void navigator.clipboard.writeText(window.location.href)}>
              <Copy aria-hidden="true" size={18} />
              <span>Copy link</span>
            </button>
            <button type="button" className="quiet-button" onClick={reconnectNow}>
              <RefreshCcw aria-hidden="true" size={18} />
              <span>Reconnect</span>
            </button>
            <button type="button" className="danger-command" onClick={lockCurrentRoom} disabled={room?.locked}>
              <Lock aria-hidden="true" size={18} />
              <span>{room?.locked ? "Locked" : "Lock room"}</span>
            </button>
          </div>
          <div className="room-stat-grid">
            <RoomStat icon={Users} label="Players" value={`${room?.players.length ?? 0}/10`} />
            <RoomStat icon={Shield} label="Redis" value={redisConfigured ? "ready" : "local"} />
            <RoomStat icon={Activity} label="TTL" value={room ? `${Math.round(room.ttlSeconds / 3600)}h` : "-"} />
          </div>
          <div className="genesis-card">
            <span>Genesis</span>
            <strong>{genesis.words.length ? genesis.words.join(" · ") : "waiting"}</strong>
            <small>{genesis.ready ? `ready ${genesis.hash.slice(0, 12)}` : "needs 5 keyed players"}</small>
          </div>
        </aside>

        <section className="room-panel">
          <div className="room-panel-heading">
            <div>
              <p className="prototype-kicker">Lobby</p>
              <h2>Players at the table</h2>
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

        <section className="room-panel">
          <div className="room-panel-heading">
            <div>
              <p className="prototype-kicker">Relay tape</p>
              <h2>Ordered public events</h2>
            </div>
          </div>
          <div className="relay-composer">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={120} />
            <button type="button" onClick={sendPublicEvent}>
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
  const text = typeof body.text === "string" ? body.text : envelope.messageType;

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
