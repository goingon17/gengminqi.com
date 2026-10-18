import * as THREE from "three";

// One small palette for the whole room: ivory ceramic, soft black, brass, vermilion.
export const COLORS = {
  bg: "#070708",
  ivory: "#ebe6dc",
  ink: "#141416",
  brass: "#b79a62",
  red: "#b5352a",
  green: "#2e5a48",
};

let cache: ReturnType<typeof make> | null = null;

function make() {
  return {
    ivory: new THREE.MeshPhysicalMaterial({ color: COLORS.ivory, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    ink: new THREE.MeshStandardMaterial({ color: COLORS.ink, roughness: 0.62, metalness: 0.1 }),
    plinth: new THREE.MeshStandardMaterial({ color: "#121214", roughness: 0.85 }),
    brass: new THREE.MeshStandardMaterial({ color: COLORS.brass, roughness: 0.28, metalness: 1 }),
    red: new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.4 }),
    pip: new THREE.MeshStandardMaterial({ color: "#16161a", roughness: 0.5 }),
    felt: new THREE.MeshStandardMaterial({ color: "#1b2621", roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transmission: 0, transparent: true, opacity: 0.08 }),
  };
}

export function materials() {
  cache ??= make();
  return cache;
}
