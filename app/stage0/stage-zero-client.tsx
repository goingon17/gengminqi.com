"use client";

import {
  Cpu,
  KeyRound,
  PlugZap,
  Radio,
  RefreshCcw,
  ScrollText,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RelayEnvelope } from "@/lib/protocol/envelope";

type ConnectionState = "idle" | "connecting" | "open" | "closed" | "error";

type ServerEvent =
  | {
      type: "joined";
      roomId: string;
      connectionId: string;
      redisConfigured: boolean;
    }
  | {
      type: "presence";
      roomId: string;
      peers: Array<{ playerId: string; name: string }>;
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

type BenchReport = {
  generatedAt: number;
  userAgent: string;
  parties: number;
  rounds: number;
  features: {
    subtleCrypto: boolean;
    indexedDb: boolean;
    worker: boolean;
  };
  sha256Ms: number;
  aesGcmMs: number;
  roleDealProxyMs: number;
  privateOutputProxyMs: number;
  secretCompareProxyMs: number;
  checksum: number;
};

type LogEntry = {
  id: string;
  tone: "info" | "good" | "warn" | "bad";
  text: string;
};

declare global {
  interface Window {
    JIFFClient?: unknown;
  }
}

export function StageZeroClient() {
  const socketRef = useRef<WebSocket | null>(null);
  const sequenceRef = useRef(0);
  const previousHashRef = useRef("genesis");
  const manualDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [roomId, setRoomId] = useState("AVALON-0");
  const [playerName, setPlayerName] = useState("Player");
  const [playerId, setPlayerId] = useState("");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [redisConfigured, setRedisConfigured] = useState(false);
  const [peers, setPeers] = useState<Array<{ playerId: string; name: string }>>([]);
  const [latencies, setLatencies] = useState<number[]>([]);
  const [benchReport, setBenchReport] = useState<BenchReport | null>(null);
  const [benchRunning, setBenchRunning] = useState(false);
  const [jiffStatus, setJiffStatus] = useState<"idle" | "loading" | "ready" | "missing" | "error">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "boot",
      tone: "info",
      text: "Stage 0 console is ready.",
    },
  ]);

  const connected = connectionState === "open";
  const averageLatency = useMemo(() => {
    if (latencies.length === 0) {
      return null;
    }
    return Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
  }, [latencies]);

  const addLog = useCallback((tone: LogEntry["tone"], text: string) => {
    setLogs((current) => [
      { id: crypto.randomUUID(), tone, text },
      ...current,
    ].slice(0, 20));
  }, []);

  useEffect(() => {
    const storedPlayerId = sessionStorage.getItem("avalon:stage0:playerId") ?? crypto.randomUUID();
    const storedName = sessionStorage.getItem("avalon:stage0:name") ?? `Player ${storedPlayerId.slice(0, 4)}`;
    const storedRoom = sessionStorage.getItem("avalon:stage0:room") ?? "AVALON-0";

    sessionStorage.setItem("avalon:stage0:playerId", storedPlayerId);
    sessionStorage.setItem("avalon:stage0:name", storedName);
    sessionStorage.setItem("avalon:stage0:room", storedRoom);

    queueMicrotask(() => {
      setPlayerId(storedPlayerId);
      setPlayerName(storedName);
      setRoomId(storedRoom);
    });

    fetch("/api/stage0/status")
      .then((response) => response.json())
      .then((status: { redisConfigured?: boolean }) => {
        setRedisConfigured(Boolean(status.redisConfigured));
      })
      .catch(() => {
        addLog("warn", "Relay status endpoint is not reachable yet.");
      });

    return () => {
      manualDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [addLog]);

  function connect() {
    if (!playerId) {
      return;
    }

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    manualDisconnectRef.current = false;
    socketRef.current?.close();
    setConnectionState("connecting");

    const socket = new WebSocket(webSocketUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionState("open");
      sessionStorage.setItem("avalon:stage0:name", playerName);
      sessionStorage.setItem("avalon:stage0:room", roomId);
      socket.send(
        JSON.stringify({
          type: "join",
          roomId,
          playerId,
          name: playerName,
        }),
      );
      addLog("good", `Connected to room ${roomId}.`);
    });

    socket.addEventListener("message", (event) => {
      void handleServerMessage(event.data.toString());
    });

    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) {
        return;
      }

      setConnectionState("closed");
      if (manualDisconnectRef.current) {
        addLog("warn", "Socket closed.");
        return;
      }

      addLog("warn", "Socket closed by the runtime; reconnecting.");
      reconnectTimerRef.current = setTimeout(connect, 1_200);
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
      addLog("bad", "Socket error. Use Vercel dev or a Vercel deployment for this endpoint.");
    });
  }

  function disconnect() {
    manualDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
    setConnectionState("closed");
  }

  async function sendProbe() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !playerId) {
      addLog("warn", "Connect before sending a probe.");
      return;
    }

    const payload = {
      probeId: crypto.randomUUID(),
      from: playerName,
      sentAt: Date.now(),
      roomId,
      secret: `quest-${Math.floor(Math.random() * 10_000)}`,
    };
    const ciphertext = await encryptForRoom(roomId, payload);
    const envelope: RelayEnvelope = {
      protocolVersion: 1,
      roomId: normalizeRoom(roomId),
      senderId: playerId,
      recipients: "broadcast",
      sequence: sequenceRef.current + 1,
      previousHash: previousHashRef.current,
      messageType: "stage0.encrypted_probe",
      ciphertext,
      signature: "stage0-signature-placeholder",
      sentAt: payload.sentAt,
    };

    sequenceRef.current = envelope.sequence;
    previousHashRef.current = await hashText(JSON.stringify(envelope));
    socket.send(JSON.stringify({ type: "envelope", envelope }));
    addLog("info", `Sent encrypted probe #${envelope.sequence}.`);
  }

  async function runBench() {
    setBenchRunning(true);
    const worker = new Worker(new URL("../../workers/crypto-bench.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.addEventListener("message", (event) => {
      if (event.data.type === "result") {
        setBenchReport(event.data.report as BenchReport);
        addLog("good", "Browser crypto worker benchmark completed.");
      } else {
        addLog("bad", event.data.message ?? "Browser benchmark failed.");
      }

      setBenchRunning(false);
      worker.terminate();
    });

    worker.postMessage({ type: "run", parties: 10, rounds: 250 });
  }

  async function loadJiffBundle() {
    if (window.JIFFClient) {
      setJiffStatus("ready");
      addLog("good", "JIFF browser bundle is already loaded.");
      return;
    }

    setJiffStatus("loading");

    try {
      await loadScript("/vendor/jiff-client.js");
      if (window.JIFFClient) {
        setJiffStatus("ready");
        addLog("good", "JIFF browser bundle loaded.");
      } else {
        setJiffStatus("missing");
        addLog("warn", "JIFF bundle loaded but did not expose JIFFClient.");
      }
    } catch {
      setJiffStatus("error");
      addLog("warn", "JIFF bundle is missing. Run pnpm install to copy it into public/vendor.");
    }
  }

  async function handleServerMessage(raw: string) {
    const event = parseServerEvent(raw);
    if (!event) {
      addLog("warn", "Received an unreadable relay frame.");
      return;
    }

    if (event.type === "joined") {
      setRedisConfigured(event.redisConfigured);
      addLog(event.redisConfigured ? "good" : "warn", event.redisConfigured ? "Redis relay is configured." : "Redis is not configured; local single-instance relay only.");
      return;
    }

    if (event.type === "presence") {
      setPeers(event.peers);
      return;
    }

    if (event.type === "replay") {
      setRedisConfigured(event.redisConfigured);
      if (event.envelopes.length > 0) {
        addLog("info", `Replayed ${event.envelopes.length} encrypted envelopes.`);
      }
      return;
    }

    if (event.type === "error") {
      addLog("bad", event.message);
      return;
    }

    try {
      const opened = await decryptFromRoom(event.envelope.roomId, event.envelope.ciphertext);
      const latency = typeof opened.sentAt === "number" ? Date.now() - opened.sentAt : null;
      if (latency !== null) {
        setLatencies((current) => [...current.slice(-9), latency]);
      }

      const origin = event.envelope.senderId === playerId ? "self" : opened.from ?? "peer";
      addLog("good", `Decrypted ${event.relay} probe from ${origin} in ${latency ?? "?"}ms.`);
    } catch {
      addLog("bad", "Received ciphertext, but this room key could not open it.");
    }
  }

  return (
    <main className="stage-shell">
      <section className="stage-topline">
        <div>
          <p className="eyebrow">Phase 0</p>
          <h1>Avalon local protocol console</h1>
        </div>
        <div className={`socket-pill ${connectionState}`}>
          <Radio aria-hidden="true" size={18} />
          <span>{connectionState}</span>
        </div>
      </section>

      <section className="command-band">
        <label>
          <span>Room</span>
          <input
            value={roomId}
            onChange={(event) => setRoomId(event.target.value.toUpperCase())}
            inputMode="text"
            autoCapitalize="characters"
          />
        </label>
        <label>
          <span>Name</span>
          <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
        </label>
        <button type="button" onClick={connected ? disconnect : connect}>
          <PlugZap aria-hidden="true" size={18} />
          <span>{connected ? "Disconnect" : "Connect"}</span>
        </button>
        <button type="button" onClick={sendProbe} disabled={!connected}>
          <Send aria-hidden="true" size={18} />
          <span>Send Probe</span>
        </button>
      </section>

      <section className="metric-grid" aria-label="Stage 0 checks">
        <StatusTile
          icon={<PlugZap size={22} />}
          label="WebSocket relay"
          value={connected ? "online" : "waiting"}
          tone={connected ? "good" : "neutral"}
        />
        <StatusTile
          icon={<ScrollText size={22} />}
          label="Redis stream"
          value={redisConfigured ? "configured" : "local only"}
          tone={redisConfigured ? "good" : "warn"}
        />
        <StatusTile
          icon={<ShieldCheck size={22} />}
          label="Cipher probes"
          value={averageLatency === null ? "none" : `${averageLatency}ms avg`}
          tone={averageLatency === null ? "neutral" : "good"}
        />
        <StatusTile
          icon={<KeyRound size={22} />}
          label="JIFF bundle"
          value={jiffStatus}
          tone={jiffStatus === "ready" ? "good" : jiffStatus === "error" ? "warn" : "neutral"}
        />
      </section>

      <section className="work-grid">
        <div className="stage-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Browser cryptography</p>
              <h2>10-party proxy benchmark</h2>
            </div>
            <button type="button" className="icon-button" onClick={runBench} disabled={benchRunning} aria-label="Run benchmark">
              <Cpu aria-hidden="true" size={18} />
            </button>
          </div>
          {benchReport ? (
            <dl className="bench-list">
              <Metric label="SHA-256 x200" value={`${benchReport.sha256Ms.toFixed(1)}ms`} />
              <Metric label="AES-GCM x150" value={`${benchReport.aesGcmMs.toFixed(1)}ms`} />
              <Metric label="Role deal proxy" value={`${benchReport.roleDealProxyMs.toFixed(1)}ms`} />
              <Metric label="Private output proxy" value={`${benchReport.privateOutputProxyMs.toFixed(1)}ms`} />
              <Metric label="Secret compare proxy" value={`${benchReport.secretCompareProxyMs.toFixed(1)}ms`} />
              <Metric label="Checksum" value={benchReport.checksum.toString(16)} />
            </dl>
          ) : (
            <div className="empty-state">No benchmark run in this browser yet.</div>
          )}
        </div>

        <div className="stage-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Runtime</p>
              <h2>Compatibility surface</h2>
            </div>
            <button type="button" className="icon-button" onClick={loadJiffBundle} aria-label="Load JIFF">
              <RefreshCcw aria-hidden="true" size={18} />
            </button>
          </div>
          <dl className="bench-list">
            <Metric label="Player id" value={playerId ? playerId.slice(0, 8) : "booting"} />
            <Metric label="Peers here" value={peers.length.toString()} />
            <Metric label="SubtleCrypto" value={benchReport?.features.subtleCrypto ? "yes" : "unchecked"} />
            <Metric label="IndexedDB" value={benchReport?.features.indexedDb ? "yes" : "unchecked"} />
            <Metric label="Worker" value={benchReport?.features.worker ? "yes" : "unchecked"} />
            <Metric label="Round size" value="10 parties" />
          </dl>
        </div>
      </section>

      <section className="stage-panel event-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Event tape</p>
            <h2>Relay observations</h2>
          </div>
        </div>
        <ol className="event-list">
          {logs.map((entry) => (
            <li key={entry.id} className={entry.tone}>
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function StatusTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral";
}) {
  return (
    <div className={`status-tile ${tone}`}>
      <div className="tile-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function webSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/ws`;
}

function parseServerEvent(raw: string): ServerEvent | null {
  try {
    return JSON.parse(raw) as ServerEvent;
  } catch {
    return null;
  }
}

async function encryptForRoom(roomId: string, payload: Record<string, unknown>): Promise<string> {
  const key = await roomKey(roomId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${base64(iv)}.${base64(new Uint8Array(sealed))}`;
}

async function decryptFromRoom(roomId: string, ciphertext: string): Promise<Record<string, unknown>> {
  const [ivText, sealedText] = ciphertext.split(".");
  const key = await roomKey(roomId);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    key,
    fromBase64(sealedText),
  );
  return JSON.parse(new TextDecoder().decode(opened)) as Record<string, unknown>;
}

async function roomKey(roomId: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`avalon-stage0:${normalizeRoom(roomId)}`),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64(new Uint8Array(digest));
}

function normalizeRoom(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
