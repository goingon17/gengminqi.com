"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { BETS, dicePayout, describe, GAMES, randomInt, REEL, roulettePayout, slotsPayout, START_BALANCE, type GameId } from "./rules";
import type { Rounds } from "./Scene";
import { chime, chip, setMuted, unlockAudio } from "./sound";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

const STORE = "gmq-casino-v1";
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

type Result = { id: number; delta: number; detail: string };
type Pending = { game: GameId; option: string; bet: number; target?: number; stops?: number[] };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "null");
    if (s && typeof s.balance === "number") return s as { balance: number; muted: boolean };
  } catch {}
  return null;
}

function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      const v = a + (value - a) * (1 - (1 - p) ** 3);
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

export function Casino() {
  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState(0);
  const [balance, setBalance] = useState(START_BALANCE);
  const [betIdx, setBetIdx] = useState(1);
  const [options, setOptions] = useState<Record<GameId, string>>({ roulette: "red", dice: "big", slots: "line" });
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [muted, setMute] = useState(false);
  const [rounds, setRounds] = useState<Rounds>({ roulette: null, dice: null, slots: null });
  const [glow, setGlow] = useState(0);
  const pending = useRef<Pending | null>(null);
  const ready = useRef(false);
  const shown = useCountUp(balance);

  const game = GAMES[active];
  const bet = BETS[betIdx];
  const broke = balance < BETS[0] && !playing;

  useEffect(() => {
    const s = load();
    if (s) {
      // Restoring browser-only state after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBalance(s.balance);
      setMute(s.muted);
      setMuted(s.muted);
    }
    ready.current = true;
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ balance, muted }));
    } catch {}
  }, [balance, muted]);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 3200);
    return () => clearTimeout(t);
  }, [result]);

  const settle = useCallback((multiplier: number, detail: string) => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const win = p.bet * multiplier;
    setBalance((b) => b + win);
    setResult({ id: Date.now(), delta: win - p.bet, detail });
    chime(win > 0);
    if (win > p.bet) setGlow((g) => g + 1);
    setPlaying(false);
  }, []);

  const go = useCallback(
    (dir: number) => {
      if (playing) return;
      setActive((a) => (a + dir + GAMES.length) % GAMES.length);
      setResult(null);
    },
    [playing],
  );

  const play = useCallback(() => {
    if (playing || !entered) return;
    if (balance < bet) {
      setResult({ id: Date.now(), delta: 0, detail: "筹码不足，调低下注" });
      return;
    }
    unlockAudio();
    chip();
    setResult(null);
    setPlaying(true);
    setBalance((b) => b - bet);
    const id = Date.now();
    const p: Pending = { game: game.id, option: options[game.id], bet };
    pending.current = p;
    if (game.id === "roulette") {
      p.target = randomInt(37);
      setRounds((r) => ({ ...r, roulette: { id, target: p.target! } }));
    } else if (game.id === "dice") {
      setRounds((r) => ({ ...r, dice: { id } }));
    } else {
      p.stops = [0, 0, 0].map(() => randomInt(REEL.length));
      setRounds((r) => ({ ...r, slots: { id, stops: p.stops! } }));
    }
  }, [playing, entered, balance, bet, game.id, options]);

  const onRouletteDone = useCallback(() => {
    const p = pending.current;
    if (p?.target === undefined) return;
    settle(roulettePayout(p.option, p.target), describe("roulette", p.target));
  }, [settle]);

  const onDiceDone = useCallback((faces: number[]) => {
    const p = pending.current;
    if (p) settle(dicePayout(p.option, faces), describe("dice", faces));
  }, [settle]);

  const onSlotsDone = useCallback(() => {
    const stops = pending.current?.stops;
    if (!stops) return;
    const mult = slotsPayout(stops);
    settle(mult, mult >= 2 ? "三连" : mult > 0 ? "两连" : "");
  }, [settle]);

  // Keyboard: arrows switch tables, space / enter plays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!entered || (e.target as HTMLElement).closest("button")) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        play();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [entered, go, play]);

  // Horizontal swipe on the scene switches tables.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const enter = () => {
    unlockAudio();
    chip();
    setEntered(true);
  };

  const toggleMute = () => {
    setMute((m) => {
      setMuted(!m);
      return !m;
    });
  };

  return (
    <div className={`casino${entered ? " in" : ""}${playing ? " busy" : ""}`}>
      <div className="stage" onPointerDown={onDown} onPointerUp={onUp}>
        <Scene active={active} lit={entered} glow={glow} rounds={rounds} onRouletteDone={onRouletteDone} onDiceDone={onDiceDone} onSlotsDone={onSlotsDone} />
      </div>
      <div className="vignette" aria-hidden="true" />

      <header className="top">
        <span className="mark">
          The Quiet Casino<i>静</i>
        </span>
        <div className="top-right">
          <span className="balance" aria-label={`余额 ${fmt(balance)} 筹码`}>
            <b>{fmt(shown)}</b>
            <small>chips</small>
          </span>
          <button type="button" className="icon" onClick={toggleMute} aria-label={muted ? "打开声音" : "关闭声音"}>
            {muted ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path d="m17 9 4 6m0-6-4 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z" />
                <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <button type="button" className="nav prev" onClick={() => go(-1)} disabled={playing} aria-label="上一张桌子">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <button type="button" className="nav next" onClick={() => go(1)} disabled={playing} aria-label="下一张桌子">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>

      <div className="result" aria-live="polite">
        {result && (
          <div key={result.id} className={`result-in ${result.delta > 0 ? "win" : result.delta < 0 ? "lose" : ""}`}>
            {result.delta !== 0 && (
              <b>
                {result.delta > 0 ? "+" : "−"}
                {fmt(Math.abs(result.delta))}
              </b>
            )}
            {result.detail && <span>{result.detail}</span>}
          </div>
        )}
      </div>

      <section className="panel" aria-label="游戏控制">
        <div className="title">
          <span className="count">
            {String(active + 1).padStart(2, "0")} / {String(GAMES.length).padStart(2, "0")}
          </span>
          <h1>
            {game.name}
            <span>{game.zh}</span>
          </h1>
        </div>

        <div className="options" role="radiogroup" aria-label="下注选项">
          {game.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={options[game.id] === o.id}
              className={options[game.id] === o.id ? "on" : ""}
              disabled={playing}
              onClick={() => {
                chip();
                setOptions((s) => ({ ...s, [game.id]: o.id }));
              }}
            >
              {o.label}
              <small>{o.hint}</small>
            </button>
          ))}
        </div>

        <div className="controls">
          <div className="bet" aria-label="下注金额">
            <button type="button" onClick={() => setBetIdx((i) => Math.max(0, i - 1))} disabled={playing || betIdx === 0} aria-label="减少下注">
              −
            </button>
            <span>
              <small>bet</small>
              {bet}
            </span>
            <button type="button" onClick={() => setBetIdx((i) => Math.min(BETS.length - 1, i + 1))} disabled={playing || betIdx === BETS.length - 1} aria-label="增加下注">
              +
            </button>
          </div>
          {broke ? (
            <button type="button" className="action refill" onClick={() => setBalance(START_BALANCE)}>
              再领 1,000
            </button>
          ) : (
            <button type="button" className="action" onClick={play} disabled={playing}>
              <span>{playing ? "···" : game.action}</span>
            </button>
          )}
        </div>
        <p className="fine">虚拟筹码 · 仅供娱乐 · 不涉及任何真实货币</p>
      </section>

      <div className={`intro${entered ? " gone" : ""}`} aria-hidden={entered}>
        <div className="intro-in">
          <p className="intro-k">gengminqi.com</p>
          <h2>
            The Quiet
            <br />
            Casino
          </h2>
          <p className="intro-sub">三张桌子，一盏灯。</p>
          <button type="button" onClick={enter} tabIndex={entered ? -1 : 0}>
            Enter <span>进入</span>
          </button>
          <p className="fine">虚拟筹码，仅供娱乐。不提供充值、提现或任何真实货币交易。</p>
        </div>
      </div>
    </div>
  );
}
