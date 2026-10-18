"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COLORS, materials } from "./materials";
import { pocketColor, WHEEL } from "./rules";
import { tick } from "./sound";

const N = WHEEL.length;
const STEP = (Math.PI * 2) / N;
const R_IN = 1.02;
const R_OUT = 1.62;
const R_POCKET = 1.3;
const R_TRACK = 1.86;
const DURATION = 7.2;

// Pocket i is centred on local angle i*STEP, measured as atan2(z, x).
function ringTexture() {
  const size = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const mid = size / 2;
  const k = mid / R_OUT;
  const fill = { red: COLORS.red, black: "#17171a", green: COLORS.green };
  for (let i = 0; i < N; i++) {
    const a0 = i * STEP - STEP / 2;
    const a1 = a0 + STEP;
    g.beginPath();
    g.arc(mid, mid, R_OUT * k, a0, a1);
    g.arc(mid, mid, R_IN * k, a1, a0, true);
    g.closePath();
    g.fillStyle = fill[pocketColor(WHEEL[i])];
    g.fill();
    // Numbers on the outer band, reading outward.
    g.save();
    g.translate(mid, mid);
    // Tops of the numbers point toward the centre, as on a real wheel.
    g.rotate(i * STEP - Math.PI / 2);
    g.fillStyle = COLORS.ivory;
    g.font = `500 ${Math.round(0.1 * k)}px ui-sans-serif, -apple-system, "Helvetica Neue", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(WHEEL[i]), 0, 1.535 * k);
    g.restore();
  }
  // Thin ivory rings separating number band and pockets.
  g.strokeStyle = "rgba(235,230,220,.55)";
  g.lineWidth = 3;
  for (const r of [1.45, R_IN + 0.004, R_OUT - 0.004]) {
    g.beginPath();
    g.arc(mid, mid, r * k, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function bowlGeometry() {
  const pts = [
    [0.4, 0],
    [2.3, 0],
    [2.32, 0.42],
    [2.26, 0.5],
    [2.12, 0.47],
    [1.95, 0.4],
    [1.7, 0.3],
    [1.64, 0.22],
    [1.6, 0.05],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 128);
}

function coneGeometry() {
  const pts = [
    [R_IN + 0.02, 0.2],
    [0.95, 0.3],
    [0.7, 0.4],
    [0.35, 0.47],
    [0.12, 0.5],
    [0.0, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 96);
}

type Round = { id: number; target: number } | null;

export function Roulette({ round, onDone }: { round: Round; onDone: () => void }) {
  const m = materials();
  const rotor = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => ringTexture(), []);
  const bowl = useMemo(() => bowlGeometry(), []);
  const cone = useMemo(() => coneGeometry(), []);
  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }), [tex]);

  const anim = useRef({ start: -1, wheel0: 0, from: 0, target: 0, speed: 0.12, lastFret: 0, done: true });
  const rest = useRef(0); // pocket index the ball sits in
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!round) return;
    const a = anim.current;
    a.start = -1;
    a.target = WHEEL.indexOf(round.target);
    a.done = false;
  }, [round]);

  useFrame((state, dt) => {
    const a = anim.current;
    const r = rotor.current!;
    const b = ball.current!;
    const now = state.clock.elapsedTime;

    if (!a.done && a.start < 0) {
      a.start = now;
      a.wheel0 = r.rotation.y;
      // Relative ball travel: four-plus turns against the wheel (the rotor turns toward
      // negative world angles), starting from the current pocket, ending in the target.
      const base = rest.current * STEP;
      const goal = a.target * STEP;
      let delta = (goal - base) % (Math.PI * 2);
      if (delta < 0) delta += Math.PI * 2;
      a.from = goal - delta - Math.PI * 2 * 4;
    }

    let phi = rest.current * STEP;
    let radius = R_POCKET;
    let y = 0.235;

    if (!a.done && a.start >= 0) {
      const t = now - a.start;
      const p = Math.min(1, t / DURATION);
      // Wheel: quick spin-up, slow exponential decay.
      a.speed = 0.12 + 2.6 * Math.exp(-t / 3.2) * Math.min(1, t * 2.5);
      const e = 1 - (1 - p) ** 3;
      phi = a.from + (a.target * STEP - a.from) * e;
      if (p < 0.5) {
        radius = R_TRACK;
        y = 0.42;
      } else {
        const q = Math.min(1, (p - 0.5) / 0.38);
        const bounce = Math.abs(Math.sin(q * 22)) * 0.07 * (1 - q) ** 1.5;
        radius = R_TRACK + (R_POCKET - R_TRACK) * (q * q * (3 - 2 * q)) + bounce * 2;
        y = 0.42 + (0.235 - 0.42) * q + bounce;
        const fret = Math.floor((phi + STEP / 2) / STEP);
        if (radius < R_OUT && fret !== a.lastFret) {
          a.lastFret = fret;
          tick(2600 + Math.random() * 1200, 0.05 * (1 - q * 0.6));
        }
      }
      if (p >= 1) {
        a.done = true;
        rest.current = a.target;
        phi = a.target * STEP;
        setTimeout(() => doneRef.current(), 450);
      }
    } else {
      a.speed += (0.12 - a.speed) * Math.min(1, dt * 0.6);
    }

    r.rotation.y += a.speed * dt;
    b.position.set(radius * Math.cos(phi), y, radius * Math.sin(phi));
  });

  return (
    <group>
      <mesh geometry={bowl} material={m.ink} castShadow receiveShadow />
      <mesh position-y={0.42} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.26, 2.33, 128]} />
        <primitive object={m.brass} attach="material" />
      </mesh>
      <group ref={rotor}>
        <mesh position-y={0.2} rotation-x={-Math.PI / 2} material={ringMat} receiveShadow>
          <ringGeometry args={[R_IN, R_OUT, 148, 1]} />
        </mesh>
        {WHEEL.map((_, i) => {
          const a = i * STEP + STEP / 2;
          return (
            <mesh key={i} position={[1.25 * Math.cos(a), 0.222, 1.25 * Math.sin(a)]} rotation-y={-a} material={m.brass}>
              <boxGeometry args={[0.36, 0.045, 0.01]} />
            </mesh>
          );
        })}
        <mesh geometry={cone} material={m.ivory} castShadow receiveShadow />
        <mesh position-y={0.62} material={m.brass} castShadow>
          <cylinderGeometry args={[0.035, 0.05, 0.28, 24]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation-y={(i * Math.PI) / 2} position-y={0.7}>
            <mesh position-x={0.2} rotation-z={Math.PI / 2} material={m.brass} castShadow>
              <cylinderGeometry args={[0.014, 0.014, 0.4, 12]} />
            </mesh>
            <mesh position-x={0.4} material={m.brass}>
              <sphereGeometry args={[0.035, 16, 12]} />
            </mesh>
          </group>
        ))}
        <mesh ref={ball} castShadow>
          <sphereGeometry args={[0.058, 32, 24]} />
          <meshPhysicalMaterial color="#f6f3ee" roughness={0.12} clearcoat={1} />
        </mesh>
      </group>
    </group>
  );
}
