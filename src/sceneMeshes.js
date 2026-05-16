import * as THREE from "three";
import { FOOD_PALETTE } from "./trackLoader.js";

export const COLORS = {
  water: 0x0c4f6f,
  waterDeep: 0x073550,
  /** Notonectid backswimmer: dark dorsum, reflective ventral keel. */
  boatBody: 0x3a484c,
  boatShell: 0xcad6de,
  boatLeg: 0x353c40,
  boatEye: 0x1a0505,
  lilyPad: 0x2f7d32,
  fish: 0x8b5f3c,
  rival: 0x7a5234,
  /** Grazing larvae (enemy) — warm / high readability vs water + ribbon. */
  mozzieGrub: 0xc96f4a,
  mozzieStripe: 0xe8d4bc,
  mozzieSnorkel: 0x8f3040,
  planarianPink: 0xd95aa4,
  planarianStem: 0xfff0f7,
  daphnidCore: 0x7ef3d9,
  daphnidShell: 0x3aab98,
  hydraStem: 0x558f6f,
  hydraGlow: 0xc8fff1,
  scorpionHull: 0x5f4f38,
  scorpionAccent: 0xb89b6b,
  /** Ephemeral prey-chunk pickup (hemolymph nibble). */
  preyNibble: 0xffe8aa,
};

const COL_GREEN_HP_STR = "#3cf09a";
const COL_ORANGE_HP_STR = "#ffb228";
const COL_RED_HP_STR = "#ff2844";

/** Overhead HP strip sprites always face cam; `draw`(hpRemain01, dmgFrac01, dmgPulseOptional). */
export function createHpStripSprite(scaleX = 2.55, scaleY = 0.54, yOffsetLocal = 2.78) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  mat.toneMapped = false;

  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0.06);
  sprite.position.y = yOffsetLocal;
  sprite.scale.set(scaleX, scaleY, 1);
  sprite.renderOrder = 8;

  const draw = (hpRatio, dmgFrac, dmgPulse = 0) => {
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const pad = 6;
    const rx = cw - pad * 2;
    const ry = 38;
    const bx = pad;
    const by = (ch - ry) / 2;

    ctx.fillStyle = "rgba(12,26,42,0.86)";
    roundRectPath(ctx, bx, by, rx, ry, 8);
    ctx.fill();

    const innerX = bx + 5;
    const innerY = by + 5;
    const innerW = rx - 10;
    const innerH = ry - 10;
    const fillW = Math.max(4, THREE.MathUtils.clamp(hpRatio, 0, 1) * innerW);

    const df = THREE.MathUtils.clamp(dmgFrac, 0, 1);
    let colStr;
    if (df <= 0.5) {
      colStr = interpolateHexColors(COL_GREEN_HP_STR, COL_ORANGE_HP_STR, df / 0.5);
    } else {
      colStr = interpolateHexColors(COL_ORANGE_HP_STR, COL_RED_HP_STR, (df - 0.5) / 0.5);
    }

    ctx.fillStyle = colStr;
    ctx.globalAlpha = 0.95;
    roundRectPath(ctx, innerX, innerY, fillW, innerH, 5);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(220,246,255,0.22)";
    ctx.lineWidth = 1.35;
    roundRectPathStroke(ctx, bx, by, rx, ry, 8);
    ctx.stroke();

    const dp = THREE.MathUtils.clamp(dmgPulse, 0, 1);
    if (dp > 0.04) {
      ctx.strokeStyle = `rgba(255,255,255,${THREE.MathUtils.lerp(0.15, 0.95, dp)})`;
      ctx.lineWidth = 2 + dp * 4;
      roundRectPathStroke(ctx, innerX, innerY, innerW, innerH, 5);
      ctx.stroke();
    }

    tex.needsUpdate = true;
  };

  draw(1, 0, 0);

  return { sprite, tex, canvas, ctx, draw };
}

function interpolateHexColors(hexA, hexB, u) {
  const a = Number.parseInt(hexA.slice(1), 16);
  const b = Number.parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const rr = Math.round(THREE.MathUtils.lerp(ar, br, u));
  const rg = Math.round(THREE.MathUtils.lerp(ag, bg, u));
  const rb = Math.round(THREE.MathUtils.lerp(ab, bb, u));
  const out = ((rr << 16) | (rg << 8) | rb) >>> 0;
  return `#${out.toString(16).padStart(6, "0")}`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundRectPathStroke(ctx, x, y, w, h, r) {
  roundRectPath(ctx, x, y, w, h, r);
}

export function lilyGroup(radius) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.97, 0.22, 28, 1),
    new THREE.MeshStandardMaterial({ color: COLORS.lilyPad, roughness: 0.78, metalness: 0.02 })
  );
  pad.position.y = 0.11;
  pad.castShadow = true;
  pad.receiveShadow = true;
  g.add(pad);

  const cut = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius * 0.9, 0.04, 8, 1),
    new THREE.MeshStandardMaterial({ color: 0xb8e986, transparent: true, opacity: 0.35 })
  );
  cut.position.y = 0.2;
  g.add(cut);
  return g;
}

export function bubbleGroup(size) {
  const geom = new THREE.IcosahedronGeometry(size * 0.14, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcffaf5,
    emissive: 0x4499cc,
    emissiveIntensity: 0.06,
    metalness: 0.06,
    roughness: 0.15,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const grp = new THREE.Group();
  const main = new THREE.Mesh(geom, mat);
  grp.add(main);
  for (let i = 0; i < 8; i++) {
    const s = geom.clone();
    const m = new THREE.Mesh(s, mat.clone());
    m.position.set(
      (Math.random() - 0.5) * size * 0.22,
      Math.random() * size * 0.12 - 0.05,
      (Math.random() - 0.5) * size * 0.22
    );
    m.scale.setScalar(0.35 + Math.random() * 0.5);
    grp.add(m);
  }
  return grp;
}

export function rippleGroup(worldRadius) {
  const outer = new THREE.RingGeometry(worldRadius * 0.72, worldRadius, 96);
  outer.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xa8f2ff,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(outer, mat);

  const inner = new THREE.RingGeometry(worldRadius * 0.35, worldRadius * 0.78, 80);
  inner.rotateX(-Math.PI / 2);
  const innerMat = mat.clone();
  innerMat.opacity = 0.32;
  const ring2 = new THREE.Mesh(inner, innerMat);
  mesh.add(ring2);

  return { mesh, mat, ring2, innerMat };
}

export function fishGroup(len, wid, ht) {
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.fish, roughness: 0.6, metalness: 0.06 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, ht, wid), mat);
  body.castShadow = true;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(wid * 0.82, wid * 1.85, 3), mat.clone());
  tail.rotation.z = Math.PI / 2;
  tail.rotation.y = Math.PI / 6;
  tail.position.x = -len * 0.48;
  tail.castShadow = true;
  const grp = new THREE.Group();
  grp.add(body, tail);
  return grp;
}

export function rivalGroup({ hullHex = null, hue = null, hueIndex = 0 } = {}) {
  const FALLBACK_HUES = [22, 202, 304, 128, 48];
  /** @type {number} */
  let hullCol = COLORS.rival;

  if (typeof hullHex === "number" && Number.isFinite(hullHex)) {
    hullCol = hullHex >>> 0;
  } else {
    let hDeg = FALLBACK_HUES[Math.abs(hueIndex | 0) % FALLBACK_HUES.length];
    if (hue !== null && Number.isFinite(hue)) {
      hDeg = ((hue % 360) + 360) % 360;
    }
    hullCol = new THREE.Color().setHSL(hDeg / 360, 0.58, 0.43).getHex();
  }

  const headTint = new THREE.Color(hullCol);
  headTint.offsetHSL(0.04, -0.08, -0.1);

  const grp = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(0.92, 20, 16),
    new THREE.MeshStandardMaterial({ color: hullCol, roughness: 0.6, metalness: 0.06 })
  );
  hull.scale.set(2.05, 0.92, 1.15);
  hull.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 12),
    new THREE.MeshStandardMaterial({ color: headTint.getHex(), roughness: 0.62, metalness: 0.02 })
  );
  head.position.set(1.03, -0.12, -0.02);
  head.scale.set(0.88, 0.78, 0.88);
  head.castShadow = true;

  grp.add(hull, head);
  return grp;
}

/**
 * Stylised backswimmer (Notonectidae posture): keel reads silvery underwater,
 * long hind oars tuck along the dorsal silhouette for the chase camera.
 */
export function boatGroup() {
  const grp = new THREE.Group();

  const dorsal = new THREE.MeshStandardMaterial({
    color: COLORS.boatBody,
    roughness: 0.78,
    metalness: 0.05,
    emissive: 0x271c12,
    emissiveIntensity: 0.04,
  });

  const ventral = new THREE.MeshStandardMaterial({
    color: COLORS.boatShell,
    roughness: 0.84,
    metalness: 0.03,
  });

  const legMat = new THREE.MeshStandardMaterial({
    color: COLORS.boatLeg,
    roughness: 0.73,
    metalness: 0.02,
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: COLORS.boatEye,
    roughness: 0.45,
    metalness: 0.1,
  });

  /** Abdomen (+ hemelytron bulk) swept back behind wings */
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.51, 20, 16), dorsal);
  abdomen.scale.set(0.53, 0.33, 1.38);
  abdomen.position.set(0, 0.05, -0.22);

  /** Pronotum / thorax */
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), dorsal);
  thorax.scale.set(0.66, 0.44, 0.95);
  thorax.position.set(0, 0.065, 0.16);

  /** Head */
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), dorsal);
  head.scale.set(1.06, 0.78, 1.08);
  head.position.set(0, 0.09, 0.52);

  /** Lighter ventral keel */
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), ventral);
  belly.scale.set(0.5, 0.2, 1.06);
  belly.position.set(0, -0.09, -0.06);

  /** Narrow dark “furrow” dividing hemelytron outline (cheap silhouette cue) */
  const seamMat = dorsal.clone();
  seamMat.color = new THREE.Color(0x2d221a);
  seamMat.emissiveIntensity = 0;
  seamMat.metalness = 0.06;
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 1.06), seamMat);
  seam.position.set(0, 0.08, -0.18);
  seam.rotation.x = 0.05;

  /** Compound eyes */
  const eyeGeom = new THREE.SphereGeometry(0.055, 10, 8);
  const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
  eyeL.position.set(-0.11, 0.1, 0.58);
  eyeR.position.set(0.11, 0.1, 0.58);

  /** Fore & mid legs (short) */
  const foreL = legPair(legMat, 0.18, 0.03, 0.38, 0.44, 0.22, 0.55);
  const midL = legPair(legMat, 0.22, 0.032, 0.34, 0.15, 0.15, 0.24);

  /** Hind rowing oars — long, flattened, swept back */
  const hindL = hindOarLeg(legMat, -1);
  const hindR = hindOarLeg(legMat, 1);

  grp.add(abdomen, thorax, head, belly, seam, eyeL, eyeR, foreL, midL, hindL, hindR);

  grp.userData.stroke = {
    hindLPivot: /** @type {THREE.Group} */ (hindL.userData.strokePivot),
    hindRPivot: /** @type {THREE.Group} */ (hindR.userData.strokePivot),
    foreGroup: foreL,
    midGroup: midL,
  };

  grp.traverse((c) => {
    if ("isMesh" in c && c.isMesh) c.castShadow = true;
  });

  grp.rotation.order = "YXZ";
  return grp;
}

function legPair(mat, len, thick, z, y, xOff, spread) {
  const wrap = new THREE.Group();
  const geom = new THREE.BoxGeometry(len, thick, thick);
  const left = new THREE.Mesh(geom, mat);
  const right = new THREE.Mesh(geom, mat);
  left.position.set(-xOff - len * 0.35, y, z);
  right.position.set(xOff + len * 0.35, y, z);
  left.rotation.z = spread;
  right.rotation.z = -spread;
  left.rotation.y = -0.12;
  right.rotation.y = 0.12;
  wrap.add(left, right);
  return wrap;
}

function hindOarLeg(mat, side) {
  /** side: -1 left, +1 right — mount fixes to flank; pivot strokes for rowing kick */
  const mount = new THREE.Group();
  mount.position.set(0.12 * side, 0.038, -0.05);
  mount.rotation.y = side * 0.16;

  const pivot = new THREE.Group();
  pivot.rotation.order = "YXZ";
  /** Neutral “oar forward” rowing pose; animation sweeps yaw (front ↔ back along body axis). */
  pivot.rotation.x = -0.16;
  pivot.rotation.y = side * (-0.32);
  pivot.userData.restKickX = pivot.rotation.x;
  pivot.userData.restKickY = pivot.rotation.y;

  mount.add(pivot);

  const femur = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.14, 4, 8), mat);
  femur.rotation.z = side * 0.32;
  femur.rotation.x = -0.12;
  femur.position.set(0.05 * side, -0.015, 0.04);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.045, 0.23), mat);
  blade.position.set(0.36 * side, -0.04, 0.05);
  blade.rotation.y = side * -0.48;
  blade.rotation.x = 0.28;
  blade.rotation.z = side * -0.1;

  pivot.add(femur, blade);
  mount.userData.strokePivot = pivot;
  mount.userData.side = side;
  return mount;
}

export function foodMesh(kind) {
  let geom;
  if (kind === "nematode") geom = new THREE.CylinderGeometry(0.15, 0.15, 0.92, 8);
  else if (kind === "mosquito_larva") geom = new THREE.CapsuleGeometry(0.18, 0.88, 4, 8);
  else geom = new THREE.OctahedronGeometry(0.48, 0);

  const mat = new THREE.MeshStandardMaterial({
    color: FOOD_PALETTE[kind] || FOOD_PALETTE.protozoa,
    roughness: 0.45,
    metalness: 0.06,
    emissive: 0x223344,
    emissiveIntensity: 0.04,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  return mesh;
}

/** Ephemeral grazing “nibble” — warm emissive crumb that decays unread for a moment. */
export function preyNibbleMesh() {
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.preyNibble,
    roughness: 0.42,
    metalness: 0.04,
    emissive: 0x8af5cf,
    emissiveIntensity: 0.52,
    transparent: true,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 1), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.rotation.z = Math.random() * Math.PI;
  mesh.rotation.y = Math.random() * Math.PI;
  return mesh;
}

export function advanceFish(grp, data, dt) {
  const state = grp.userData.state || { patrolIndex: 0 };
  grp.userData.state = state;
  const patrol = data.patrol;
  let idx = state.patrolIndex ?? 0;
  const tgt = patrol[idx];
  const tx = tgt[0];
  const tz = tgt[1];
  const vx = tx - grp.position.x;
  const vz = tz - grp.position.z;
  const dirLen = Math.hypot(vx, vz);
  const spd = data.speed ?? 4;
  if (dirLen < 0.65) state.patrolIndex = (idx + 1) % patrol.length;
  if (dirLen > 1e-5) {
    grp.position.x += (vx / dirLen) * spd * dt;
    grp.position.z += (vz / dirLen) * spd * dt;
  }
  grp.lookAt(tx, grp.position.y + 0.2, tz);
}

/**
 * Hostile larva grazing the swimmer’s hemolymph — distinct muddy palette from edible food larvae.
 */
export function predatorMozzieMesh() {
  const grp = new THREE.Group();

  /** Big silhouette for aerial chase cam (was ~half the player hull — read as stray pixels). */
  const SCALE = 2.45;
  grp.scale.setScalar(SCALE);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: COLORS.mozzieGrub,
    roughness: 0.5,
    metalness: 0.06,
    emissive: 0x552211,
    emissiveIntensity: 0.092,
  });

  const stripeMat = bodyMat.clone();
  stripeMat.color = new THREE.Color(COLORS.mozzieStripe);
  stripeMat.emissive = new THREE.Color(0x331108);
  stripeMat.emissiveIntensity = 0.055;

  const snorkMat = bodyMat.clone();
  snorkMat.color = new THREE.Color(COLORS.mozzieSnorkel);
  snorkMat.emissiveIntensity = 0.05;

  const seg = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), bodyMat);
  seg.scale.set(0.92, 0.52, 1.24);
  seg.position.set(0, 0.04, -0.12);
  const segMid = seg.clone();
  segMid.material = stripeMat;
  segMid.scale.multiplyScalar(0.88);
  segMid.position.set(0, 0.05, 0.24);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), snorkMat);
  head.scale.set(0.92, 0.56, 0.95);
  head.position.set(0, 0.07, 0.62);

  const snork = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.52, 8, 2), snorkMat);
  snork.position.set(-0.2, 0.11, -0.45);
  snork.rotation.z = 0.32;
  snork.rotation.x = -0.22;

  const hook = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 4), snorkMat.clone());
  hook.rotation.z = -Math.PI / 2;
  hook.position.set(0.5, -0.04, -0.4);

  /** Waterline donut read from chase camera + breaks chroma camouflage vs duckweed / grid. */
  const wakeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.46, 40),
    new THREE.MeshBasicMaterial({
      color: 0xf06255,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  wakeRing.rotation.x = -Math.PI / 2;
  wakeRing.position.y = -0.02;
  wakeRing.frustumCulled = false;
  wakeRing.castShadow = false;
  wakeRing.receiveShadow = false;
  /** Undo parent scale so the surface marker stays postcard-sized (~0.46 m Ø). */
  wakeRing.scale.setScalar(1 / SCALE);

  grp.userData.predWakeMat = wakeRing.material;
  grp.add(seg, segMid, head, snork, hook, wakeRing);

  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh) {
      const isWake = /** @type {THREE.Mesh} */ (o);
      /** Ring is unlit/UI-like; segmented body carries shadows after scale-up. */
      if (isWake === wakeRing) {
        return;
      }
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;

  const hpHud = createHpStripSprite(2.95, 0.62, 2.95);
  grp.add(hpHud.sprite);
  grp.userData.hpHud = hpHud;

  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

/** Flatworm riff — rippling ribbon + sucker; spits toxin globs. */
export function predatorPlanarianMesh() {
  const grp = new THREE.Group();

  const SCALE = 2.62;
  grp.scale.setScalar(SCALE);

  const skin = new THREE.MeshStandardMaterial({
    color: COLORS.planarianStem,
    roughness: 0.54,
    metalness: 0.06,
    emissive: 0x884488,
    emissiveIntensity: 0.05,
  });
  const dorsal = skin.clone();
  dorsal.color = new THREE.Color(COLORS.planarianPink);
  dorsal.emissive = new THREE.Color(0xaa2266);

  let z = -0.18;
  for (let s = 0; s < 5; s += 1) {
    const el = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), s % 2 ? dorsal : skin);
    el.scale.set(0.95, 0.46, 0.85);
    el.position.set(Math.sin(s * 0.18) * 0.035, Math.sin(s * 0.55) * 0.04, z + s * 0.28);
    grp.add(el);
  }

  const sucker = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), dorsal.clone());
  sucker.position.set(-0.04, -0.04, z - 0.28);
  grp.add(sucker);

  const spitMark = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.12, 18),
    new THREE.MeshBasicMaterial({
      color: 0xff9fe5,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  spitMark.rotation.x = -Math.PI / 2;
  spitMark.position.set(0.2, -0.02, 0.92);
  spitMark.scale.setScalar(1 / SCALE);
  grp.add(spitMark);

  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh && !o.material?.blending) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;
  const hpHud = createHpStripSprite(2.35, 0.58, 2.92);
  grp.add(hpHud.sprite);
  grp.userData.hpHud = hpHud;
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

/** Cladoceran riff — translucent carapace, single cyclopean eye flare. */
export function predatorDaphnidMesh() {
  const grp = new THREE.Group();
  const SCALE = 2.5;
  grp.scale.setScalar(SCALE);

  const shellMat = new THREE.MeshStandardMaterial({
    color: COLORS.daphnidShell,
    roughness: 0.32,
    metalness: 0.06,
    transparent: true,
    opacity: 0.88,
    emissive: 0x226655,
    emissiveIntensity: 0.04,
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), shellMat);
  body.scale.set(0.94, 0.58, 1.18);
  body.position.y = 0.04;

  const coreMat = shellMat.clone();
  coreMat.color = new THREE.Color(COLORS.daphnidCore);
  coreMat.opacity = 1;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), coreMat);
  core.scale.set(0.88, 0.46, 0.96);
  core.position.set(0, 0.08, -0.04);

  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.068, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0x1a0510,
      roughness: 0.42,
      emissive: 0xffeeaa,
      emissiveIntensity: 0.12,
      metalness: 0.1,
    })
  );
  eye.position.set(0, 0.12, 0.62);

  const ant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.03, 0.72, 4, 2),
    new THREE.MeshStandardMaterial({ color: 0xbef7ff, roughness: 0.64 })
  );
  ant.rotation.z = Math.PI / 6;
  ant.position.set(0.2, 0.16, -0.1);

  grp.add(body, core, eye, ant);
  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh && o.material && !Array.isArray(o.material)) {
      const m = /** @type {THREE.MeshStandardMaterial} */ (o.material);
      if (!m.blending || m.blending === THREE.NormalBlending) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
      o.frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;
  const hpHud = createHpStripSprite(1.75, 0.52, 2.72);
  grp.add(hpHud.sprite);
  grp.userData.hpHud = hpHud;
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

/** Hydra riff — tethered capsule + dangling nematocyte bulbs. */
export function predatorHydraPodMesh() {
  const grp = new THREE.Group();
  const SCALE = 3.2;
  grp.scale.setScalar(SCALE);

  const stemMat = new THREE.MeshStandardMaterial({
    color: COLORS.hydraStem,
    roughness: 0.6,
    metalness: 0.06,
    emissive: COLORS.hydraGlow,
    emissiveIntensity: 0.04,
  });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.92, 8, 2), stemMat);
  stem.rotation.z = 0.12;
  stem.position.y = -0.2;

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 12), stemMat.clone());
  bulb.position.y = 0.48;
  bulb.material.emissiveIntensity = 0.12;

  for (let i = 0; i < 3; i++) {
    const ang = i * Math.PI * 0.72;
    const hang = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), stemMat.clone());
    hang.position.set(Math.cos(ang) * 0.52, -0.22, Math.sin(ang) * 0.52 + 0.04);
    hang.material.color = new THREE.Color(0xfff7ff);
    hang.material.emissive = new THREE.Color(0xaaeeff);
    hang.material.emissiveIntensity = 0.18;
    grp.add(hang);
  }

  grp.add(stem, bulb);

  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh && o.material) {
      const m = o.material;
      if (!Array.isArray(m)) {
        /** @type {THREE.MeshStandardMaterial} */ const mm = m;
        if (!mm.blending || mm.blending === THREE.NormalBlending) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      }
      o.frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;
  const hpHud = createHpStripSprite(2.2, 0.54, 2.92);
  grp.add(hpHud.sprite);
  grp.userData.hpHud = hpHud;
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

/** Armoured predator riff — elongated plate + hinged tail spike + binocular eyes for weak-hit reads. */
export function predatorWaterScorpionTankMesh() {
  const grp = new THREE.Group();
  const SCALE = 4.2;
  grp.scale.setScalar(SCALE);

  const carapace = new THREE.MeshStandardMaterial({
    color: COLORS.scorpionHull,
    roughness: 0.58,
    metalness: 0.06,
    emissive: 0x352820,
    emissiveIntensity: 0.046,
  });
  const eyeMat = carapace.clone();
  eyeMat.color = new THREE.Color(0x1a0810);
  eyeMat.emissive = new THREE.Color(0xfff3d9);
  eyeMat.emissiveIntensity = 0.22;

  const accent = carapace.clone();
  accent.color = new THREE.Color(COLORS.scorpionAccent);

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), accent);
  thorax.scale.set(0.48, 0.34, 0.94);
  thorax.position.set(0.02, 0.08, 0.72);

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), carapace);
  abdomen.scale.set(0.94, 0.38, 1.92);
  abdomen.position.set(0, 0.1, -0.74);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.98, 6, 1, false), accent);
  tail.rotation.x = -Math.PI / 2 + 0.18;
  tail.position.set(-0.02, 0.06, -1.94);

  const raptorialL = new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.42, 3, 6), accent);
  raptorialL.position.set(-0.34, -0.04, 0.95);
  raptorialL.rotation.set(0.24, -0.18, -0.6);
  const raptorialR = raptorialL.clone();
  raptorialR.position.x *= -1;
  raptorialR.rotation.z *= -1;
  raptorialR.rotation.y *= -1;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), eyeMat);
  eyeL.position.set(-0.18, 0.26, 1.14);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.18;

  grp.add(thorax, abdomen, tail, raptorialL, raptorialR, eyeL, eyeR);

  const wakeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.44, 36),
    new THREE.MeshBasicMaterial({
      color: 0xf0b060,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  wakeRing.rotation.x = -Math.PI / 2;
  wakeRing.position.y = -0.04;
  wakeRing.scale.setScalar(1 / SCALE);
  wakeRing.castShadow = false;
  grp.userData.predWakeMat = wakeRing.material;
  grp.add(wakeRing);

  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh) {
      if (o === wakeRing) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;
  const hpHud = createHpStripSprite(3.4, 0.74, 3.72);
  grp.add(hpHud.sprite);
  grp.userData.hpHud = hpHud;
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

export function predatorMesh(kind) {
  switch (kind) {
    case "mosquito_larva":
      return predatorMozzieMesh();
    case "planarian_spitter":
      return predatorPlanarianMesh();
    case "daphnid_charger":
      return predatorDaphnidMesh();
    case "hydra_pod":
      return predatorHydraPodMesh();
    case "waterscorpion_tank":
      return predatorWaterScorpionTankMesh();
    default:
      return predatorMozzieMesh();
  }
}

/** Pursue target when closer than √engageRadiusSq; otherwise idle near anchor. Larva rolls toward motion. */
export function advanceMozzieTowardPlayer(
  grp,
  dt,
  playerX,
  playerZ,
  chaseSpeed,
  anchorX,
  anchorZ,
  engageRadiusSq,
  timeSec,
  damageKickRad = 0
) {
  const lx = grp.position.x;
  const lz = grp.position.z;

  let tx = anchorX;
  let tz = anchorZ;
  const vx = playerX - lx;
  const vz = playerZ - lz;
  if (vx * vx + vz * vz <= engageRadiusSq) {
    tx = playerX;
    tz = playerZ;
  } else {
    const ph = grp.userData.idlePhase ?? 0;
    const bob = Math.sin(timeSec * 0.82 + ph) * 0.06;
    const bob2 = Math.cos(timeSec * 0.55 + ph * 1.31) * 0.055;
    tx = anchorX + bob;
    tz = anchorZ + bob2;
  }

  let wx = tx - lx;
  let wz = tz - lz;
  const wl = Math.hypot(wx, wz);

  let moved = wl > 1e-4;
  if (moved) {
    const step = Math.min(Math.max(Number(chaseSpeed) || 0, 0) * dt, wl);
    grp.position.x += (wx / wl) * step;
    grp.position.z += (wz / wl) * step;
    wx = wx / wl;
    wz = wz / wl;
    grp.rotation.y = -Math.atan2(wx, wz);
  }

  grp.rotation.order = "YXZ";
  const id = grp.userData.idlePhase ?? 0;
  const baseRoll = moved ? Math.sin(timeSec * 10.5 + id) * 0.14 : Math.sin(timeSec * 7.25 + id) * 0.08;
  const kick = typeof damageKickRad === "number" && Number.isFinite(damageKickRad) ? damageKickRad : 0;
  grp.rotation.z = baseRoll + kick;

  return moved;
}

export function advanceRival(grp, r, dt) {
  const path = r.path;
  let idx = r.pathIndex ?? 0;
  let tx = path[idx][0];
  let tz = path[idx][1];
  let vx = tx - grp.position.x;
  let vz = tz - grp.position.z;
  let dl = Math.hypot(vx, vz);

  while (dl < 0.75 && path.length > 1) {
    idx = (idx + 1) % path.length;
    tx = path[idx][0];
    tz = path[idx][1];
    vx = tx - grp.position.x;
    vz = tz - grp.position.z;
    dl = Math.hypot(vx, vz);
  }

  r.pathIndex = idx;
  const spd = r.speed ?? 3.6;
  const nx = dl > 1e-5 ? vx / dl : 0;
  const nz = dl > 1e-5 ? vz / dl : 0;
  grp.position.x += nx * spd * dt;
  grp.position.z += nz * spd * dt;

  grp.lookAt(tx, grp.position.y - 0.25, tz);
}
