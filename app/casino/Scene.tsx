"use client";

import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Card, ChipStack } from "./Card";
import { Dice } from "./Dice";
import { COLORS, materials } from "./materials";
import { Roulette } from "./Roulette";
import { Slots } from "./Slots";

export type Focus = "card" | "roulette" | "dice" | "slots";

export type Rounds = {
  roulette: { id: number; target: number } | null;
  dice: { id: number } | null;
  slots: { id: number; stops: number[] } | null;
};

const TABLE_H = 1;

type Place = { x: number; z: number; s: number; ry?: number };
type Layout = { table: [number, number]; items: Record<Focus | "chips", Place>; overview: { pos: [number, number, number]; look: [number, number, number] } };

// Wide table for landscape screens, long table for phones held upright.
const LANDSCAPE: Layout = {
  table: [15.5, 9.4],
  items: {
    card: { x: -0.2, z: 2.55, s: 1, ry: -0.04 },
    chips: { x: 2.05, z: 2.8, s: 1 },
    roulette: { x: 0, z: -1.6, s: 0.88 },
    dice: { x: -4.7, z: 0.9, s: 0.68 },
    slots: { x: 4.75, z: -0.1, s: 0.6, ry: -0.18 },
  },
  overview: { pos: [0, 13.2, 11.6], look: [0, 0.6, 0.1] },
};

const PORTRAIT: Layout = {
  table: [8.6, 14.2],
  items: {
    card: { x: 0.45, z: 4.1, s: 1, ry: -0.04 },
    chips: { x: -2.35, z: 4.6, s: 1 },
    roulette: { x: 0, z: -3.6, s: 0.86 },
    dice: { x: -2.0, z: 1.0, s: 0.62 },
    slots: { x: 2.05, z: 0.5, s: 0.55, ry: -0.12 },
  },
  overview: { pos: [0, 22.5, 13.5], look: [0, 0.6, 0.15] },
};

// Camera pose for each focused object, in that object's (unscaled) frame. Targets sit
// below/in front of the object so it lands above the control panel.
const POSES: Record<Focus, { pos: [number, number, number]; look: [number, number, number]; spot: number }> = {
  card: { pos: [0, 4.9, 3.5], look: [0, 0, 0.62], spot: 0.2 },
  roulette: { pos: [0, 7.6, 7.6], look: [0, 0.55, 1.0], spot: 0.3 },
  dice: { pos: [0, 7.4, 7.0], look: [0, 0.35, 0.75], spot: 0.26 },
  slots: { pos: [0, 5.0, 10.0], look: [0, 0.6, 0.3], spot: 0.26 },
};

function useLayout() {
  const { size } = useThree();
  return size.width / size.height < 0.85 ? PORTRAIT : LANDSCAPE;
}

const Y = new THREE.Vector3(0, 1, 0);
const tmp = { pos: new THREE.Vector3(), look: new THREE.Vector3(), v: new THREE.Vector3(), o: new THREE.Vector3() };

function toWorld(p: Place, local: readonly number[], out: THREE.Vector3) {
  out.set(local[0], local[1], local[2]).multiplyScalar(p.s);
  out.applyAxisAngle(Y, p.ry ?? 0);
  return out.add(tmp.o.set(p.x, TABLE_H, p.z));
}

function Rig({ focus }: { focus: Focus | null }) {
  const { camera, size } = useThree();
  const layout = useLayout();
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const pointer = useRef({ x: 0, y: 0 });
  const started = useRef(false);

  useFrame((state, dt) => {
    pointer.current.x += (state.pointer.x - pointer.current.x) * 0.04;
    pointer.current.y += (state.pointer.y - pointer.current.y) * 0.04;
    if (focus) {
      const p = layout.items[focus];
      const pose = POSES[focus];
      // Upright screens: pull back so the object still fits the width.
      const aspect = size.width / size.height;
      // The card is wide and flat, so it needs to keep its full width in view.
      const pull = focus === "card" ? Math.max(1, 1.25 / aspect) : aspect < 1 ? Math.min(1.9, (1 / aspect) ** 0.72) : 1;
      toWorld(p, pose.look, tmp.look);
      toWorld(p, pose.pos, tmp.pos).sub(tmp.look).multiplyScalar(pull).add(tmp.look);
    } else {
      tmp.look.set(...layout.overview.look);
      tmp.pos.set(...layout.overview.pos);
    }
    tmp.pos.x += pointer.current.x * 0.3;
    tmp.pos.y += pointer.current.y * 0.18;
    if (!started.current) {
      // First frame: start high above and drift down onto the table.
      started.current = true;
      camera.position.copy(tmp.pos).add(tmp.v.set(0, 7, 5));
      look.current.copy(tmp.look);
    }
    const k = 1 - Math.exp(-dt * 2.1);
    camera.position.lerp(tmp.pos, k);
    look.current.lerp(tmp.look, k);
    camera.lookAt(look.current);
  });
  return null;
}

function Lights({ focus, glow }: { focus: Focus | null; glow: number }) {
  const layout = useLayout();
  const spot = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const level = useRef(0);
  const boost = useRef({ glow: 0, value: 0 });
  const want = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const s = spot.current!;
    const b = boost.current;
    if (glow !== b.glow) {
      b.glow = glow;
      b.value = 1;
    }
    b.value *= Math.exp(-dt * 1.6);
    level.current += (1 - level.current) * (1 - Math.exp(-dt * 0.9));
    const k = 1 - Math.exp(-dt * 2.2);
    let angle: number;
    if (focus) {
      const p = layout.items[focus];
      want.current.set(p.x, 9.4, p.z + 2.4);
      target.position.set(p.x, TABLE_H, p.z);
      angle = POSES[focus].spot * (0.6 + 0.4 * p.s) * 1.25;
    } else {
      want.current.set(0, 15, 3.5);
      target.position.set(0, TABLE_H, 0.2);
      angle = 0.52;
    }
    s.position.lerp(want.current, k);
    s.angle += (angle - s.angle) * k;
    target.updateMatrixWorld();
    s.intensity = (focus ? 300 : 620) * level.current * (1 + 0.7 * b.value);
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <primitive object={target} />
      <spotLight
        ref={spot}
        position={[0, 15, 3.5]}
        target={target}
        angle={0.52}
        penumbra={0.9}
        decay={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        color="#fff4e6"
      />
      {/* Faint cool rim so objects outside the light keep their silhouettes. */}
      <directionalLight position={[0, 6, -10]} intensity={0.3} color="#9fb2c8" />
    </>
  );
}

function Table() {
  const m = materials();
  const layout = useLayout();
  const [w, d] = layout.table;
  const inset = 0.32;
  return (
    <group>
      <RoundedBox args={[w, TABLE_H, d]} radius={0.06} smoothness={3} position-y={TABLE_H / 2} material={m.plinth} castShadow receiveShadow />
      <mesh position-y={TABLE_H + 0.002} rotation-x={-Math.PI / 2} material={m.felt} receiveShadow>
        <planeGeometry args={[w - inset * 2, d - inset * 2]} />
      </mesh>
      {/* Brass inlay around the felt. */}
      {[
        [0, -(d / 2 - inset), w - inset * 2, 0.02],
        [0, d / 2 - inset, w - inset * 2, 0.02],
        [-(w / 2 - inset), 0, 0.02, d - inset * 2],
        [w / 2 - inset, 0, 0.02, d - inset * 2],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} position={[x, TABLE_H + 0.004, z]} material={m.brass}>
          <boxGeometry args={[sx, 0.006, sz]} />
        </mesh>
      ))}
    </group>
  );
}

type ItemProps = {
  id: Focus | "chips";
  focus: Focus | null;
  onPick?: (id: Focus) => void;
  onHover?: (id: Focus | null) => void;
  children: React.ReactNode;
};

// An object on the table: positioned by the layout, lifts slightly under the pointer.
function Item({ id, focus, onPick, onHover, children }: ItemProps) {
  const layout = useLayout();
  const p = layout.items[id];
  const lift = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  const pickable = id !== "chips" && !!onPick && focus !== id;

  useFrame((_, dt) => {
    const g = lift.current!;
    const goal = hovered.current && pickable ? 0.08 : 0;
    g.position.y += (goal - g.position.y) * (1 - Math.exp(-dt * 10));
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!pickable) return;
    e.stopPropagation();
    hovered.current = true;
    document.body.style.cursor = "pointer";
    onHover?.(id as Focus);
  };
  const out = () => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = "";
    onHover?.(null);
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (id === "chips") return;
    e.stopPropagation();
    if (!pickable) return;
    out();
    onPick?.(id as Focus);
  };

  return (
    <group position={[p.x, TABLE_H, p.z]} rotation-y={p.ry ?? 0} scale={p.s} onPointerOver={over} onPointerOut={out} onClick={click}>
      <group ref={lift}>{children}</group>
    </group>
  );
}

type Props = {
  focus: Focus | null;
  glow: number;
  balance: number;
  rounds: Rounds;
  onPick: (id: Focus) => void;
  onHover: (id: Focus | null) => void;
  onBack: () => void;
  onRouletteDone: () => void;
  onDiceDone: (faces: number[]) => void;
  onSlotsDone: () => void;
};

export default function Scene(props: Props) {
  const { focus, onPick, onHover, onBack } = props;
  const item = { focus, onPick, onHover };
  const back = () => focus && onBack();
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      camera={{ fov: 32, near: 0.1, far: 90, position: [0, 20, 18] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      onPointerMissed={back}
    >
      <color attach="background" args={[COLORS.bg]} />
      <fog attach="fog" args={[COLORS.bg, 22, 48]} />
      <Environment resolution={256} environmentIntensity={0.35}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1} color="#c9d6ff" position={[-6, 2, -4]} scale={[4, 6, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffe2b8" position={[6, 3, 3]} scale={2} />
      </Environment>
      <Rig focus={focus} />
      <Lights focus={focus} glow={props.glow} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={back}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#0d0d0f" roughness={0.92} />
      </mesh>
      <group onClick={back}>
        <Table />
      </group>
      <Item id="card" {...item}>
        <Card />
      </Item>
      <Item id="chips" focus={focus}>
        <ChipStack balance={props.balance} />
      </Item>
      <Item id="roulette" {...item}>
        <Roulette round={props.rounds.roulette} onDone={props.onRouletteDone} />
      </Item>
      <Item id="dice" {...item}>
        <Dice round={props.rounds.dice} onDone={props.onDiceDone} />
      </Item>
      <Item id="slots" {...item}>
        <Slots round={props.rounds.slots} onDone={props.onSlotsDone} />
      </Item>
    </Canvas>
  );
}
