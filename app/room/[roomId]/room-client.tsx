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
import type { RelayEnvelope } from "@/lib/protocol/envelope";
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
  receivedAt: number;
  relay: "local" | "redis" | "replay";
};

const HEARTBEAT_MS = 12_000;

export function RoomClient({ roomId }: { roomId: string }) {
  const normalizedRoomId = useMemo(() => normalizeRoom(roomId), [roomId]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualDisconnectRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});
  const sequenceRef = useRef(0);
  const previousHashRef = useRef("genesis");

  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [socketState, setSocketState] = useState<SocketState>("idle");
  const [redisConfigured, setRedisConfigured] = useState(false);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [events, setEvents] = useState<PublicRoomEvent[]>([]);
  const [draft, setDraft] = useState("Ready at the table");
  const [error, setError] = useState<string | null>(null);

  const addEvent = useCallback((event: PublicRoomEvent) => {
    setEvents((current) => {
      if (current.some((item) => item.id === event.id)) {
        return current;
      }
      return [event, ...current].slice(0, 24);
    });
  }, []);

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
          addEvent(publicEventFromEnvelope(envelope, "replay"));
        }
        return;
      }

      if (event.type === "envelope") {
        addEvent(publicEventFromEnvelope(event.envelope, event.relay));
        return;
      }

      if (event.type === "error") {
        setError(event.message);
      }
    },
    [addEvent],
  );

  const connect = useCallback(() => {
    if (!playerId) {
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
  }, [handleRelayMessage, normalizedRoomId, playerId, playerName]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const savedPlayerId = localStorage.getItem("avalon:playerId") ?? crypto.randomUUID();
    const savedName = localStorage.getItem("avalon:playerName") ?? `Player ${savedPlayerId.slice(0, 4)}`;
    localStorage.setItem("avalon:playerId", savedPlayerId);
    localStorage.setItem("avalon:playerName", savedName);
    queueMicrotask(() => {
      setPlayerId(savedPlayerId);
      setPlayerName(savedName);
    });
  }, []);

  useEffect(() => {
    if (playerId) {
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
  }, [connect, playerId]);

  async function sendPublicEvent() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Socket is not connected yet.");
      return;
    }

    const text = draft.trim().slice(0, 120);
    if (!text) {
      return;
    }

    const sequence = sequenceRef.current + 1;
    const envelope: RelayEnvelope = {
      protocolVersion: 1,
      roomId: normalizedRoomId,
      senderId: playerId,
      recipients: "broadcast",
      sequence,
      previousHash: previousHashRef.current,
      messageType: "room.public_event",
      ciphertext: encodePayload({
        text,
        name: playerName,
        sentAt: Date.now(),
      }),
      signature: "stage3-public-placeholder",
      sentAt: Date.now(),
    };

    previousHashRef.current = await hashText(JSON.stringify(envelope));
    sequenceRef.current = sequence;
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
                <small>{event.relay}</small>
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

function publicEventFromEnvelope(envelope: RelayEnvelope, relay: "local" | "redis" | "replay"): PublicRoomEvent {
  const payload = decodePayload(envelope.ciphertext);
  const senderName = typeof payload.name === "string" ? payload.name : "Player";
  const text = typeof payload.text === "string" ? payload.text : envelope.messageType;

  return {
    id: `${envelope.senderId}:${envelope.sequence}:${envelope.sentAt}`,
    senderId: envelope.senderId,
    text: `${senderName}: ${text}`,
    sequence: envelope.sequence,
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

function encodePayload(value: Record<string, unknown>): string {
  return base64(new TextEncoder().encode(JSON.stringify(value)));
}

function decodePayload(value: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(bytesFromBase64(value))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64(new Uint8Array(digest));
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
