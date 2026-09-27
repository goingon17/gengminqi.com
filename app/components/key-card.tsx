"use client";

import { useEffect, useRef, useState } from "react";
import { profile } from "../content";
import { copyText } from "./copy";

// Security-printing guilloche, used as a mask for the holographic foil.
// Drawn once for the landscape card and once for the portrait (mobile) card.
function guilloche(W: number, H: number) {
  const paths: string[] = [];
  const f = (n: number) => n.toFixed(1);
  const k = Math.min(W, H) / 630;
  for (let i = 0; i < 26; i++) {
    const ph = i * 0.24;
    let d = "";
    for (let x = -10; x <= W + 10; x += 6) {
      const u = x / 1000;
      const y = H * (W > H ? 0.7 : 0.76) + k * (40 * Math.sin(u * Math.PI * 4 + ph) + 14 * Math.sin(u * Math.PI * 13 - ph * 1.7) + (i - 13) * 1.6);
      d += `${x < 0 ? "M" : "L"}${f(x)} ${f(y)}`;
    }
    paths.push(d);
  }
  const cx = W - 200 * k;
  const cy = H * (W > H ? 0.36 : 0.22);
  for (let j = 0; j < 22; j++) {
    let d = "";
    for (let s = 0; s <= 360; s++) {
      const th = (s / 360) * Math.PI * 2;
      const rr = 0.85 * k * (118 + 34 * Math.sin(9 * th + j * 0.29) + 10 * Math.cos(4 * th - j * 0.5));
      d += `${s ? "L" : "M"}${f(cx + rr * Math.cos(th))} ${f(cy + rr * Math.sin(th))}`;
    }
    paths.push(d + "Z");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g fill="none" stroke="#fff" stroke-width="1.1">${paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const masks = { "--mask-l": guilloche(1000, 630), "--mask-p": guilloche(630, 1000) } as React.CSSProperties;

type Tilt = { x: number; y: number };

export function KeyCard({ qr }: { qr: string }) {
  const card = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const [back, setBack] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rot = reduced ? 0 : -540;
    let vel = 0;
    let target = 0;
    const tilt: Tilt = { x: reduced ? 0 : 38, y: 0 };
    const want: Tilt = { x: 0, y: 0 };
    let lastInput = -1e9;
    let showingBack = false;
    let drag: { id: number; x: number; y: number; rot: number; t: number; moved: boolean } | null = null;
    let gyro: { beta: number; gamma: number } | null = null;

    const onMouse = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || drag) return;
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (innerHeight / 2);
      want.x = Math.max(-1, Math.min(1, ny)) * -16;
      want.y = Math.max(-1, Math.min(1, nx)) * 20;
      lastInput = performance.now();
    };

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      gyro ??= { beta: e.beta, gamma: e.gamma };
      // Slowly re-center so the neutral pose follows how the phone is held.
      gyro.beta += (e.beta - gyro.beta) * 0.01;
      gyro.gamma += (e.gamma - gyro.gamma) * 0.01;
      const dx = Math.max(-30, Math.min(30, e.beta - gyro.beta));
      const dy = Math.max(-30, Math.min(30, e.gamma - gyro.gamma));
      want.x = dx * -0.8;
      want.y = dy * 0.9;
      lastInput = performance.now();
      dispatchEvent(new CustomEvent("gmq:tilt", { detail: { x: dy / 30, y: dx / 30 } }));
    };

    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button, a")) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, rot, t: performance.now(), moved: false };
      el.setPointerCapture(e.pointerId);
      el.classList.add("grab");
    };
    const onDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6 || Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
      const next = drag.rot + dx * 0.5;
      vel = next - rot;
      rot = next;
      want.x = Math.max(-18, Math.min(18, (e.clientY - drag.y) * -0.15));
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = !drag.moved && performance.now() - drag.t < 400;
      if (tap) target = Math.round(rot / 180) * 180 + 180;
      else target = Math.round((rot + vel * 10) / 180) * 180;
      drag = null;
      el.classList.remove("grab");
      lastInput = performance.now();
    };
    const onClick = () => {
      const DO = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof DO?.requestPermission === "function" && !gyro) {
        DO.requestPermission().then((s) => s === "granted" && addEventListener("deviceorientation", onOrient)).catch(() => {});
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.target !== el) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        target = Math.round(rot / 180) * 180 + 180;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        target += e.key === "ArrowLeft" ? -180 : 180;
      }
    };

    let raf = 0;
    const loop = (now: number) => {
      if (!drag) {
        vel = (vel + (target - rot) * 0.045) * 0.86;
        rot += vel;
      }
      const idle = now - lastInput > 3000 && !drag;
      const wx = idle && !reduced ? Math.sin(now / 1900) * 4 : want.x;
      const wy = idle && !reduced ? Math.cos(now / 2300) * 6 : want.y;
      tilt.x += (wx - tilt.x) * 0.08;
      tilt.y += (wy - tilt.y) * 0.08;

      const face = ((Math.round(rot / 180) % 2) + 2) % 2 === 1;
      if (face !== showingBack) {
        showingBack = face;
        setBack(face);
      }
      // Light direction relative to the visible face.
      const off = rot - Math.round(rot / 180) * 180;
      const ly = (tilt.y + off) * (face ? -1 : 1);
      el.style.transform = `rotateX(${tilt.x.toFixed(2)}deg) rotateY(${(rot + tilt.y).toFixed(2)}deg)`;
      el.style.setProperty("--gx", `${(50 + ly * 2.6).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(50 - tilt.x * 2.8).toFixed(1)}%`);
      el.style.setProperty("--hx", `${(50 + ly * 3.2).toFixed(1)}%`);
      el.style.setProperty("--hy", `${(50 + tilt.x * 3.2).toFixed(1)}%`);
      el.style.setProperty("--ha", `${Math.min(1, 0.35 + Math.hypot(ly, tilt.x) / 22).toFixed(2)}`);
      if (shadow.current) {
        const sp = Math.abs(Math.cos((rot * Math.PI) / 180));
        shadow.current.style.transform = `translate(${(-ly * 1.2).toFixed(1)}px, ${(tilt.x * 1.2).toFixed(1)}px) scaleX(${(0.35 + sp * 0.65).toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const DO = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (DO && typeof DO.requestPermission !== "function") addEventListener("deviceorientation", onOrient);

    addEventListener("pointermove", onMouse, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onDrag);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onMouse);
      removeEventListener("deviceorientation", onOrient);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onDrag);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKey);
    };
  }, []);

  const copy = async () => {
    if (await copyText(profile.wechat)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const [first, ...rest] = profile.name.split(" ");

  return (
    <div className="stage">
      <div className="card-shadow" ref={shadow} aria-hidden="true" />
      <div
        className="card"
        ref={card}
        role="button"
        tabIndex={0}
        aria-label={`名片：${profile.name}。按回车翻面。`}
        style={masks}
      >
        <div className="face front" inert={back}>
          <div className="foil" aria-hidden="true" />
          <div className="face-in">
            <div className="c-top">
              <span>Public Key</span>
              <span>公钥 · Nº {profile.wechat.replace(/\D/g, "")}</span>
            </div>
            <Seal />
            <div className="c-name">
              <h1>
                {first} <em>{rest.join(" ")}</em>
              </h1>
              {profile.nameZh && <span className="c-zh">{profile.nameZh}</span>}
            </div>
            <div className="c-role">
              {profile.role} — {profile.taglineEn}
            </div>
            <div className="c-foot">
              <span>e = 65537</span>
              <span>WeChat · {profile.wechat}</span>
              <span>{profile.site}</span>
            </div>
          </div>
          <div className="glare" aria-hidden="true" />
        </div>

        <div className="face back" inert={!back}>
          <div className="foil faint" aria-hidden="true" />
          <div className="face-in back-in">
            <div className="qr">
              <div className="qr-tile" dangerouslySetInnerHTML={{ __html: qr }} />
              <span>微信扫码加我</span>
            </div>
            <div className="back-info">
              <span className="k">WeChat / 微信</span>
              <strong>{profile.wechat}</strong>
              <div className="c-actions">
                <button type="button" onClick={copy}>
                  {copied ? "已复制 ✓" : "复制微信号"}
                </button>
                <a href="/contact.vcf" download={`${profile.name}.vcf`}>
                  存入通讯录
                </a>
              </div>
              <span className="k dim">e = 0x10001 = 2¹⁶ + 1</span>
            </div>
          </div>
          <div className="glare" aria-hidden="true" />
        </div>
      </div>
      <p className="stage-hint" aria-hidden="true">
        <span className="hint-fine">拖动旋转 · 点击翻面</span>
        <span className="hint-touch">轻点翻面 · 左右拨动 · 倾斜手机</span>
      </p>
    </div>
  );
}

function Seal() {
  return (
    <svg className="seal" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <path id="seal-ring" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth=".6" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth=".6" />
      <text fontSize="7.4" letterSpacing="1.6" fill="currentColor">
        <textPath href="#seal-ring">FERMAT PRIME · F₄ · 2¹⁶+1 · 65537 ·</textPath>
      </text>
      <text x="50" y="59" textAnchor="middle" fontSize="28" fontStyle="italic" fill="currentColor" className="seal-e">
        e
      </text>
    </svg>
  );
}
