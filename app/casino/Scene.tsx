"use client";

import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Dice } from "./Dice";
import { COLORS, materials } from "./materials";
import { Roulette } from "./Roulette";
import { Slots } from "./Slots";

export const SPACING = 8;
const tmp = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const PLINTH_H = 1;

// Camera pose per station, relative to the station centre.
// Targets sit below/in front of each object so it lands in the upper part of the
// screen, clear of the control panel.
const POSES = [
  { pos: [0, 7.6, 7.6], look: [0, 0.55, 1.0] },
  { pos: [0, 7.4, 7.0], look: [0, 0.35, 0.75] },
  { pos: [0, 3.6, 9.4], look: [0, 1.45, 0] },
] as const;

export type Rounds = {
  roulette: { id: number; target: number } | null;
  dice: { id: number } | null;
  slots: { id: number; stops: number[] } | null;
};

type Props = {
  active: number;
  lit: boolean;
  glow: number;
  rounds: Rounds;
  onRouletteDone: () => void;
  onDiceDone: (faces: number[]) => void;
  onSlotsDone: () => void;
};

function Rig({ active, lit }: { active: number; lit: boolean }) {
  const { camera, size } = useThree();
  const look = useRef(new THREE.Vector3(0, 6, -4));
  const pointer = useRef({ x: 0, y: 0 });
  useFrame((state, dt) => {
    const pose = POSES[active];
    const x = (active - 1) * SPACING;
    // Portrait screens: pull back so the object still fits the width.
    const aspect = size.width / size.height;
    const pull = aspect < 1 ? Math.min(1.9, (1 / aspect) ** 0.72) : 1;
    pointer.current.x += (state.pointer.x - pointer.current.x) * 0.04;
    pointer.current.y += (state.pointer.y - pointer.current.y) * 0.04;
    if (lit) {
      tmp.look.set(x + pose.look[0], pose.look[1], pose.look[2]);
      tmp.pos.set(pose.pos[0], pose.pos[1] - pose.look[1], pose.pos[2] - pose.look[2]).multiplyScalar(pull).add(tmp.look);
      tmp.pos.x += pointer.current.x * 0.35;
      tmp.pos.y += pointer.current.y * 0.2;
    } else {
      tmp.look.set(0, 1.5, 0);
      tmp.pos.set(0, 10, 18);
    }
    const k = 1 - Math.exp(-dt * (lit ? 2.2 : 8));
    camera.position.lerp(tmp.pos, k);
    look.current.lerp(tmp.look, k);
    camera.lookAt(look.current);
  });
  return null;
}

const beamVertex = `
varying vec3 vNormal;
varying vec3 vView;
varying float vAlong;
void main() {
  vAlong = uv.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const beamFragment = `
uniform float uLevel;
varying vec3 vNormal;
varying vec3 vView;
varying float vAlong;
void main() {
  float facing = pow(abs(dot(vNormal, vView)), 2.2);
  float fade = pow(vAlong, 1.6) * smoothstep(0.0, 0.25, 1.0 - vAlong + 0.02);
  gl_FragColor = vec4(vec3(1.0, 0.94, 0.86), facing * fade * 0.1 * uLevel);
}`;

const UP = new THREE.Vector3(0, 1, 0);
const LIGHT_Y = 9.5;
const LIGHT_Z = 2.5;

function Lights({ active, lit, glow }: { active: number; lit: boolean; glow: number }) {
  const spot = useRef<THREE.SpotLight>(null);
  const fill = useRef<THREE.AmbientLight>(null);
  const beam = useRef<THREE.Mesh>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const level = useRef(0);
  const boost = useRef(0);
  const uniforms = useMemo(() => ({ uLevel: { value: 0 } }), []);
  const beamGeo = useMemo(() => {
    const len = Math.hypot(LIGHT_Y - PLINTH_H, LIGHT_Z);
    const g = new THREE.ConeGeometry(Math.tan(0.36) * len * 0.82, len, 64, 1, true);
    g.translate(0, -len / 2, 0); // apex at the origin (the lamp)
    return g;
  }, []);

  useEffect(() => {
    if (glow) boost.current = 1;
  }, [glow]);

  useFrame((_, dt) => {
    const s = spot.current!;
    const x = (active - 1) * SPACING;
    level.current += ((lit ? 1 : 0) - level.current) * (1 - Math.exp(-dt * 1.2));
    boost.current *= Math.exp(-dt * 1.6);
    s.position.x += (x - s.position.x) * (1 - Math.exp(-dt * 2.4));
    target.position.set(s.position.x, PLINTH_H, 0);
    target.updateMatrixWorld();
    s.intensity = 260 * level.current * (1 + 0.7 * boost.current);
    fill.current!.intensity = 0.05 + 0.1 * level.current;
    const b = beam.current!;
    b.position.copy(s.position);
    const dir = s.position.clone().sub(target.position).normalize();
    b.quaternion.setFromUnitVectors(UP, dir);
    (b.material as THREE.ShaderMaterial).uniforms.uLevel.value = level.current * (1 + 0.8 * boost.current);
  });

  return (
    <>
      <ambientLight ref={fill} intensity={0.05} />
      <primitive object={target} />
      <spotLight
        ref={spot}
        position={[-SPACING, LIGHT_Y, LIGHT_Z]}
        target={target}
        angle={0.36}
        penumbra={0.85}
        decay={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        color="#fff4e6"
      />
      <mesh ref={beam} geometry={beamGeo} renderOrder={10}>
        <shaderMaterial
          vertexShader={beamVertex}
          fragmentShader={beamFragment}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Faint cool rim so the dark tables keep their silhouettes. */}
      <directionalLight position={[0, 6, -10]} intensity={0.25} color="#9fb2c8" />
    </>
  );
}

function Station({ index, children }: { index: number; children: React.ReactNode }) {
  const m = materials();
  return (
    <group position={[(index - 1) * SPACING, 0, 0]}>
      <RoundedBox args={[4.8, PLINTH_H, 4.8]} radius={0.04} smoothness={3} position-y={PLINTH_H / 2} material={m.plinth} castShadow receiveShadow />
      <group position-y={PLINTH_H}>{children}</group>
    </group>
  );
}

export default function Scene(props: Props) {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      camera={{ fov: 32, near: 0.1, far: 80, position: [0, 10, 18] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <color attach="background" args={[COLORS.bg]} />
      <fog attach="fog" args={[COLORS.bg, 14, 34]} />
      <Environment resolution={256} environmentIntensity={0.35}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1} color="#c9d6ff" position={[-6, 2, -4]} scale={[4, 6, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffe2b8" position={[6, 3, 3]} scale={2} />
      </Environment>
      <Rig active={props.active} lit={props.lit} />
      <Lights active={props.active} lit={props.lit} glow={props.glow} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#0d0d0f" roughness={0.92} />
      </mesh>
      <Station index={0}>
        <Roulette round={props.rounds.roulette} onDone={props.onRouletteDone} />
      </Station>
      <Station index={1}>
        <Dice round={props.rounds.dice} onDone={props.onDiceDone} />
      </Station>
      <Station index={2}>
        <group position-z={-0.3}>
          <Slots round={props.rounds.slots} onDone={props.onSlotsDone} />
        </group>
      </Station>
    </Canvas>
  );
}
