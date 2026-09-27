"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Work } from "../content";

export function Works({ works }: { works: Work[] }) {
  const list = useRef<HTMLOListElement>(null);
  const float = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const box = float.current;
    const ol = list.current;
    if (!box || !ol || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const pos = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0;
    const inside = () => {
      const r = ol.getBoundingClientRect();
      if (pos.x < r.left || pos.x > r.right || pos.y < r.top || pos.y > r.bottom) setActive(null);
    };
    const onMove = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
    };
    const loop = () => {
      const vx = pos.x - cur.x;
      cur.x += vx * 0.14;
      cur.y += (pos.y - cur.y) * 0.14;
      box.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${Math.max(-8, Math.min(8, vx * 0.08)).toFixed(2)}deg)`;
      raf = requestAnimationFrame(loop);
    };
    const onEnter = (e: PointerEvent) => {
      cur.x = pos.x = e.clientX;
      cur.y = pos.y = e.clientY;
    };
    ol.addEventListener("pointerenter", onEnter);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("scroll", inside, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ol.removeEventListener("pointerenter", onEnter);
      removeEventListener("pointermove", onMove);
      removeEventListener("scroll", inside);
    };
  }, []);

  return (
    <>
      <ol className="works" ref={list} onPointerLeave={() => setActive(null)}>
        {works.map((w, i) => {
          const Row = w.href ? "a" : "div";
          return (
            <li key={w.index} data-reveal style={{ "--i": i } as React.CSSProperties}>
              <Row
                className="work"
                {...(w.href ? { href: w.href, target: "_blank", rel: "noreferrer" } : {})}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                tabIndex={w.href ? undefined : 0}
              >
                <span className="w-index">{w.index}</span>
                <span className="w-main">
                  <span className="w-title">{w.title}</span>
                  <span className="w-sub">{w.subtitle}</span>
                </span>
                <span className="w-tags">
                  {w.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </span>
                <span className="w-year">{w.status}</span>
                <span className="w-art" aria-hidden="true">
                  <Art kind={w.art} />
                </span>
              </Row>
            </li>
          );
        })}
      </ol>
      <div className={`w-float${active === null ? "" : " show"}`} ref={float} aria-hidden="true">
        {works.map((w, i) => (
          <div key={w.index} className={`w-float-art${active === i ? " on" : ""}`}>
            <Art kind={w.art} />
            <span>
              {w.index} — {w.tags[0]}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function Art({ kind }: { kind: Work["art"] }) {
  const id = `holo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const grad = (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff9ec7" />
        <stop offset=".35" stopColor="#ffe29a" />
        <stop offset=".65" stopColor="#8ff5d2" />
        <stop offset="1" stopColor="#9fb4ff" />
      </linearGradient>
    </defs>
  );
  const holo = `url(#${id})`;

  if (kind === "cipher") {
    const r = rand(7);
    const rings = Array.from({ length: 14 }, (_, k) => {
      const base = 18 + k * 8.5;
      let d = "";
      for (let s = 0; s <= 120; s++) {
        const th = (s / 120) * Math.PI * 2;
        const rr = base + (r() - 0.5) * k * 0.9;
        d += `${s ? "L" : "M"}${(200 + rr * Math.cos(th)).toFixed(1)} ${(150 + rr * Math.sin(th)).toFixed(1)}`;
      }
      return <path key={k} d={d + "Z"} stroke={k === 4 ? holo : "currentColor"} strokeOpacity={k === 4 ? 1 : 0.55 - k * 0.025} />;
    });
    return (
      <svg viewBox="0 0 400 300" fill="none" strokeWidth="1">
        {grad}
        {rings}
        <circle cx="200" cy="150" r="7" fill={holo} />
        <text x="16" y="286" className="art-t">Dec(ƒ̂(c)) = ƒ(x)</text>
      </svg>
    );
  }

  if (kind === "table") {
    const seats = Array.from({ length: 10 }, (_, k) => {
      const th = (k / 10) * Math.PI * 2 - Math.PI / 2;
      return { x: 200 + 108 * Math.cos(th), y: 150 + 108 * Math.sin(th), evil: [1, 4, 7, 8].includes(k) };
    });
    return (
      <svg viewBox="0 0 400 300" fill="none" strokeWidth="1">
        {grad}
        {seats.map((a, i) =>
          seats.slice(i + 1).map((b, j) => (i + j) % 3 === 0 && <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeOpacity=".16" />),
        )}
        <circle cx="200" cy="150" r="62" stroke="currentColor" strokeOpacity=".7" />
        <circle cx="200" cy="150" r="56" stroke="currentColor" strokeOpacity=".25" strokeDasharray="2 4" />
        {seats.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r="11" fill={s.evil ? holo : "none"} stroke={s.evil ? "none" : "currentColor"} />
        ))}
        <text x="16" y="286" className="art-t">sig(role ⊕ seed)</text>
      </svg>
    );
  }

  if (kind === "market") {
    const r = rand(42);
    let p = 0.62;
    const pts: [number, number][] = [];
    for (let k = 0; k <= 60; k++) {
      const shock = k === 34 ? -0.38 : k === 46 ? 0.5 : 0;
      p = Math.max(0.04, Math.min(0.96, p + (r() - 0.5) * 0.08 + shock));
      pts.push([20 + k * 6, 260 - p * 220]);
    }
    const d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    return (
      <svg viewBox="0 0 400 300" fill="none" strokeWidth="1.2">
        {grad}
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <line key={v} x1="20" x2="380" y1={260 - v * 220} y2={260 - v * 220} stroke="currentColor" strokeOpacity={v === 0.5 ? 0.4 : 0.12} strokeDasharray={v === 0.5 ? "3 4" : undefined} />
        ))}
        <path d={`${d}L380 260L20 260Z`} fill={holo} fillOpacity=".08" stroke="none" />
        <path d={d} stroke={holo} strokeWidth="1.6" />
        <circle cx={pts[34][0]} cy={pts[34][1]} r="4" fill="currentColor" />
        <circle cx={pts[46][0]} cy={pts[46][1]} r="4" fill="currentColor" />
        <text x="16" y="286" className="art-t">P(win) · reversal ×2</text>
      </svg>
    );
  }

  return null;
}
