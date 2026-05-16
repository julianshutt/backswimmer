import * as THREE from "three";

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sharedDodecaGeom = new THREE.DodecahedronGeometry(1, 0);
sharedDodecaGeom.computeVertexNormals();

const STONE_MATERIALS = Object.freeze([
  new THREE.MeshStandardMaterial({ color: 0x595c64, roughness: 0.94, metalness: 0.04 }),
  new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.92, metalness: 0.07 }),
  new THREE.MeshStandardMaterial({ color: 0x505648, roughness: 0.9, metalness: 0.03 }),
  new THREE.MeshStandardMaterial({ color: 0x534b45, roughness: 0.93, metalness: 0.04 }),
  new THREE.MeshStandardMaterial({ color: 0x474c52, roughness: 0.95, metalness: 0.05 }),
]);

/**
 * Scatter of low-poly submerged rocks on the pond bottom (& rising into murky water column).
 * One shared geometry, few materials — intentionally cheap draws.
 *
 * @param {object} track normalized merged track (`mergeTrackDefaults`)
 * @param {THREE.MeshStandardMaterial | null | undefined} texturedRockMat optional PBR material (textures applied per {@link rockTextures.js}); meshes clone it so UV rotation per rock still varies look.
 * @returns {{ root: THREE.Group; xzDisks: { x: number; z: number; radius: number }[] }}
 */
export function createPondStoneBed(track, seed = 0xde701, texturedRockMat = null) {
  const rand = mulberry32(seed >>> 0);
  const root = new THREE.Group();
  root.name = "pondStoneBed";

  /** @type {{ x: number; z: number; radius: number }[]} */
  const xzDisks = [];

  const half = 258;

  /** @type {{ x: number; z: number; r: number }[]} */
  const exclude = [];
  for (const l of track.lilies ?? []) {
    exclude.push({ x: l.position[0], z: l.position[1], r: (l.radius ?? 5) + 14 });
  }
  const sp = track.spawn?.position;
  if (Array.isArray(sp) && sp.length >= 3) {
    exclude.push({ x: sp[0], z: sp[2], r: 38 });
  }
  for (const cp of track.checkpoints ?? []) {
    const p = cp.position;
    if (!Array.isArray(p) || p.length < 3) continue;
    exclude.push({ x: p[0], z: p[2], r: (cp.radius ?? 10) + 22 });
  }
  for (const b of track.bubbles ?? []) {
    exclude.push({ x: b.position[0], z: b.position[1], r: ((b.radius ?? 5) * 2 || 10) + 12 });
  }
  for (const f of track.fish ?? []) {
    const fx = f.position[0];
    const fz = f.position[1];
    exclude.push({
      x: fx,
      z: fz,
      r: Math.max(f.length ?? 6, f.width ?? 2) + 14,
    });
  }

  function clearance(x, z) {
    let m = Infinity;
    for (const e of exclude) {
      const dx = x - e.x;
      const dz = z - e.z;
      m = Math.min(m, Math.hypot(dx, dz) - e.r);
    }
    return m;
  }

  const maxRocks = 86;
  let placed = 0;
  let tries = 0;
  while (placed < maxRocks && tries < 22000) {
    tries += 1;
    const x = (rand() * 2 - 1) * (half - 46);
    const z = (rand() * 2 - 1) * (half - 46);
    if (clearance(x, z) < 3.1) continue;

    const mesh = new THREE.Mesh(
      sharedDodecaGeom,
      texturedRockMat ?? STONE_MATERIALS[(placed % 997) % STONE_MATERIALS.length]
    );
    const sx = THREE.MathUtils.lerp(1.05, 4.1, rand());
    const sy = THREE.MathUtils.lerp(0.42, 1.35, rand()) * sx;
    const sz = THREE.MathUtils.lerp(0.72, 1.18, rand()) * sx;
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);

    /** Rest on muddy floor (~y = -2); bias toward submerged with a few slabs higher in the water column. */
    mesh.position.set(
      x,
      THREE.MathUtils.lerp(-2.06, -0.88, Math.pow(rand(), 1.55)) + sy * 0.58,
      z
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);

    /**
     * Tight footprint: unit dodeca in XZ seldom exceeds hypot(s×,s×); small margin only.
     */
    const xzR = Math.hypot(sx, sz) * 1.035 + 0.055;
    xzDisks.push({ x, z, radius: xzR });
    placed += 1;
  }

  return { root, xzDisks };
}
