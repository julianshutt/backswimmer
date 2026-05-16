import * as THREE from "three";
import { waterSurfaceDisplacementY } from "./waterFX.js";

/** Mulberry32 PRNG → deterministic clusters per seed. */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @typedef {{ x: number; z: number; vx: number; vz: number; str: number }} ReedMover */

/**
 * Tapered vertical blade: wide at the waterline, narrow at the tip (8-vertex frustum).
 * @param {number} h
 * @param {number} baseW
 * @param {number} tipW
 * @param {number} depth
 */
function createTaperedBladeGeometry(h, baseW, tipW, depth) {
  const bw = baseW * 0.5;
  const tw = tipW * 0.5;
  const dd = depth * 0.5;

  const p = new Float32Array([
    -bw, 0, -dd,
    bw, 0, -dd,
    bw, 0, dd,
    -bw, 0, dd,
    -tw, h, -dd,
    tw, h, -dd,
    tw, h, dd,
    -tw, h, dd,
  ]);

  const idx = [
    4, 5, 6, 4, 6, 7,
    0, 2, 1, 0, 3, 2,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(p, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();

  const uvs = new Float32Array(8 * 2);
  const hScale = Math.max(h, 1e-4);
  for (let vi = 0; vi < 8; vi += 1) {
    const vx = p[vi * 3];
    const vy = p[vi * 3 + 1];
    const vz = p[vi * 3 + 2];
    let u = Math.atan2(vz, vx) / (Math.PI * 2) + 0.5;
    if (u < 0) u += 1;
    const v = THREE.MathUtils.clamp(vy / hScale, 0, 1);
    uvs[vi * 2] = u;
    uvs[vi * 2 + 1] = v;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

  return geom;
}

/** Coarse quantized geometry keys — huge cut in unique meshes & GPU uploads. */
const _bladeGeomCache = new Map();
function pooledBladeGeometry(h, baseW, tipW, depth) {
  const qh = Math.round(h * 4.75) / 4.75;
  const qb = Math.round(baseW * 92) / 92;
  const qt = Math.round(tipW * 92) / 92;
  const qd = Math.round(depth * 92) / 92;
  const key = `${qh}:${qb}:${qt}:${qd}`;
  let geom = _bladeGeomCache.get(key);
  if (!geom) {
    geom = createTaperedBladeGeometry(qh, qb, qt, qd);
    _bladeGeomCache.set(key, geom);
  }
  return geom;
}

const _qtyCol = new THREE.Color();
/** Quantized reed materials → many stems share one `MeshStandardMaterial`. */
const _reedMatCache = new Map();
function pooledReedMaterial(col) {
  _qtyCol.copy(col);
  const q = (v) => Math.round(Math.min(1, Math.max(0, v)) * 30) / 30;
  _qtyCol.r = q(_qtyCol.r);
  _qtyCol.g = q(_qtyCol.g);
  _qtyCol.b = q(_qtyCol.b);
  const key =
    ((Math.round(_qtyCol.r * 255) & 255) << 16) |
    ((Math.round(_qtyCol.g * 255) & 255) << 8) |
    (Math.round(_qtyCol.b * 255) & 255);
  let mat = _reedMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: _qtyCol.clone(),
      roughness: 0.87,
      metalness: 0.04,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    _reedMatCache.set(key, mat);
  }
  return mat;
}

/** Tinted clones of textured grass (~12×8 keys) — share maps with base; disposable per reed teardown. */
const _reedGrassTintCache = new Map();
const _grassTintHslScratch = { h: 0, s: 0, l: 0 };
const _grassTintColScratch = new THREE.Color();

/**
 * Same PBR textures as `baseGrass`, quantized per-stem color variation (height + RNG).
 *
 * @param {THREE.MeshStandardMaterial} baseGrass
 * @param {(n:number)=>number} rand
 * @param {number} bladeH
 * @param {number} hLo cluster min height
 * @param {number} hHi cluster max height
 * @param {'fill' | 'dense' | 'curtain' | 'edgeFill'} profile
 */
function reedGrassTintedMaterial(baseGrass, rand, bladeH, hLo, hHi, profile) {
  const span = Math.max(hHi - hLo, 1e-5);
  const hn = THREE.MathUtils.clamp((bladeH - hLo) / span, 0, 1);
  const hb = Math.min(11, Math.floor(hn * 12));
  const rb = Math.floor(rand() * 8);
  const key = hb * 8 + rb;

  let m = _reedGrassTintCache.get(key);
  if (!m) {
    m = baseGrass.clone();
    m.name = `reedGrassTint_${hb}_${rb}`;
    delete m.userData.skipDisposeInSceneTraverse;

    baseGrass.color.getHSL(_grassTintHslScratch);
    const hsl = _grassTintHslScratch;
    const hnBucket = hb / 11;

    hsl.l +=
      THREE.MathUtils.lerp(-0.042, 0.168, hnBucket) +
      (rb / 7 - 0.5) * 0.11 +
      0.038;
    hsl.s +=
      THREE.MathUtils.lerp(0.014, -0.026, hnBucket * 0.55) +
      (((rb + hb) % 5) / 5 - 0.5) * 0.06;
    hsl.h +=
      ((((hb + rb * 3) % 17) / 17) - 0.5) * 0.026;

    if (profile === "curtain") {
      hsl.l += 0.022;
      hsl.s *= 1.04;
    } else if (profile === "edgeFill") {
      hsl.l += 0.018;
    } else if (profile === "dense") {
      hsl.h += 0.006;
      hsl.l += 0.008;
    }

    hsl.l = THREE.MathUtils.clamp(hsl.l, 0.22, 0.72);
    hsl.s = THREE.MathUtils.clamp(hsl.s, 0.14, 0.58);

    _grassTintColScratch.setHSL(hsl.h, hsl.s, hsl.l);
    m.color.copy(_grassTintColScratch);

    _reedGrassTintCache.set(key, m);
  }
  return m;
}

/** [hue, saturation, lightness] presets — marsh greens, olive, wet straw, brown stem. */
const REED_COLOR_SETS = [
  [0.29, 0.55, 0.3],
  [0.33, 0.48, 0.28],
  [0.26, 0.42, 0.26],
  [0.22, 0.38, 0.3],
  [0.36, 0.35, 0.34],
  [0.18, 0.32, 0.35],
  [0.31, 0.22, 0.36],
];

function pickReedColor(rand, profile) {
  const set = REED_COLOR_SETS[Math.floor(rand() * REED_COLOR_SETS.length)];
  const h = THREE.MathUtils.clamp(set[0] + (rand() - 0.5) * 0.05, 0.05, 0.45);
  let s = THREE.MathUtils.clamp(set[1] + (rand() - 0.5) * 0.12, 0.12, 0.62);
  let l = THREE.MathUtils.clamp(set[2] + (rand() - 0.5) * 0.1, 0.15, 0.5);
  if (profile === "curtain") {
    s *= 1.05;
    l *= 0.97;
  }
  if (rand() > 0.55) l = THREE.MathUtils.clamp(l + rand() * 0.08, 0.18, 0.52);

  return new THREE.Color().setHSL(h, s, l);
}

/**
 * @param {'fill' | 'dense' | 'curtain' | 'edgeFill'} profile
 * @param {(x:number,z:number)=>boolean} okHere
 * @param {THREE.MeshStandardMaterial | null} [grassShared] one material for every stem when set (shared maps)
 */
function tryAddCluster(root, clusters, rand, cx, cz, okHere, profile, grassShared) {
  if (!okHere(cx, cz)) return false;

  const cg = new THREE.Group();
  cg.position.set(cx, 0.32, cz);
  root.add(cg);

  let nStemLo;
  let nStemHi;
  let spread;
  let hLo;
  let hHi;
  let wLo;
  let wHi;
  let dLo;
  let dHi;
  let tipFracLo;
  let tipFracHi;

  if (profile === "curtain") {
    nStemLo = 13;
    nStemHi = 27;
    spread = THREE.MathUtils.lerp(4.75, 10.6, rand());
    hLo = 4.85;
    hHi = 12.6;
    wLo = 0.092;
    wHi = 0.248;
    dLo = 0.068;
    dHi = 0.188;
    tipFracLo = 0.045;
    tipFracHi = 0.128;
  } else if (profile === "edgeFill") {
    nStemLo = 8;
    nStemHi = 18;
    spread = THREE.MathUtils.lerp(2.65, 5.95, rand());
    hLo = 2.55;
    hHi = 7.85;
    wLo = 0.068;
    wHi = 0.185;
    dLo = 0.048;
    dHi = 0.128;
    tipFracLo = 0.055;
    tipFracHi = 0.158;
  } else if (profile === "dense") {
    nStemLo = 9;
    nStemHi = 22;
    spread = THREE.MathUtils.lerp(1.88, 3.18, rand());
    hLo = 1.05;
    hHi = 3.92;
    wLo = 0.056;
    wHi = 0.132;
    dLo = 0.038;
    dHi = 0.095;
    tipFracLo = 0.072;
    tipFracHi = 0.22;
  } else {
    nStemLo = 7;
    nStemHi = 16;
    spread = THREE.MathUtils.lerp(1.78, 2.58, rand());
    hLo = 0.88;
    hHi = 3.18;
    wLo = 0.048;
    wHi = 0.108;
    dLo = 0.032;
    dHi = 0.078;
    tipFracLo = 0.078;
    tipFracHi = 0.24;
  }

  const nStems = nStemLo + Math.floor(rand() * (nStemHi - nStemLo + 1));
  const stems = [];

  let hideR;
  if (profile === "curtain") hideR = spread * 0.52 + 3.65;
  else if (profile === "edgeFill") hideR = spread * 0.5 + 2.55;
  else if (profile === "dense") hideR = spread * 0.55 + 2.05;
  else hideR = spread * 0.52 + 1.78;

  for (let s = 0; s < nStems; s += 1) {
    const ox = (rand() - 0.5) * spread;
    const oz = (rand() - 0.5) * spread;
    const h = THREE.MathUtils.lerp(hLo, hHi, rand());
    const baseW = THREE.MathUtils.lerp(wLo, wHi, rand());
    const depth = THREE.MathUtils.lerp(dLo, dHi, rand());
    const tipW = baseW * THREE.MathUtils.lerp(tipFracLo, tipFracHi, rand());

    const geom = pooledBladeGeometry(h, baseW, tipW, depth);
    const mat = grassShared
      ? reedGrassTintedMaterial(grassShared, rand, h, hLo, hHi, profile)
      : pooledReedMaterial(pickReedColor(rand, profile));
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(ox, 0, oz);
    mesh.rotation.y = rand() * Math.PI * 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    cg.add(mesh);

    stems.push({
      mesh,
      tiltX: 0,
      tiltZ: 0,
      wx: 0,
      wz: 0,
      baseRx: (rand() - 0.5) * (profile === "curtain" || profile === "edgeFill" ? 0.048 : 0.085),
      baseRz: (rand() - 0.5) * (profile === "curtain" || profile === "edgeFill" ? 0.04 : 0.075),
      swayPh: rand() * Math.PI * 2,
      swayHz: THREE.MathUtils.lerp(
        profile === "curtain" || profile === "edgeFill" ? 0.42 : 0.54,
        1.08,
        rand()
      ),
      idleMul:
        profile === "curtain" ? 1.12 : profile === "edgeFill" ? 1.08 : profile === "dense" ? 1.04 : 1,
      windPh: rand() * Math.PI * 2,
      windHz: THREE.MathUtils.lerp(0.35, 0.92, rand()),
      rippleGain: THREE.MathUtils.lerp(0.85, 1.45, rand()),
    });
  }

  clusters.push({ group: cg, stems, hideX: cx, hideZ: cz, hideR });
  return true;
}

/**
 * Deterministic stitched edge grid to remove stochastic gaps along the pond rim.
 */
/**
 * @param {THREE.MeshStandardMaterial | null} grassShared Same as `reedGrassShared` in {@link createPondReedField}.
 */
function latticeEdgeBands(root, clusters, rand, half, okLoose, profile, grassShared) {
  const step = 4.45;
  const bands = [8, 20, 32];

  for (const b of bands) {
    const zN = half - b;
    for (let gx = -half + 6; gx <= half - 6; gx += step) {
      const jx = gx + (rand() - 0.5) * 1.55;
      const jz = zN + (rand() - 0.5) * 1.45;
      tryAddCluster(root, clusters, rand, jx, jz, okLoose, profile, grassShared);
    }
    const zS = -half + b;
    for (let gx = -half + 6; gx <= half - 6; gx += step) {
      const jx = gx + (rand() - 0.5) * 1.55;
      const jz = zS + (rand() - 0.5) * 1.45;
      tryAddCluster(root, clusters, rand, jx, jz, okLoose, profile, grassShared);
    }
    const xE = half - b;
    for (let gz = -half + 6; gz <= half - 6; gz += step) {
      const jx = xE + (rand() - 0.5) * 1.45;
      const jz = gz + (rand() - 0.5) * 1.55;
      tryAddCluster(root, clusters, rand, jx, jz, okLoose, profile, grassShared);
    }
    const xW = -half + b;
    for (let gz = -half + 6; gz <= half - 6; gz += step) {
      const jx = xW + (rand() - 0.5) * 1.45;
      const jz = gz + (rand() - 0.5) * 1.55;
      tryAddCluster(root, clusters, rand, jx, jz, okLoose, profile, grassShared);
    }
  }
}

/**
 * Dense marsh fill + stitched perimeter grids + stochastic curtains.
 */
/**
 * @param {THREE.MeshStandardMaterial | null | undefined} [reedGrassShared] Optional shared grass PBR; see `reedTextures.js`.
 */
export function createPondReedField(track, seed = 0x5eed, reedGrassShared = null) {
  const rand = mulberry32(seed >>> 0);
  const root = new THREE.Group();
  root.name = "pondReeds";
  const grass = reedGrassShared ?? null;

  const half = 258;
  const innerPlay = half - 40;

  /** @type {{ x: number; z: number; r: number }[]} */
  const exclude = [];
  for (const l of track.lilies ?? []) {
    exclude.push({ x: l.position[0], z: l.position[1], r: (l.radius ?? 5) + 5 });
  }
  const sp = track.spawn?.position;
  if (Array.isArray(sp) && sp.length >= 3) {
    exclude.push({ x: sp[0], z: sp[2], r: 20 });
  }
  for (const cp of track.checkpoints ?? []) {
    const p = cp.position;
    if (!Array.isArray(p) || p.length < 3) continue;
    exclude.push({ x: p[0], z: p[2], r: (cp.radius ?? 10) + 8 });
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

  const clusters = [];

  const okInterior = (x, z) => clearance(x, z) >= 5 && Math.abs(x) < innerPlay && Math.abs(z) < innerPlay;
  const okEdge = (x, z) => clearance(x, z) >= 2.2 && Math.abs(x) <= half - 2 && Math.abs(z) <= half - 2;
  const okBand = (x, z) => clearance(x, z) >= 1.25 && Math.abs(x) <= half - 1 && Math.abs(z) <= half - 1;
  const okLoose = (x, z) => clearance(x, z) >= 0.75 && Math.abs(x) <= half - 1 && Math.abs(z) <= half - 1;

  let tries = 0;
  while (clusters.length < 198 && tries < 12000) {
    tries += 1;
    const cx = (rand() * 2 - 1) * innerPlay * 0.93;
    const cz = (rand() * 2 - 1) * innerPlay * 0.93;
    tryAddCluster(root, clusters, rand, cx, cz, okInterior, rand() > 0.42 ? "dense" : "fill", grass);
  }

  latticeEdgeBands(root, clusters, rand, half, okLoose, "edgeFill", grass);

  let quota = clusters.length;

  tries = 0;
  while (clusters.length < quota + 154 && tries < 14000) {
    tries += 1;
    const cz = THREE.MathUtils.lerp(half - 60, half - 7, rand());
    const cx = THREE.MathUtils.lerp(-half + 8, half - 8, rand()) + (rand() - 0.5) * 11;
    tryAddCluster(root, clusters, rand, cx, cz, okBand, "curtain", grass);
  }

  quota = clusters.length;
  tries = 0;
  while (clusters.length < quota + 154 && tries < 14000) {
    tries += 1;
    const cz = -THREE.MathUtils.lerp(half - 60, half - 7, rand());
    const cx = THREE.MathUtils.lerp(-half + 8, half - 8, rand()) + (rand() - 0.5) * 11;
    tryAddCluster(root, clusters, rand, cx, cz, okBand, "curtain", grass);
  }

  quota = clusters.length;
  tries = 0;
  while (clusters.length < quota + 154 && tries < 14000) {
    tries += 1;
    const cx = THREE.MathUtils.lerp(half - 60, half - 7, rand());
    const cz = THREE.MathUtils.lerp(-half + 8, half - 8, rand()) + (rand() - 0.5) * 11;
    tryAddCluster(root, clusters, rand, cx, cz, okBand, "curtain", grass);
  }

  quota = clusters.length;
  tries = 0;
  while (clusters.length < quota + 154 && tries < 14000) {
    tries += 1;
    const cx = -THREE.MathUtils.lerp(half - 60, half - 7, rand());
    const cz = THREE.MathUtils.lerp(-half + 8, half - 8, rand()) + (rand() - 0.5) * 11;
    tryAddCluster(root, clusters, rand, cx, cz, okBand, "curtain", grass);
  }

  quota = clusters.length;
  tries = 0;
  while (clusters.length < quota + 192 && tries < 13200) {
    tries += 1;
    const cx = (rand() * 2 - 1) * (half - 8);
    const cz = (rand() * 2 - 1) * (half - 8);
    if (!(Math.abs(cx) > innerPlay * 0.93 || Math.abs(cz) > innerPlay * 0.93)) continue;
    const prof = rand() > 0.72 ? "curtain" : "dense";
    tryAddCluster(root, clusters, rand, cx, cz, okEdge, prof, grass);
  }

  return { root, clusters };
}

/**
 * Rough gameplay cover: swimmer hull (XZ) overlaps the marsh footprint disk of any cluster.
 * Enemies should treat this as “lost line of sight”.
 */
export function playerConcealedInReeds(field, px, pz, hullR = 0.58) {
  const hr = Math.max(hullR, 0.12) * 0.38;
  for (const c of field?.clusters ?? []) {
    const r = typeof c.hideR === "number" && Number.isFinite(c.hideR) ? c.hideR : 0;
    if (!(r > 0.15)) continue;
    const ox = typeof c.hideX === "number" && Number.isFinite(c.hideX) ? c.hideX : (c.group?.position?.x ?? 0);
    const oz = typeof c.hideZ === "number" && Number.isFinite(c.hideZ) ? c.hideZ : (c.group?.position?.z ?? 0);
    const dx = px - ox;
    const dz = pz - oz;
    const reach = r + hr;
    if (dx * dx + dz * dz <= reach * reach) return true;
  }
  return false;
}

const INFL_R = 15.2;
const INFL_SQ = INFL_R * INFL_R;
/** Beyond this distance from player, stems skip springs & wake integration (ripple + wind only). */
const LOD_PHYS_R = 106;
const LOD_PHYS_R2 = LOD_PHYS_R * LOD_PHYS_R;
const K_SPRING = 34;
const DAMP = 7.1;
const TILT_LIM = 0.62;
const IDLE_AMP = 0.06;
const WAKE_PROX_SQ = 58 * 58;

const WATER_SAMPLE_EPS = 0.62;

/**
 * @param {{ root: THREE.Group; clusters: { group: THREE.Group; stems: any[] }[] }} field
 * @param {number} dt
 * @param {number} time
 * @param {ReedMover[]} movers
 * @param {number} [playerX] world X — when paired with playerZ enables physics LOD beyond `LOD_PHYS_R`
 * @param {number} [playerZ]
 */
export function updatePondReeds(field, dt, time, movers, playerX, playerZ) {
  if (!field?.clusters?.length) return;

  const phys = dt > 1e-5;
  const lodOn =
    typeof playerX === "number" &&
    typeof playerZ === "number" &&
    Number.isFinite(playerX) &&
    Number.isFinite(playerZ);

  for (const cl of field.clusters) {
    const g = cl.group;
    const wx = g.position.x;
    const wz = g.position.z;
    const surf = waterSurfaceDisplacementY(wx, wz, time);
    g.position.y = 0.31 + surf;

    const hC = surf;
    const hx = waterSurfaceDisplacementY(wx + WATER_SAMPLE_EPS, wz, time) - hC;
    const hz = waterSurfaceDisplacementY(wx, wz + WATER_SAMPLE_EPS, time) - hC;
    const rippleLeanX = hz * 3.15;
    const rippleLeanZ = -hx * 3.15;

    const gust = Math.sin(time * 0.38 + wx * 0.011 + wz * 0.013) * 0.55;
    const gust2 = Math.cos(time * 0.29 + wx * -0.009) * 0.35;
    const windLeanX = (gust + gust2) * 0.06;
    const windLeanZ = Math.sin(time * 0.33 + wz * 0.014 + wx * 0.008) * 0.055;

    let lodSimple = false;
    if (lodOn) {
      const ddx = wx - playerX;
      const ddz = wz - playerZ;
      lodSimple = ddx * ddx + ddz * ddz > LOD_PHYS_R2;
    }

    let wakeHot = false;
    if (!lodSimple) {
      wakeHot = !movers?.length;
      if (!wakeHot && movers.length > 0) {
        for (let mi = 0; mi < movers.length; mi += 1) {
          const m = movers[mi];
          const dx = wx - m.x;
          const dz = wz - m.z;
          if (dx * dx + dz * dz <= WAKE_PROX_SQ) {
            wakeHot = true;
            break;
          }
        }
      }
    }

    for (const st of cl.stems) {
      const mesh = st.mesh;
      const sx = wx + mesh.position.x;
      const sz = wz + mesh.position.z;

      const idleMul = typeof st.idleMul === "number" ? st.idleMul : 1;
      const rg = typeof st.rippleGain === "number" ? st.rippleGain : 1;
      const idle =
        IDLE_AMP *
        idleMul *
        rg *
        Math.sin(time * st.swayHz + st.swayPh + sx * 0.028 + sz * -0.019);
      const microRip =
        Math.sin(time * 1.85 + sx * 0.08 + sz * 0.06) * 0.014 * rg;

      if (lodSimple) {
        mesh.rotation.x =
          st.baseRx + rippleLeanX * rg * 0.85 + windLeanX + microRip + idle;
        mesh.rotation.z =
          st.baseRz +
          rippleLeanZ * rg * 0.85 +
          windLeanZ +
          microRip * 0.7 +
          idle * 0.68;
        continue;
      }

      if (phys) {
        let ax = (-K_SPRING * st.tiltX - DAMP * st.wx) * dt;
        let az = (-K_SPRING * st.tiltZ - DAMP * st.wz) * dt;

        const wob = Math.sin(time * st.windHz + st.windPh + sx * 0.017) * 0.022 * rg;
        const wob2 = Math.cos(time * (st.windHz * 0.81) + st.windPh * 1.3 + sz * 0.019) * 0.018 * rg;
        ax += (wob + windLeanX * 0.18) * dt * 48;
        az += (wob2 + windLeanZ * 0.18) * dt * 48;

        if (wakeHot) {
          for (const m of movers) {
            const dx = sx - m.x;
            const dz = sz - m.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > INFL_SQ || d2 < 1e-5) continue;
            const invD = 1 / Math.sqrt(d2);
            const nx = dx * invD;
            const nz = dz * invD;

            const sp = Math.hypot(m.vx, m.vz);
            const falloff = 1 - INFL_R * invD;
            const fallSq = falloff * falloff;
            if (falloff <= 0) continue;

            const swirl = m.vz * nx - m.vx * nz;
            const coupl = Math.min(sp, 14) * m.str * fallSq * 0.19;

            ax += coupl * ((-m.vz / (sp + 0.12)) * 0.85 + swirl * 0.22) * dt;
            az += coupl * ((m.vx / (sp + 0.12)) * 0.85 - swirl * 0.2) * dt;
          }
        }

        st.wx += ax;
        st.wz += az;
        st.tiltX += st.wx * dt;
        st.tiltZ += st.wz * dt;
        st.tiltX = THREE.MathUtils.clamp(st.tiltX, -TILT_LIM, TILT_LIM);
        st.tiltZ = THREE.MathUtils.clamp(st.tiltZ, -TILT_LIM, TILT_LIM);
      }

      mesh.rotation.x =
        st.baseRx + st.tiltX + idle + rippleLeanX * rg * 0.85 + windLeanX + microRip;
      mesh.rotation.z =
        st.baseRz + st.tiltZ + idle * 0.68 + rippleLeanZ * rg * 0.85 + windLeanZ + microRip * 0.7;
    }
  }
}
