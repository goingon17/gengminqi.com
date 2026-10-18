"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { WECHAT } from "./Card";
import { BETS, dicePayout, describe, GAMES, randomInt, REEL, roulettePayout, slotsPayout, START_BALANCE, type GameId } from "./rules";
import type { Focus, Rounds } from "./Scene";
import { chime, chip, setMuted, unlockAudio } from "./sound";

const Scene = dynamic(() => import("./Scene"), { ssr: false });

const STORE = "gmq-casino-v1";
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const LABEL: Record<Focus, string> = { card: "名片 · Card", roulette: "轮盘 · Roulette", dice: "骰宝 · Sic Bo", slots: "老虎机 · Slots" };

type Result = { id: number; delta: number; detail: string };
type Pending = { game: GameId; option: string; bet: number; target?: number; stops?: number[] };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "null");
    if (s && typeof s.balance === "number") return s as { balance: number; muted: boolean };
  } catch {}
  return null;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
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
  const [focus, setFocus] = useState<Focus | null>(null);
  const [hover, setHover] = useState<Focus | null>(null);
  const [balance, setBalance] = useState(START_BALANCE);
  const [betIdx, setBetIdx] = useState(1);
  const [options, setOptions] = useState<Record<GameId, string>>({ roulette: "red", dice: "big", slots: "line" });
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [muted, setMute] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rounds, setRounds] = useState<Rounds>({ roulette: null, dice: null, slots: null });
  const [glow, setGlow] = useState(0);
  const pending = useRef<Pending | null>(null);
  const ready = useRef(false);
  const shown = useCountUp(balance);

  const game = focus && focus !== "card" ? GAMES.find((g) => g.id === focus)! : null;
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

  const pick = useCallback((id: Focus) => {
    unlockAudio();
    chip();
    setHover(null);
    setFocus(id);
  }, []);

  const back = useCallback(() => {
    setFocus(null);
    setCopied(false);
  }, []);

  const play = useCallback(() => {
    if (playing || !game) return;
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
  }, [playing, game, balance, bet, options]);

  const onRouletteDone = useCallback(() => {
    const p = pending.current;
    if (p?.target === undefined) return;
    settle(roulettePayout(p.option, p.target), describe("roulette", p.target));
  }, [settle]);

  const onDiceDone = useCallback(
    (faces: number[]) => {
      const p = pending.current;
      if (p) settle(dicePayout(p.option, faces), describe("dice", faces));
    },
    [settle],
  );

  const onSlotsDone = useCallback(() => {
    const stops = pending.current?.stops;
    if (!stops) return;
    const mult = slotsPayout(stops);
    settle(mult, mult >= 2 ? "三连" : mult > 0 ? "两连" : "");
  }, [settle]);

  // Keyboard: Escape returns to the table, space / enter plays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") back();
      else if ((e.key === " " || e.key === "Enter") && game && !(e.target as HTMLElement).closest("button")) {
        e.preventDefault();
        play();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [back, play, game]);

  const copy = async () => {
    unlockAudio();
    if (await copyText(WECHAT)) {
      chip();
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const toggleMute = () => {
    setMute((m) => {
      setMuted(!m);
      return !m;
    });
  };

  return (
    <div className={`casino${focus ? " focused" : ""}${playing ? " busy" : ""}`}>
      <div className="stage">
        <Scene
          focus={focus}
          glow={glow}
          balance={balance}
          rounds={rounds}
          onPick={pick}
          onHover={setHover}
          onBack={back}
          onRouletteDone={onRouletteDone}
          onDiceDone={onDiceDone}
          onSlotsDone={onSlotsDone}
        />
      </div>
      <div className="vignette" aria-hidden="true" />

      <header className="top">
        {focus ? (
          <button type="button" className="back" onClick={back}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5 8 12l7 7" />
            </svg>
            桌面
          </button>
        ) : (
          <span className="mark">gengminqi.com</span>
        )}
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

      {/* Overview: the table itself is the menu. */}
      <div className={`hint${focus ? " hide" : ""}`} aria-hidden={!!focus}>
        <span key={hover ?? "none"}>{hover ? LABEL[hover] : "轻触桌上的物件"}</span>
        <p className="fine">虚拟筹码 · 仅供娱乐 · 不涉及任何真实货币</p>
      </div>

      {focus === "card" && (
        <section className="panel" aria-label="名片">
          <div className="controls">
            <button type="button" className="action wide" onClick={copy}>
              <span>{copied ? "已复制 ✓" : "复制微信号"}</span>
            </button>
          </div>
          <p className="fine">打开微信 → 添加朋友 → 粘贴搜索</p>
        </section>
      )}

      {game && (
        <section className="panel" aria-label="游戏控制" key={game.id}>
          {/* The outcome briefly takes the title's place. */}
          <div className="title" aria-live="polite">
            {result ? (
              <div key={result.id} className={`result-in ${result.delta > 0 ? "win" : result.delta < 0 ? "lose" : ""}`}>
                {result.delta !== 0 && (
                  <b>
                    {result.delta > 0 ? "+" : "−"}
                    {fmt(Math.abs(result.delta))}
                  </b>
                )}
                {result.detail && <span>{result.detail}</span>}
              </div>
            ) : (
              <h1 key="name">
                {game.name}
                <span>{game.zh}</span>
              </h1>
            )}
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
      )}
    </div>
  );
}
