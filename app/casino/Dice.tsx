"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as CANNON from "cannon-es";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { materials } from "./materials";
import { random } from "./rules";
import { tick } from "./sound";

const S = 0.42; // die edge
const HALF = 1.45; // tray inner half-size
const D = 0.105; // pip spacing

// Face value -> local outward normal. Opposite faces sum to 7.
const FACES: [number, THREE.Vector3][] = [
  [1, new THREE.Vector3(0, 1, 0)],
  [6, new THREE.Vector3(0, -1, 0)],
  [2, new THREE.Vector3(1, 0, 0)],
  [5, new THREE.Vector3(-1, 0, 0)],
  [3, new THREE.Vector3(0, 0, 1)],
  [4, new THREE.Vector3(0, 0, -1)],
];

const LAYOUT: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

function pips() {
  const out: { pos: [number, number, number]; rot: [number, number, number]; red: boolean; big: boolean }[] = [];
  const h = S / 2 - 0.003;
  for (const [value, n] of FACES) {
    for (const [u, v] of LAYOUT[value]) {
      const a = u * D;
      const b = v * D;
      let pos: [number, number, number];
      let rot: [number, number, number] = [0, 0, 0];
      if (n.y) pos = [a, n.y * h, b];
      else if (n.x) {
        pos = [n.x * h, a, b];
        rot = [0, 0, Math.PI / 2];
      } else {
        pos = [a, b, n.z * h];
        rot = [Math.PI / 2, 0, 0];
      }
      // Chinese dice: the one and the four are red.
      out.push({ pos, rot, red: value === 1 || value === 4, big: value === 1 });
    }
  }
  return out;
}

export function readTop(q: THREE.Quaternion) {
  let best = 1;
  let max = -Infinity;
  const v = new THREE.Vector3();
  for (const [value, n] of FACES) {
    v.copy(n).applyQuaternion(q);
    if (v.y > max) {
      max = v.y;
      best = value;
    }
  }
  return best;
}

type Round = { id: number } | null;

export function Dice({ round, onDone }: { round: Round; onDone: (faces: number[]) => void }) {
  const m = materials();
  const meshes = useRef<(THREE.Group | null)[]>([]);
  const layout = useMemo(() => pips(), []);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const sim = useMemo(() => {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
    world.allowSleep = true;
    const dieMat = new CANNON.Material("die");
    const floorMat = new CANNON.Material("floor");
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, floorMat, { friction: 0.25, restitution: 0.32 }));
    world.addContactMaterial(new CANNON.ContactMaterial(dieMat, dieMat, { friction: 0.2, restitution: 0.3 }));
    const plane = (pos: CANNON.Vec3, axis: CANNON.Vec3, angle: number) => {
      const b = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
      b.position.copy(pos);
      b.quaternion.setFromAxisAngle(axis, angle);
      world.addBody(b);
    };
    plane(new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    plane(new CANNON.Vec3(-HALF, 0, 0), new CANNON.Vec3(0, 1, 0), Math.PI / 2);
    plane(new CANNON.Vec3(HALF, 0, 0), new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
    plane(new CANNON.Vec3(0, 0, -HALF), new CANNON.Vec3(0, 1, 0), 0);
    plane(new CANNON.Vec3(0, 0, HALF), new CANNON.Vec3(0, 1, 0), Math.PI);
    const bodies = [-0.6, 0, 0.6].map((x, i) => {
      const b = new CANNON.Body({ mass: 1, material: dieMat, shape: new CANNON.Box(new CANNON.Vec3(S / 2, S / 2, S / 2)) });
      b.sleepSpeedLimit = 0.08;
      b.sleepTimeLimit = 0.4;
      b.position.set(x, S / 2, i === 1 ? 0.35 : -0.15);
      b.quaternion.setFromEuler(0, x * 2, 0);
      b.addEventListener("collide", (e: { contact: CANNON.ContactEquation }) => {
        const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (impact > 1.2) tick(900 + Math.random() * 900, Math.min(0.14, impact * 0.012), 0.03);
      });
      world.addBody(b);
      return b;
    });
    return { world, bodies };
  }, []);
  const roll = useRef({ rolling: false, start: 0 });

  useEffect(() => {
    if (!round) return;
    roll.current = { rolling: true, start: -1 };
    sim.bodies.forEach((b, i) => {
      b.wakeUp();
      b.position.set(-1.1 + random() * 0.3, 1.4 + i * 0.5, 1.0 - i * 0.55 + random() * 0.2);
      b.quaternion.setFromEuler(random() * 6.3, random() * 6.3, random() * 6.3);
      b.velocity.set(4 + random() * 3, -1 - random() * 2, -2.5 + random() * 3);
      b.angularVelocity.set((random() - 0.5) * 30, (random() - 0.5) * 30, (random() - 0.5) * 30);
    });
  }, [round, sim]);

  useFrame((state, dt) => {
    sim.world.fixedStep(1 / 60, Math.min(dt, 1 / 20));
    sim.bodies.forEach((b, i) => {
      const g = meshes.current[i];
      if (!g) return;
      g.position.set(b.position.x, b.position.y, b.position.z);
      g.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    });
    const r = roll.current;
    if (!r.rolling) return;
    if (r.start < 0) r.start = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - r.start;
    const still = sim.bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING || (b.velocity.length() < 0.05 && b.angularVelocity.length() < 0.05));
    if ((still && t > 0.8) || t > 6) {
      r.rolling = false;
      const faces = sim.bodies.map((b) => readTop(new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)));
      setTimeout(() => doneRef.current(faces), 350);
    }
  });

  const pipGeo = useMemo(() => new THREE.CylinderGeometry(0.036, 0.036, 0.008, 24), []);
  const bigPipGeo = useMemo(() => new THREE.CylinderGeometry(0.062, 0.062, 0.008, 32), []);

  return (
    <group>
      {/* Tray: felt floor framed by a thin brass rim. */}
      <mesh position-y={0.005} rotation-x={-Math.PI / 2} material={m.felt} receiveShadow>
        <planeGeometry args={[HALF * 2, HALF * 2]} />
      </mesh>
      {[
        [0, -HALF - 0.04, HALF * 2 + 0.16, 0.08],
        [0, HALF + 0.04, HALF * 2 + 0.16, 0.08],
        [-HALF - 0.04, 0, 0.08, HALF * 2],
        [HALF + 0.04, 0, 0.08, HALF * 2],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.07, z]} material={m.brass} castShadow receiveShadow>
          <boxGeometry args={[w, 0.14, d]} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(g) => void (meshes.current[i] = g)}>
          <RoundedBox args={[S, S, S]} radius={0.065} smoothness={5} material={m.ivory} castShadow receiveShadow />
          {layout.map((p, j) => (
            <mesh key={j} position={p.pos} rotation={p.rot} geometry={p.big ? bigPipGeo : pipGeo} material={p.red ? m.red : m.pip} />
          ))}
        </group>
      ))}
    </group>
  );
}
