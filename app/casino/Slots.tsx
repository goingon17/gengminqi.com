"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COLORS, materials } from "./materials";
import { REEL, type SymbolId } from "./rules";
import { tick } from "./sound";

const CELLS = REEL.length;
const CELL = (Math.PI * 2) / CELLS;
const R = 0.58;
const LEN = 0.6;
const W = 2.6;
const H = 2.3;
const DEPTH = 1.3;
const WIN_W = 2.06;
const WIN_H = 0.95;
const WIN_Y = 1.25;
const REEL_X = [-0.68, 0, 0.68];

function drawSymbol(g: CanvasRenderingContext2D, id: SymbolId, s: number) {
  g.lineJoin = "round";
  switch (id) {
    case "seven":
      g.fillStyle = COLORS.red;
      g.font = `600 ${s * 1.25}px "Times New Roman", Georgia, serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("7", 0, s * 0.06);
      break;
    case "diamond":
      g.fillStyle = COLORS.brass;
      g.beginPath();
      g.moveTo(0, -s * 0.52);
      g.lineTo(s * 0.4, 0);
      g.lineTo(0, s * 0.52);
      g.lineTo(-s * 0.4, 0);
      g.fill();
      break;
    case "square":
      g.fillStyle = COLORS.ink;
      g.fillRect(-s * 0.34, -s * 0.34, s * 0.68, s * 0.68);
      break;
    case "triangle":
      g.fillStyle = COLORS.ink;
      g.beginPath();
      g.moveTo(0, -s * 0.42);
      g.lineTo(s * 0.44, s * 0.36);
      g.lineTo(-s * 0.44, s * 0.36);
      g.fill();
      break;
    case "circle":
      g.fillStyle = COLORS.red;
      g.beginPath();
      g.arc(0, 0, s * 0.36, 0, Math.PI * 2);
      g.fill();
      break;
    case "cross":
      g.strokeStyle = COLORS.ink;
      g.lineWidth = s * 0.09;
      g.beginPath();
      g.moveTo(-s * 0.3, -s * 0.3);
      g.lineTo(s * 0.3, s * 0.3);
      g.moveTo(s * 0.3, -s * 0.3);
      g.lineTo(-s * 0.3, s * 0.3);
      g.stroke();
      break;
  }
}

// Canvas x runs around the reel (u), canvas y runs along its axis (v).
function reelTexture() {
  const cw = 200;
  const c = document.createElement("canvas");
  c.width = cw * CELLS;
  c.height = Math.round((cw * LEN) / (R * CELL));
  const g = c.getContext("2d")!;
  g.fillStyle = COLORS.ivory;
  g.fillRect(0, 0, c.width, c.height);
  REEL.forEach((id, i) => {
    g.save();
    g.translate(cw * (i + 0.5), c.height / 2);
    g.rotate(Math.PI / 2);
    drawSymbol(g, id, cw * 0.62);
    g.restore();
    g.fillStyle = "rgba(20,20,22,.08)";
    g.fillRect(cw * i, 0, 2, c.height);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

type Round = { id: number; stops: number[] } | null;

export function Slots({ round, onDone }: { round: Round; onDone: () => void }) {
  const m = materials();
  const reels = useRef<(THREE.Group | null)[]>([]);
  const tex = useMemo(() => reelTexture(), []);
  const reelMat = useMemo(() => new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.5 }), [tex]);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  const anim = useRef({ start: -1, active: false, from: [0, 0, 0], to: [0, 0, 0], cells: [0, 0, 0] });
  const angles = useRef([CELL * 0.5, CELL * 2.5, CELL * 4.5]);

  useEffect(() => {
    if (!round) return;
    const a = anim.current;
    a.active = true;
    a.start = -1;
    a.from = [...angles.current];
    a.to = round.stops.map((stop, k) => {
      const goal = (stop + 0.5) * CELL;
      const from = angles.current[k];
      let delta = (goal - from) % (Math.PI * 2);
      if (delta < 0) delta += Math.PI * 2;
      return from + delta + Math.PI * 2 * (3 + k * 1.5);
    });
  }, [round]);

  useFrame((state) => {
    const a = anim.current;
    if (a.active) {
      if (a.start < 0) a.start = state.clock.elapsedTime;
      const t = state.clock.elapsedTime - a.start;
      let finished = 0;
      for (let k = 0; k < 3; k++) {
        const dur = 1.5 + k * 0.55;
        const p = Math.min(1, t / dur);
        // Ease out with a small settle past the stop, like a detent catching.
        const c1 = 1.2;
        const e = 1 + (c1 + 1) * (p - 1) ** 3 + c1 * (p - 1) ** 2;
        const angle = a.from[k] + (a.to[k] - a.from[k]) * e;
        const cell = Math.floor(angle / CELL);
        if (cell !== a.cells[k]) {
          a.cells[k] = cell;
          if (p < 1) tick(1800 + k * 300, 0.035, 0.015);
        }
        angles.current[k] = angle;
        if (p >= 1) finished++;
      }
      if (finished === 3) {
        a.active = false;
        tick(1200, 0.08, 0.04);
        setTimeout(() => doneRef.current(), 300);
      }
    }
    reels.current.forEach((g, k) => g && (g.rotation.x = angles.current[k]));
  });

  const side = (W - WIN_W) / 2;
  const bottomH = WIN_Y - WIN_H / 2;
  const topH = H - (WIN_Y + WIN_H / 2);

  return (
    <group>
      <mesh position={[0, bottomH / 2, 0]} material={m.ink} castShadow receiveShadow>
        <boxGeometry args={[W, bottomH, DEPTH]} />
      </mesh>
      <mesh position={[0, H - topH / 2, 0]} material={m.ink} castShadow receiveShadow>
        <boxGeometry args={[W, topH, DEPTH]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WIN_W / 2 + side / 2), WIN_Y, 0]} material={m.ink} castShadow receiveShadow>
          <boxGeometry args={[side, WIN_H, DEPTH]} />
        </mesh>
      ))}
      <mesh position={[0, WIN_Y, -0.45]} material={m.ink}>
        <boxGeometry args={[WIN_W, WIN_H, 0.05]} />
      </mesh>
      {/* Payline markers */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WIN_W / 2 - 0.02), WIN_Y, DEPTH / 2 - 0.05]} material={m.red}>
          <boxGeometry args={[0.04, 0.02, 0.12]} />
        </mesh>
      ))}
      <mesh position={[0, H - 0.32, DEPTH / 2 + 0.002]} material={m.brass}>
        <boxGeometry args={[0.9, 0.012, 0.004]} />
      </mesh>
      {REEL_X.map((x, k) => (
        <group key={k} position={[x, WIN_Y, 0]} ref={(g) => void (reels.current[k] = g)}>
          <mesh rotation-z={Math.PI / 2} material={reelMat} receiveShadow>
            <cylinderGeometry args={[R, R, LEN, 96, 1, false]} />
          </mesh>
        </group>
      ))}
      <pointLight position={[0, WIN_Y + 0.35, 0.9]} intensity={1.6} distance={2.4} decay={2} color="#fff3e0" />
    </group>
  );
}
