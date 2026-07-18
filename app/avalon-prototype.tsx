"use client";

import {
  ArrowRight,
  Castle,
  Check,
  ChevronRight,
  Crown,
  Eye,
  KeyRound,
  Lock,
  Play,
  Shield,
  Sparkles,
  Swords,
  Users,
  Vote,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadOrCreatePlayerIdentity } from "@/lib/crypto/local-store";
import { publicKeysFromIdentity } from "@/lib/crypto/player-identity";

type PrototypeSurface = "entry" | "lobby" | "role" | "quest";

type Player = {
  name: string;
  seat: number;
  ready: boolean;
  side: "loyal" | "shadow";
};

const surfaces: Array<{
  id: PrototypeSurface;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "entry", label: "Entry", icon: Castle },
  { id: "lobby", label: "Lobby", icon: Users },
  { id: "role", label: "Role", icon: Eye },
  { id: "quest", label: "Quest", icon: Swords },
];

const players: Player[] = [
  { name: "Mira", seat: 1, ready: true, side: "loyal" },
  { name: "Rowan", seat: 2, ready: true, side: "shadow" },
  { name: "Noah", seat: 3, ready: true, side: "loyal" },
  { name: "Iris", seat: 4, ready: false, side: "loyal" },
  { name: "Vale", seat: 5, ready: true, side: "shadow" },
];

const questTrack = [
  { label: "I", status: "good", team: "2 players" },
  { label: "II", status: "pending", team: "3 players" },
  { label: "III", status: "empty", team: "2 players" },
  { label: "IV", status: "empty", team: "3 players" },
  { label: "V", status: "empty", team: "3 players" },
];

export function AvalonPrototype() {
  const router = useRouter();
  const [surface, setSurface] = useState<PrototypeSurface>("entry");
  const [playerName, setPlayerName] = useState("Mira");
  const [roomCode, setRoomCode] = useState("AVN042");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeIndex = useMemo(
    () => surfaces.findIndex((item) => item.id === surface),
    [surface],
  );

  useEffect(() => {
    const savedName = localStorage.getItem("avalon:playerName");
    if (savedName) {
      queueMicrotask(() => {
        setPlayerName(savedName);
      });
    }
  }, []);

  async function createRoom() {
    setBusy("create");
    setError(null);

    try {
      const playerId = getOrCreatePlayerId();
      const name = cleanName(playerName);
      const identity = await loadOrCreatePlayerIdentity(playerId, name);
      localStorage.setItem("avalon:playerName", name);
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, name, publicKeys: publicKeysFromIdentity(identity) }),
      });
      const body = (await response.json()) as { room?: { roomId: string }; error?: string };
      if (!response.ok || !body.room) {
        throw new Error(body.error ?? "Could not create room.");
      }
      router.push(`/room/${body.room.roomId}`);
    } catch (createError) {
      setError(errorText(createError));
      setBusy(null);
    }
  }

  async function joinExistingRoom() {
    setBusy("join");
    setError(null);

    try {
      const playerId = getOrCreatePlayerId();
      const normalizedRoom = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      const name = cleanName(playerName);
      const identity = await loadOrCreatePlayerIdentity(playerId, name);
      localStorage.setItem("avalon:playerName", name);
      const response = await fetch("/api/rooms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: normalizedRoom, playerId, name, publicKeys: publicKeysFromIdentity(identity) }),
      });
      const body = (await response.json()) as { room?: { roomId: string }; error?: string };
      if (!response.ok || !body.room) {
        throw new Error(body.error ?? "Could not join room.");
      }
      router.push(`/room/${body.room.roomId}`);
    } catch (joinError) {
      setError(errorText(joinError));
      setBusy(null);
    }
  }

  return (
    <main className="avalon-app">
      <header className="avalon-hero">
        <nav className="prototype-tabs" aria-label="Prototype screens">
          {surfaces.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={surface === item.id ? "active" : ""}
                onClick={() => setSurface(item.id)}
                aria-pressed={surface === item.id}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
                <small>{String(index + 1).padStart(2, "0")}</small>
              </button>
            );
          })}
        </nav>

        <section className="hero-grid">
          <div className="hero-copy">
            <div className="brand-mark" aria-label="Avalon Local Protocol">
              <span>AV</span>
            </div>
            <p className="prototype-kicker">Local protocol table</p>
            <h1 className="avalon-title">Avalon without a dealer</h1>
            <p className="avalon-deck">
              Roles, private sight, and quest secrets live between browsers. The
              server carries sealed envelopes and forgets the room.
            </p>
            <div className="hero-actions">
              <button type="button" onClick={createRoom} disabled={busy !== null}>
                <Play aria-hidden="true" size={18} />
                <span>{busy === "create" ? "Creating" : "Create room"}</span>
              </button>
              <button type="button" className="quiet-button" onClick={() => setSurface("entry")}>
                <KeyRound aria-hidden="true" size={18} />
                <span>Join by code</span>
              </button>
            </div>
            {error ? <p className="prototype-error">{error}</p> : null}
          </div>

          <div className="table-scene" aria-label="Avalon table preview">
            <RoundTable activeIndex={activeIndex} />
          </div>
        </section>
      </header>

      <section className="prototype-stage" aria-live="polite">
        <div className="stage-frame">
          <div className="phone-shell">
            <PrototypeScreen
              surface={surface}
              playerName={playerName}
              roomCode={roomCode}
              busy={busy}
              error={error}
              onPlayerNameChange={setPlayerName}
              onRoomCodeChange={setRoomCode}
              onJoinRoom={joinExistingRoom}
            />
          </div>
          <aside className="control-rail" aria-label="Table state">
            <RailItem icon={Lock} label="Genesis" value="5 signed" />
            <RailItem icon={Shield} label="Relay" value="Redis ready" />
            <RailItem icon={Vote} label="Vote" value="Commit phase" />
            <RailItem icon={Crown} label="Leader" value="Mira" />
          </aside>
        </div>
      </section>
    </main>
  );
}

function PrototypeScreen({
  surface,
  playerName,
  roomCode,
  busy,
  error,
  onPlayerNameChange,
  onRoomCodeChange,
  onJoinRoom,
}: {
  surface: PrototypeSurface;
  playerName: string;
  roomCode: string;
  busy: "create" | "join" | null;
  error: string | null;
  onPlayerNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onJoinRoom: () => void;
}) {
  if (surface === "lobby") {
    return <LobbyScreen />;
  }

  if (surface === "role") {
    return <RoleScreen />;
  }

  if (surface === "quest") {
    return <QuestScreen />;
  }

  return (
    <EntryScreen
      playerName={playerName}
      roomCode={roomCode}
      busy={busy}
      error={error}
      onPlayerNameChange={onPlayerNameChange}
      onRoomCodeChange={onRoomCodeChange}
      onJoinRoom={onJoinRoom}
    />
  );
}

function EntryScreen({
  playerName,
  roomCode,
  busy,
  error,
  onPlayerNameChange,
  onRoomCodeChange,
  onJoinRoom,
}: {
  playerName: string;
  roomCode: string;
  busy: "create" | "join" | null;
  error: string | null;
  onPlayerNameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onJoinRoom: () => void;
}) {
  const displayCode = roomCode.padEnd(6, " ").slice(0, 6).split("");

  return (
    <section className="mobile-screen entry-screen">
      <ScreenHeader eyebrow="Room" title="Gather the table" action="Join" />
      <div className="room-code">
        {displayCode.map((letter, index) => (
          <span key={`${letter}-${index}`}>{letter.trim() || "·"}</span>
        ))}
      </div>
      <label className="prototype-field">
        <span>Name</span>
        <input value={playerName} onChange={(event) => onPlayerNameChange(event.target.value)} />
      </label>
      <label className="prototype-field">
        <span>Room code</span>
        <input
          value={roomCode}
          maxLength={8}
          autoCapitalize="characters"
          onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
        />
      </label>
      <button type="button" className="wide-command" onClick={onJoinRoom} disabled={busy !== null}>
        <ArrowRight aria-hidden="true" size={18} />
        <span>{busy === "join" ? "Joining" : "Enter lobby"}</span>
      </button>
      {error ? <p className="prototype-error compact">{error}</p> : null}
      <StatusStrip />
    </section>
  );
}

function LobbyScreen() {
  return (
    <section className="mobile-screen lobby-screen">
      <ScreenHeader eyebrow="Lobby" title="Five at the gate" action="Lock" />
      <div className="checksum-bar">
        <span>ash</span>
        <span>crown</span>
        <span>river</span>
      </div>
      <div className="player-list">
        {players.map((player) => (
          <article key={player.name} className="player-row">
            <div>
              <strong>{player.name}</strong>
              <span>Seat {player.seat}</span>
            </div>
            <span className={player.ready ? "ready-chip" : "wait-chip"}>
              {player.ready ? "Ready" : "Wait"}
            </span>
          </article>
        ))}
      </div>
      <button type="button" className="wide-command">
        <Lock aria-hidden="true" size={18} />
        <span>Lock genesis</span>
      </button>
    </section>
  );
}

function RoleScreen() {
  return (
    <section className="mobile-screen role-screen">
      <ScreenHeader eyebrow="Private view" title="Merlin" action="Seal" />
      <div className="role-card">
        <div className="role-card-top">
          <Sparkles aria-hidden="true" size={22} />
          <span>LOYAL</span>
        </div>
        <strong>The hidden map is yours.</strong>
        <p>Shadows seen: Rowan, Vale.</p>
      </div>
      <div className="intel-grid">
        <span>Rowan</span>
        <span>Vale</span>
        <span>Assassin unknown</span>
      </div>
      <button type="button" className="wide-command danger-command">
        <Eye aria-hidden="true" size={18} />
        <span>Hide role</span>
      </button>
    </section>
  );
}

function QuestScreen() {
  return (
    <section className="mobile-screen quest-screen">
      <ScreenHeader eyebrow="Round 2" title="Choose the quest" action="Mira" />
      <div className="quest-track" aria-label="Quest track">
        {questTrack.map((quest) => (
          <div key={quest.label} className={`quest-node ${quest.status}`}>
            <strong>{quest.label}</strong>
            <span>{quest.team}</span>
          </div>
        ))}
      </div>
      <div className="nominee-grid">
        {players.slice(0, 4).map((player, index) => (
          <button
            key={player.name}
            type="button"
            className={index < 3 ? "selected" : ""}
            aria-pressed={index < 3}
          >
            <span>{player.name}</span>
            {index < 3 ? <Check aria-hidden="true" size={16} /> : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        ))}
      </div>
      <div className="vote-band">
        <span>Proposal</span>
        <strong>3 yes · 1 sealed</strong>
      </div>
    </section>
  );
}

function ScreenHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action: string;
}) {
  return (
    <div className="screen-header">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <button type="button">{action}</button>
    </div>
  );
}

function RoundTable({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="round-table">
      <div className="table-rim">
        {players.map((player, index) => (
          <div
            key={player.name}
            className={`seat-token ${index === activeIndex ? "active" : ""} ${player.side}`}
            style={seatStyle(index)}
          >
            <span>{player.name.slice(0, 1)}</span>
          </div>
        ))}
        <div className="table-core">
          <Castle aria-hidden="true" size={38} />
          <strong>AVN-042</strong>
          <span>Genesis sealed</span>
        </div>
      </div>
    </div>
  );
}

function seatStyle(index: number): React.CSSProperties {
  const angle = ((index * 72 - 90) * Math.PI) / 180;
  const distance = 43;
  return {
    "--seat-x": `${50 + Math.cos(angle) * distance}%`,
    "--seat-y": `${50 + Math.sin(angle) * distance}%`,
  } as React.CSSProperties;
}

function RailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rail-item">
      <Icon aria-hidden="true" size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusStrip() {
  return (
    <div className="status-strip">
      <span>WebSocket</span>
      <strong>Ready</strong>
      <span>MPC worker</span>
      <strong>Idle</strong>
    </div>
  );
}

function getOrCreatePlayerId(): string {
  const existing = localStorage.getItem("avalon:playerId");
  if (existing) {
    return existing;
  }

  const playerId = crypto.randomUUID();
  localStorage.setItem("avalon:playerId", playerId);
  return playerId;
}

function cleanName(value: string): string {
  const trimmed = value.trim().slice(0, 32);
  return trimmed || "Player";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Room action failed.";
}
