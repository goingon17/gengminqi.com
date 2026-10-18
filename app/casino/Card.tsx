"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { COLORS, materials } from "./materials";

export const WECHAT = "o65537";
export const CARD_W = 2.7;
export const CARD_D = 1.56;
const T = 0.03;

// Draw the card face once the page fonts are ready so the canvas uses Geist.
function useFace() {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => {
      if (!live) return;
      const family = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "sans-serif";
      const w = 2048;
      const h = Math.round((w * CARD_D) / CARD_W);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = COLORS.ivory;
      g.fillRect(0, 0, w, h);
      // Barely-there paper grain.
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.025})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      const pad = w * 0.08;
      g.fillStyle = COLORS.red;
      g.beginPath();
      g.arc(pad + 22, pad + 22, 22, 0, Math.PI * 2);
      g.fill();
      g.textBaseline = "alphabetic";
      g.fillStyle = "#6f6b63";
      g.font = `400 ${w * 0.042}px "PingFang SC", "Hiragino Sans GB", ${family}, sans-serif`;
      g.fillText("微信", pad, h - pad - w * 0.19);
      g.fillStyle = COLORS.ink;
      g.font = `200 ${w * 0.19}px ${family}, sans-serif`;
      g.fillText(WECHAT, pad - w * 0.012, h - pad);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      setTex(t);
    });
    return () => {
      live = false;
    };
  }, []);
  return tex;
}

export function Card() {
  const m = materials();
  const face = useFace();
  return (
    <group>
      <mesh position-y={T / 2} material={m.ivory} castShadow receiveShadow>
        <boxGeometry args={[CARD_W, T, CARD_D]} />
      </mesh>
      {face && (
        <mesh position-y={T + 0.0015} rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[CARD_W, CARD_D]} />
          <meshPhysicalMaterial map={face} roughness={0.55} clearcoat={0.15} />
        </mesh>
      )}
    </group>
  );
}

// The player's chips, stacked next to the card: one chip per 100.
export function ChipStack({ balance }: { balance: number }) {
  const m = materials();
  const n = Math.max(1, Math.min(30, Math.ceil(balance / 100)));
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[Math.sin(i * 2.3) * 0.012, 0.03 + i * 0.062, Math.cos(i * 1.7) * 0.012]} material={i % 5 === 4 ? m.red : m.ivory} castShadow receiveShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.056, 40]} />
        </mesh>
      ))}
    </group>
  );
}
