import * as THREE from "three";
import { FOOD_PALETTE } from "./trackLoader.js";

export const COLORS = {
  water: 0x0c4f6f,
  waterDeep: 0x073550,
  /** Highlights for procedural water tiling (cyan shift). */
  lightWaterSheen: 0x1f8aae,
  /** Notonectid backswimmer — bumped values read against tinted water from chase cam. */
  boatBody: 0x5d717c,
  boatShell: 0xe4eef5,
  boatLeg: 0x474f56,
  boatEye: 0x1a0505,
  lilyPad: 0x2f7d32,
  fish: 0x8b5f3c,
  rival: 0x7a5234,
  /** Grazing larvae (enemy) — warm / high readability vs water + ribbon. */
  mozzieGrub: 0xc96f4a,
  mozzieStripe: 0xe8d4bc,
  mozzieSnorkel: 0x8f3040,
  /** Mosquito wriggler riff — dorsal thorax ochre, abdomen muddy ochre-brown. */
  mozzieHead: 0x3d3024,
  mozzieThorax: 0xb89a72,
  mozzieAbdomen: 0xa88863,
  mozzieVentrum: 0xdcc4a8,
  mozzieSiphonChitin: 0x6f5238,
  planarianPink: 0xd95aa4,
  planarianStem: 0xfff0f7,
  daphnidCore: 0x7ef3d9,
  daphnidShell: 0x3aab98,
  hydraStem: 0x558f6f,
  hydraGlow: 0xc8fff1,
  scorpionHull: 0x5f4f38,
  scorpionAccent: 0xb89b6b,
  /** Planarian ribbon — ventral cream, dorsal rose flush. */
  planarianVentral: 0xf5e8f0,
  planarianEyespot: 0x1a1018,
  /** Daphnid valves / rostrum sheen. */
  daphnidRostrum: 0x4ac4b0,
  daphnidLeg: 0x8ad4ce,
  /** Hydra polyp — tentacle vs cup. */
  hydraPedestal: 0x3d5c48,
  hydraTentacle: 0x7aab8c,
  hydraNematocyst: 0xe8ffff,
  /** Water-scorpion riff — wing-pad & dorsal keel. */
  scorpionWingPad: 0x4a4030,
  scorpionKeel: 0x2a2318,
  /** Ephemeral prey-chunk pickup (hemolymph nibble). */
  preyNibble: 0xffe8aa,
};

const COL_GREEN_HP_STR = "#3cf09a";
const COL_ORANGE_HP_STR = "#ffb228";
const COL_RED_HP_STR = "#ff2844";

/**
 * Bills HP sprites in local units instead of predator root {@link grp}.scale anatomical multiples,
 * so viewport clamping does not crush huge grazers (e.g. waterscorpion).
 */
function attachHpStripForScaledPredator(grp, modelBaseScale, hpHud) {
  const hudRoot = new THREE.Group();
  hudRoot.scale.setScalar(1 / modelBaseScale);
  hpHud.sprite.position.y *= modelBaseScale;
  hudRoot.add(hpHud.sprite);
  grp.add(hudRoot);
  grp.userData.hpHud = hpHud;
}

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

/**
 * @param {number} radius Lily pad horizontal scale (YAML / procedural).
 * @param {THREE.MeshStandardMaterial | null | undefined} [sharedGrassMat] PBR lily material (cloned grass with mild repeat via {@link cloneGrassMaterialForBroadLeaves}); omit for flat green.
 */
export function lilyGroup(radius, sharedGrassMat) {
  const g = new THREE.Group();
  const padRot = Math.random() * Math.PI * 2;
  const r = Math.max(Number(radius) || 1, 0.32);

  const padMat =
    sharedGrassMat ??
    new THREE.MeshStandardMaterial({
      color: COLORS.lilyPad,
      roughness: 0.78,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

  /** Central dish + monotonic swept profile → rolled peripheral wall / lip */
  const padH = THREE.MathUtils.clamp(0.038 + r * 0.026, 0.042, 0.52);
  const lipH = THREE.MathUtils.clamp(0.055 + r * 0.038, 0.065, 0.88);
  const innerR = r * 0.72;
  const shelfR = r * 0.9;
  const lipOuter = r * 1.018;

  const profile = [
    new THREE.Vector2(0.006, 0),
    new THREE.Vector2(innerR * 0.2, 0.014),
    new THREE.Vector2(innerR * 0.74, padH * 0.26),
    new THREE.Vector2(shelfR * 0.99, padH * 0.64),
    new THREE.Vector2(lipOuter * 0.995, padH * 0.82),
    new THREE.Vector2(lipOuter, padH * 0.58 + lipH),
  ];
  const latheSegs = Math.min(96, Math.max(26, Math.floor(r * 4.2)));
  const padGeo = new THREE.LatheGeometry(profile, latheSegs);
  padGeo.computeVertexNormals();
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.rotation.y = padRot;
  pad.scale.set(1.02, 1, 0.94);
  pad.castShadow = true;
  pad.receiveShadow = true;
  g.add(pad);

  /** Veins overlay — toned down when a grass texture shows underneath. */
  const grassy = !!padMat.map;

  /** Subtle raised vein deck on top of the shelf (reads from chase cam). */
  const veinMat = new THREE.MeshStandardMaterial({
    color: 0xc4e894,
    roughness: 0.74,
    metalness: 0.01,
    transparent: true,
    opacity: grassy ? 0.32 : 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const nVeins = r < 1.2 ? 4 : r > 9 ? 9 : 6;
  const veinW = THREE.MathUtils.clamp(r * 0.095, 0.07, 0.95);
  for (let v = 0; v < nVeins; v += 1) {
    const vn = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.86, veinW), veinMat);
    vn.rotation.x = -Math.PI / 2;
    vn.rotation.z = padRot + (v / nVeins) * Math.PI + 0.07;
    vn.position.y = padH * 0.92 + lipH * 0.22;
    g.add(vn);
  }

  /** Radial pie-cut like many Nymphaea leaves. */
  const cut = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.88, r * 0.86, 0.05, 8, 1, false, 0.15, Math.PI * 1.72),
    new THREE.MeshStandardMaterial({
      color: grassy ? 0xa3bf8f : 0xb8e986,
      transparent: true,
      opacity: grassy ? 0.22 : 0.38,
    })
  );
  cut.position.y = padH * 0.78 + lipH * 0.12;
  cut.rotation.y = padRot + 0.94;
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
  /** Read as woody debris / drowned branch / fish body from chase cam silhouette. */
  const bark = new THREE.MeshStandardMaterial({
    color: COLORS.fish,
    roughness: 0.82,
    metalness: 0.03,
  });
  const barkDeep = bark.clone();
  barkDeep.color.multiplyScalar(0.74);
  barkDeep.roughness = 0.9;

  const moss = bark.clone();
  moss.color.lerp(new THREE.Color(0x4d6d48), 0.62);
  moss.color.multiplyScalar(0.94);
  moss.roughness = 0.92;

  const capR = THREE.MathUtils.clamp(Math.min(wid, ht) * 0.41, 0.11, ht * 0.48);
  const trunkStem = Math.max(len * 0.55, capR * 2.2 + 0.08);
  const radial = THREE.MathUtils.clamp(Math.floor(7 + len * 0.45), 6, 13);

  const trunk = new THREE.Mesh(
    new THREE.CapsuleGeometry(capR, trunkStem, 4, radial),
    bark
  );
  trunk.rotation.z = Math.PI / 2;
  trunk.position.x = -len * 0.02;
  trunk.castShadow = true;

  const snoutLen = len * 0.22;
  const snout = new THREE.Mesh(
    new THREE.CylinderGeometry(capR * 0.58, capR * 0.92, snoutLen, radial, 1),
    barkDeep
  );
  snout.rotation.z = Math.PI / 2;
  snout.position.x = len * 0.36;
  snout.castShadow = true;

  const tailMat = barkDeep.clone();
  tailMat.color.multiplyScalar(0.94);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(capR * 0.72, wid * 1.55, 5, 2), tailMat);
  tail.rotation.z = Math.PI / 2;
  tail.rotation.y = Math.PI * 0.19;
  tail.position.x = -len * 0.46;
  tail.castShadow = true;

  const stub = new THREE.Mesh(
    new THREE.CylinderGeometry(capR * 0.22, capR * 0.36, len * 0.14, 5, 1),
    moss
  );
  stub.rotation.order = "YXZ";
  stub.rotation.z = Math.PI / 2 + 0.48;
  stub.rotation.y = 0.55;
  stub.position.set(len * 0.02, capR * 0.42, wid * 0.36);
  stub.castShadow = true;

  const knot = new THREE.Mesh(
    new THREE.TorusGeometry(capR * 1.06, Math.max(capR * 0.11, 0.08), 4, Math.min(16, radial + 2)),
    barkDeep
  );
  knot.rotation.y = Math.PI / 2;
  knot.rotation.x = 0.12;
  knot.position.set(-len * 0.12, capR * 0.06, capR * 0.06);
  knot.castShadow = true;

  const grp = new THREE.Group();
  grp.add(trunk, snout, tail, stub, knot);
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
    roughness: 0.71,
    metalness: 0.08,
    emissive: 0x385666,
    emissiveIntensity: 0.068,
  });

  const ventral = new THREE.MeshStandardMaterial({
    color: COLORS.boatShell,
    roughness: 0.72,
    metalness: 0.12,
    emissive: 0x9ec8ea,
    emissiveIntensity: 0.052,
  });

  const legMat = new THREE.MeshStandardMaterial({
    color: COLORS.boatLeg,
    roughness: 0.68,
    metalness: 0.05,
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: COLORS.boatEye,
    roughness: 0.42,
    metalness: 0.14,
    emissive: 0x4a0810,
    emissiveIntensity: 0.06,
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
  seamMat.color = new THREE.Color(0x382d28);
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

/**
 * Beaded nematode chain in the water plane — serpentine motion via {@link advanceNematodeFoodAnim}.
 * Root {@link THREE.Group} is placed at the YAML pickup center; collision still uses that anchor.
 */
function nematodeFoodGroup() {
  const root = new THREE.Group();
  const palette = FOOD_PALETTE.nematode || FOOD_PALETTE.protozoa;
  const baseParams = {
    color: palette,
    roughness: 0.45,
    metalness: 0.06,
    emissive: 0x223344,
    emissiveIntensity: 0.04,
  };

  const nSeg = 9;
  /** @type {THREE.Mesh[]} */
  const segs = [];
  for (let i = 0; i < nSeg; i += 1) {
    const t = i / Math.max(nSeg - 1, 1);
    const rad = i === 0 ? 0.091 : THREE.MathUtils.lerp(0.084, 0.062, t);
    const geom = new THREE.SphereGeometry(rad, 10, 8);
    const smat = i === 0 ? new THREE.MeshStandardMaterial(baseParams) : segs[0].material.clone();
    const m = new THREE.Mesh(geom, smat);
    m.castShadow = true;
    root.add(m);
    segs.push(m);
  }

  const ang = Math.random() * Math.PI * 2;
  root.userData.nematodeAnimate = true;
  root.userData.nematodeSegs = segs;
  root.userData.nematodeDirX = Math.cos(ang);
  root.userData.nematodeDirZ = Math.sin(ang);
  root.userData.nematodePhase = Math.random() * Math.PI * 2;
  /** Lateral wiggle (world units) — keep large enough to read from chase cam. */
  root.userData.nematodeAmp = 0.22 + Math.random() * 0.092;
  root.userData.nematodeOmega = 4.85 + Math.random() * 2.2;
  root.userData.nematodeSpacing = 0.11;
  root.userData.nematodeTaper = 0.08;
  return root;
}

/** @type {THREE.Vector3} */
const _nemA = new THREE.Vector3();
/** @type {THREE.Vector3} */
const _nemY = new THREE.Vector3(0, 1, 0);

/**
 * @param {THREE.Group} group From {@link nematodeFoodGroup}
 * @param {number} elapsed Sim time (s)
 */
export function advanceNematodeFoodAnim(group, elapsed) {
  const segs = group.userData.nematodeSegs;
  if (!Array.isArray(segs) || segs.length < 2) return;

  const dx = group.userData.nematodeDirX ?? 1;
  const dz = group.userData.nematodeDirZ ?? 0;
  const px = -dz;
  const pz = dx;
  const phase = group.userData.nematodePhase ?? 0;
  const amp = group.userData.nematodeAmp ?? 0.26;
  const omega = group.userData.nematodeOmega ?? 5.2;
  /** Slow along-spine squirm so motion isn’t only a static standing wave. */
  const crawl = elapsed * 0.55;
  const spacing = group.userData.nematodeSpacing ?? 0.11;
  const taper = THREE.MathUtils.clamp(group.userData.nematodeTaper ?? 0.08, 0.03, 0.32);
  const n = segs.length;

  for (let i = 0; i < n; i += 1) {
    const u = i / Math.max(n - 1, 1);
    const along = i * spacing + crawl * 0.04;
    const wave =
      Math.sin(elapsed * omega + phase + i * 0.91 - crawl) +
      0.4 * Math.sin(elapsed * omega * -1.45 + phase + i * 1.14 + crawl * 1.2);
    const sway = amp * wave * (1 - u * taper);
    const lift =
      amp *
      0.55 *
      Math.cos(elapsed * omega * 1.02 + phase + i * 0.94 - crawl * 0.9) *
      (1 - u * 0.42);
    const x = dx * along + px * sway;
    const y = lift;
    const z = dz * along + pz * sway;
    segs[i].position.set(x, y, z);
  }

  for (let i = 0; i < n - 1; i += 1) {
    _nemA.subVectors(segs[i + 1].position, segs[i].position);
    if (_nemA.lengthSq() < 1e-10) continue;
    _nemA.normalize();
    if (Math.abs(_nemA.y) > 0.998) continue;
    segs[i].quaternion.setFromUnitVectors(_nemY, _nemA);
  }
  segs[n - 1].quaternion.copy(segs[n - 2].quaternion);
}

/**
 * @param {{ active?: boolean; type?: string }[]} foodArr `track.food`
 * @param {(THREE.Mesh | THREE.Group)[]} meshArr `foodMeshes`
 * @param {number} elapsed
 */
export function updateFoodPickupAnimations(foodArr, meshArr, elapsed) {
  if (!foodArr?.length || !meshArr?.length) return;
  const n = Math.min(foodArr.length, meshArr.length);
  for (let i = 0; i < n; i += 1) {
    const fd = foodArr[i];
    const m = meshArr[i];
    if (!fd?.active) continue;
    const typ = typeof fd.type === "string" ? fd.type.toLowerCase() : "";
    if (typ !== "nematode") continue;
    // Group with segment userData (not a plain pickup mesh)
    if (!(m && m.visible && m.userData?.nematodeAnimate && m.userData?.nematodeSegs)) continue;
    advanceNematodeFoodAnim(/** @type {THREE.Group} */ (m), elapsed);
  }
}

export function foodMesh(kind) {
  if (kind === "nematode") return nematodeFoodGroup();

  let geom;
  if (kind === "mosquito_larva") geom = new THREE.CapsuleGeometry(0.18, 0.88, 4, 8);
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

/** Ephemeral grazing “nibble” — warm emissive crumb that decays unread for a moment.
 * @param {number} [visualScale] world size multiplier (tiny crumbs for bursts).
 */
export function preyNibbleMesh(visualScale = 1) {
  const s = THREE.MathUtils.clamp(visualScale, 0.28, 1.45);
  const mat = new THREE.MeshStandardMaterial({
    color: COLORS.preyNibble,
    roughness: 0.42,
    metalness: 0.04,
    emissive: 0x8af5cf,
    emissiveIntensity: 0.52,
    transparent: true,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.24 * s, s <= 0.55 ? 0 : 1), mat);
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
 * Hostile larva grazing the swimmer’s hemolymph — Culicinae-style wriggler
 * silhouette: small head, swollen thorax, slender tapered abdomen + posterior respiratory siphon.
 */
export function predatorMozzieMesh() {
  const grp = new THREE.Group();

  /** World-scale readability on chase cam; mesh proportions are anatomical multiples below. */
  const SCALE = 2.45;
  grp.scale.setScalar(SCALE);

  const dorsalRough = new THREE.MeshStandardMaterial({
    color: COLORS.mozzieAbdomen,
    roughness: 0.55,
    metalness: 0.04,
    emissive: 0x2a1510,
    emissiveIntensity: 0.04,
  });

  const thoraxMat = dorsalRough.clone();
  thoraxMat.color = new THREE.Color(COLORS.mozzieThorax);
  thoraxMat.emissive = new THREE.Color(0x3a2820);

  const headMat = dorsalRough.clone();
  headMat.color = new THREE.Color(COLORS.mozzieHead);
  headMat.emissiveIntensity = 0.02;
  headMat.metalness = 0.05;

  const ventMat = dorsalRough.clone();
  ventMat.color = new THREE.Color(COLORS.mozzieVentrum);
  ventMat.emissiveIntensity = 0.03;

  const siphonMat = dorsalRough.clone();
  siphonMat.color = new THREE.Color(COLORS.mozzieSiphonChitin);
  siphonMat.roughness = 0.48;
  siphonMat.metalness = 0.08;

  /** Head capsule (+Z forward) ~ darker sclerotin. */
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), headMat);
  head.scale.set(0.94, 0.78, 1.06);
  head.position.set(0, 0.05, 0.56);

  /** Faint mouth-brush hints on ventral head (surface-filtering morphology). */
  const brushGrp = new THREE.Group();
  brushGrp.position.set(0, -0.11, 0.61);
  for (let b = -1; b <= 1; b += 1) {
    const bristle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.026, 0.18, 4, 1),
      headMat.clone()
    );
    bristle.material.color = new THREE.Color(COLORS.mozzieStripe).lerp(
      bristle.material.color,
      0.62
    );
    bristle.material.emissiveIntensity = 0;
    bristle.rotation.x = Math.PI * 2 * 0.23;
    bristle.rotation.z = b * 0.62;
    bristle.rotation.y = b * -0.12;
    bristle.position.set(b * 0.07, -0.04, -0.04);
    brushGrp.add(bristle);
  }

  /** Swollen thorax fused with abdomen base. */
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), thoraxMat);
  thorax.scale.set(1.06, 0.72, 0.94);
  thorax.position.set(0, 0.065, 0.24);

  const thoraxBulge = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), thoraxMat);
  thoraxBulge.scale.set(0.88, 0.58, 0.92);
  thoraxBulge.position.set(-0.04, -0.04, -0.02);

  /** Slender dorsiventrally flattened abdomen tapering aft. */
  const segCount = 8;
  const abdomenParts = [];
  for (let s = 0; s < segCount; s += 1) {
    const t = segCount <= 1 ? 0 : s / (segCount - 1);
    const sz = THREE.MathUtils.lerp(0.22, -0.58, t);
    const radiusXZ = THREE.MathUtils.lerp(0.2, 0.11, Math.pow(t, 0.72));
    const segMat = ventMat.clone();
    if (s % 2 === 0) segMat.color = new THREE.Color(COLORS.mozzieStripe).lerp(segMat.color, 0.42);
    const segMesh = new THREE.Mesh(new THREE.SphereGeometry(radiusXZ, 10, 8), segMat);
    segMesh.scale.set(1.12, 0.56, 0.58);
    segMesh.position.set(0, THREE.MathUtils.lerp(0.052, -0.02, t) + Math.sin(t * Math.PI) * 0.018, sz);
    abdomenParts.push(segMesh);
  }

  /** Posterior respiratory siphon — breathing trumpet on tail, dorsally angled. */
  const siphonLen = 0.52;
  const siphonStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.078, siphonLen, 10, 2),
    siphonMat
  );
  const backZ = -0.74;
  siphonStem.position.set(0, 0.1, backZ + 0.02);
  siphonStem.rotation.x = -Math.PI * 2 * 0.18;

  const siphonBell = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.09, 10, 1, false), siphonMat);
  siphonBell.rotation.z = Math.PI;
  const bellOff = Math.cos(siphonStem.rotation.x) * (siphonLen * 0.52);
  const bellLift = Math.sin(-siphonStem.rotation.x) * (siphonLen * 0.52);
  siphonBell.position.set(0, 0.1 + bellLift, backZ - 0.04 + bellOff);

  /** Waterline donut — surface-disturbance silhouette from chase cam. */
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
  wakeRing.scale.setScalar(1 / SCALE);
  grp.userData._mozzieWakeRingScaleXZ = wakeRing.scale.x;

  grp.userData.predWakeMat = wakeRing.material;
  grp.add(head, brushGrp, thorax, thoraxBulge, ...abdomenParts, siphonStem, siphonBell, wakeRing);

  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh) {
      const wm = /** @type {THREE.Mesh} */ (o);
      if (wm === wakeRing) return;
      wm.castShadow = true;
      wm.receiveShadow = true;
      wm.frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;

  const hpHud = createHpStripSprite(2.95, 0.62, 2.98);
  attachHpStripForScaledPredator(grp, SCALE, hpHud);

  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  grp.userData.mozzieRig = {
    head,
    thorax,
    thoraxBulge,
    abdomenSegments: abdomenParts,
    brushGrp,
    siphonStem,
    baseSiphonRotX: siphonStem.rotation.x,
    siphonBell,
    wakeRing,
  };

  /** Authoritative anatomical rotations for wriggle posing (advance clears these each pose pass). */
  for (const part of abdomenParts) part.userData.mozzieBaseRot = part.rotation.clone();
  thorax.userData.mozzieBaseRot = thorax.rotation.clone();
  thoraxBulge.userData.mozzieBaseRot = thoraxBulge.rotation.clone();
  head.userData.mozzieBaseRot = head.rotation.clone();

  return grp;
}

/**
 * Extreme attach / grapple motion on the larvae rig — thorax arcs, segmented abdomen thrashes,
 * anterior brushes bite at the swimmer’s plating.
 *
 * `attackBlend` drives intensity (1 = glued full-on; 0 = idle swimming).
 */
export function poseMosquitoLarvaAttack(grp, attackBlend, timeSec, navRollRad = 0, aimTargetWorld = null) {
  const rig = grp.userData?.mozzieRig;
  if (!rig) return;

  const a = THREE.MathUtils.clamp(attackBlend, 0, 1);
  const wr = timeSec * 22.4;
  const wr2 = timeSec * 15.2;
  const thr = Math.sin(wr2) * a * 0.31;
  const thr2 = Math.sin(wr + 1.42) * a * 0.42;

  if (rig.head?.userData?.mozzieBaseRot) rig.head.rotation.copy(rig.head.userData.mozzieBaseRot);
  /** Residual wriggle on the head; aim slerp below supplies the primary pitch toward prey. */
  rig.head.rotation.x += Math.sin(wr + 1.96) * 0.058 + a * 0.18;
  rig.head.rotation.z += Math.sin(wr2 * 1.06) * 0.22 * a + navRollRad * 0.18;
  rig.head.rotation.y += Math.sin(timeSec * 17.85) * 0.11 * a;

  /** Crane the head capsule onto the swimmer; mouth-forward is local +Z (brushes sit at +Z). */
  if (aimTargetWorld && rig.head?.parent) {
    rig.head.parent.updateMatrixWorld();
    _mozzieHeadWorld.setFromMatrixPosition(rig.head.matrixWorld);
    _mozzieAimDir.subVectors(aimTargetWorld, _mozzieHeadWorld);
    if (_mozzieAimDir.lengthSq() > 1e-6) {
      _mozzieAimDir.normalize();
      rig.head.parent.getWorldQuaternion(_mozzieParentQInv).invert();
      _mozzieAimDir.applyQuaternion(_mozzieParentQInv);
      _mozzieAimQ.setFromUnitVectors(MOZZIE_HEAD_FORWARD, _mozzieAimDir);
      rig.head.quaternion.slerp(_mozzieAimQ, a * 0.85);
    }
  }

  if (rig.thorax?.userData?.mozzieBaseRot) rig.thorax.rotation.copy(rig.thorax.userData.mozzieBaseRot);
  rig.thorax.rotation.x += a * (0.36 + thr);
  rig.thorax.rotation.y += thr2 * a * 0.35;
  rig.thorax.rotation.z += Math.cos(wr * 0.88) * 0.2 * a;

  if (rig.thoraxBulge?.userData?.mozzieBaseRot) rig.thoraxBulge.rotation.copy(rig.thoraxBulge.userData.mozzieBaseRot);
  rig.thoraxBulge.rotation.x += thr * 1.06 * a;

  rig.brushGrp.rotation.x = -a * (0.48 + Math.abs(Math.sin(wr * 1.82)) * 0.92);
  rig.brushGrp.rotation.z = Math.sin(wr * 2.06) * 0.48 * a;
  rig.brushGrp.rotation.y = Math.sin(timeSec * 33.25) * 0.28 * a;

  const segments = rig.abdomenSegments;
  if (Array.isArray(segments)) {
    for (let si = 0; si < segments.length; si += 1) {
      const seg = segments[si];
      if (!seg) continue;
      if (seg.userData?.mozzieBaseRot) seg.rotation.copy(seg.userData.mozzieBaseRot);
      const pg = si * 0.72;
      seg.rotation.x += Math.sin(wr2 + pg) * 0.26 * a;
      seg.rotation.y += Math.sin(wr * 0.95 + pg * 1.2) * 0.16 * a;
      seg.rotation.z += Math.cos(wr * 1.14 + pg) * 0.19 * a;
    }
  }

  const baseSR = typeof rig.baseSiphonRotX === "number" ? rig.baseSiphonRotX : -Math.PI * 2 * 0.18;
  rig.siphonStem.rotation.x = baseSR + Math.sin(wr * 1.12) * 0.55 * a;
  rig.siphonStem.rotation.y = Math.sin(timeSec * 28.85) * 0.22 * a;

  const wrRef = grp.userData?._mozzieWakeRingScaleXZ;
  if (rig.wakeRing && typeof wrRef === "number" && Number.isFinite(wrRef)) {
    rig.wakeRing.scale.setScalar(wrRef * THREE.MathUtils.lerp(1, 1.92, a));
  }
}

/** Scratch math objects for head-aim slerp; reused per-frame to avoid GC churn. */
const MOZZIE_HEAD_FORWARD = new THREE.Vector3(0, 0, 1);
const _mozzieHeadWorld = new THREE.Vector3();
const _mozzieAimDir = new THREE.Vector3();
const _mozzieParentQInv = new THREE.Quaternion();
const _mozzieAimQ = new THREE.Quaternion();
const _mozzieAimTarget = new THREE.Vector3();

const MOZZIE_ATTACH_PLAYER_RUN = 68;
/** Fallback if swimmer idles pinned — forces satiation & retreat. */
const MOZZIE_ATTACH_MAX_SEC = 18.5;
const MOZZIE_BACKOFF_SECONDS = 8.2;
const MOZZIE_LATCH_TAILBACK = 0.58;
const MOZZIE_ATTACH_STICK_SPEED_MUL = 2.08;
const MOZZIE_STALK_CHASE_MUL = 1.12;
const MOZZIE_HOME_PATROL_MUL = 0.88;
const MOZZIE_BACKOFF_CHASE_MUL = 0.52;

/** @typedef {{ mozziePhase?: number; mozzieAttachTravel?: number; mozzieAttachSec?: number; mozzieBackoffT?: number; _mozziePrevPX?: number; _mozziePrevPZ?: number }} MozzieLive */

/**
 * Hunger-state mosquito larva: patrols near home until prey enters aggression range, commits with a moderated chase,
 * “glues” aft of the keel for a bounded run, then backs off toward home again.
 */
export function advanceMosquitoLarvaTowardPlayer(
  grp,
  dt,
  playerRadius,
  playerX,
  playerY,
  playerZ,
  playerYaw,
  chaseSpeedBase,
  anchorX,
  anchorZ,
  engageRadiusSq,
  timeSec,
  damageKickRad,
  meleeHullR,
  playerDeadOrFinished,
  playerMarshConcealed,
  live /** @type {MozzieLive} */
) {
  const lx = grp.position.x;
  const lz = grp.position.z;
  const vx0 = playerX - lx;
  const vz0 = playerZ - lz;
  const distSq = vx0 * vx0 + vz0 * vz0;
  const dist = Math.sqrt(Math.max(distSq, 1e-10));

  if (playerMarshConcealed) {
    live.mozziePhase = 0;
    live.mozzieAttachTravel = 0;
    live.mozzieAttachSec = 0;
  }

  if (typeof live._mozziePrevPX !== "number") live._mozziePrevPX = playerX;
  if (typeof live._mozziePrevPZ !== "number") live._mozziePrevPZ = playerZ;
  const sw = Math.hypot(playerX - live._mozziePrevPX, playerZ - live._mozziePrevPZ);
  live._mozziePrevPX = playerX;
  live._mozziePrevPZ = playerZ;

  if (typeof live.mozziePhase !== "number") live.mozziePhase = 0;
  if (typeof live.mozzieAttachTravel !== "number") live.mozzieAttachTravel = 0;
  if (typeof live.mozzieBackoffT !== "number") live.mozzieBackoffT = 0;
  if (typeof live.mozzieAttachSec !== "number") live.mozzieAttachSec = 0;

  const latchR = playerRadius + Math.max(meleeHullR, 0.12) * 0.88 + 0.38;
  const latchSq = latchR * latchR;

  if (playerDeadOrFinished) {
    live.mozziePhase = 0;
    live.mozzieAttachTravel = 0;
    live.mozzieBackoffT = 0;
    live.mozzieAttachSec = 0;
  }

  let tx = playerX;
  let tz = playerZ;
  let speedMul = MOZZIE_STALK_CHASE_MUL;

  if (live.mozzieBackoffT > 0) {
    live.mozzieBackoffT = Math.max(0, live.mozzieBackoffT - dt);
    live.mozziePhase = 2;
    live.mozzieAttachSec = 0;
    const ph = grp.userData.idlePhase ?? 0;
    const bob = Math.sin(timeSec * 0.82 + ph) * 0.08;
    const bob2 = Math.cos(timeSec * 0.55 + ph * 1.31) * 0.075;
    tx = anchorX + bob;
    tz = anchorZ + bob2;
    speedMul = MOZZIE_BACKOFF_CHASE_MUL;
  } else if (live.mozziePhase === 1) {
    live.mozzieAttachSec += dt;
    live.mozzieAttachTravel += sw;
    const sn = Math.sin(playerYaw);
    const cs = Math.cos(playerYaw);
    tx = playerX - sn * MOZZIE_LATCH_TAILBACK;
    tz = playerZ - cs * MOZZIE_LATCH_TAILBACK;
    speedMul = MOZZIE_ATTACH_STICK_SPEED_MUL;
    if (
      live.mozzieAttachTravel >= MOZZIE_ATTACH_PLAYER_RUN ||
      live.mozzieAttachSec >= MOZZIE_ATTACH_MAX_SEC
    ) {
      live.mozziePhase = 2;
      live.mozzieBackoffT = MOZZIE_BACKOFF_SECONDS;
      live.mozzieAttachTravel = 0;
      live.mozzieAttachSec = 0;
      const ph = grp.userData.idlePhase ?? 0;
      tx = anchorX + Math.sin(timeSec * 0.82 + ph) * 0.08;
      tz = anchorZ + Math.cos(timeSec * 0.55 + ph * 1.31) * 0.075;
      speedMul = MOZZIE_BACKOFF_CHASE_MUL;
    }
  } else {
    /** Stalk — loaf near hatch until swimmer enters aggression bubble (`engageRadiusSq`). */
    live.mozziePhase = 0;
    live.mozzieAttachSec = 0;
    const ph = grp.userData.idlePhase ?? 0;
    const bobHome = Math.sin(timeSec * 0.82 + ph) * 0.065;
    const bobHome2 = Math.cos(timeSec * 0.55 + ph * 1.31) * 0.058;
    if (
      !playerMarshConcealed &&
      distSq <= engageRadiusSq &&
      !playerDeadOrFinished &&
      live.mozzieBackoffT <= 0
    ) {
      tx = playerX;
      tz = playerZ;
      speedMul = MOZZIE_STALK_CHASE_MUL;
      if (distSq < latchSq) {
        live.mozziePhase = 1;
        live.mozzieAttachTravel = 0;
        live.mozzieAttachSec = 0;
        const sn = Math.sin(playerYaw);
        const cs = Math.cos(playerYaw);
        tx = playerX - sn * MOZZIE_LATCH_TAILBACK;
        tz = playerZ - cs * MOZZIE_LATCH_TAILBACK;
        speedMul = MOZZIE_ATTACH_STICK_SPEED_MUL;
      }
    } else {
      tx = anchorX + bobHome;
      tz = anchorZ + bobHome2;
      speedMul = MOZZIE_HOME_PATROL_MUL;
    }
  }

  let wx = tx - lx;
  let wz = tz - lz;
  const wl = Math.hypot(wx, wz);

  const chaseSpeed = Math.max(Number(chaseSpeedBase) || 0, 0.08) * speedMul;
  let moved = wl > 1e-4;
  if (moved) {
    const step = Math.min(chaseSpeed * dt, wl);
    grp.position.x += (wx / wl) * step;
    grp.position.z += (wz / wl) * step;
    wx = wx / wl;
    wz = wz / wl;
    grp.rotation.y = -Math.atan2(wx, wz);
  }

  grp.rotation.order = "YXZ";
  const id = grp.userData.idlePhase ?? 0;

  /** Stronger visceral corkscrew whenever latched — damage kick still stacks. */
  const stalkNear01 = THREE.MathUtils.smoothstep(
    (latchR * 1.55 - dist) / Math.max(latchR * 0.88, 0.12),
    0,
    1
  );
  const attach01 = live.mozziePhase === 1 ? 1 : stalkNear01;
  const baseRoll =
    (moved ? Math.sin(timeSec * 10.5 + id) * 0.14 : Math.sin(timeSec * 7.25 + id) * 0.08) +
    attach01 * Math.sin(timeSec * 31.2 + id) * 0.22;
  const kick = typeof damageKickRad === "number" && Number.isFinite(damageKickRad) ? damageKickRad : 0;
  grp.rotation.z = baseRoll + kick;

  const aimY = Number.isFinite(playerY) ? playerY : grp.position.y;
  _mozzieAimTarget.set(playerX, aimY, playerZ);
  poseMosquitoLarvaAttack(grp, attach01, timeSec, grp.rotation.z * 0.35, _mozzieAimTarget);

  return moved;
}

/** Flatworm riff — S-curve ribbon gut, dorsal rose flush & eyespots, adhesive anterior disc & pharynx ring. */
export function predatorPlanarianMesh() {
  const grp = new THREE.Group();

  const SCALE = 2.62;
  grp.scale.setScalar(SCALE);

  const wormCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0.02, -0.02, -0.9),
      new THREE.Vector3(-0.08, -0.015, -0.46),
      new THREE.Vector3(0.05, -0.025, 0),
      new THREE.Vector3(-0.06, -0.015, 0.44),
      new THREE.Vector3(0.04, -0.02, 0.86),
      new THREE.Vector3(0.02, -0.028, 0.98),
    ],
    false,
    "catmullrom",
    0.38
  );

  const ventralSkin = new THREE.MeshStandardMaterial({
    color: COLORS.planarianVentral,
    roughness: 0.5,
    metalness: 0.025,
    emissive: 0xccb8cc,
    emissiveIntensity: 0.028,
  });
  const dorsal = new THREE.MeshStandardMaterial({
    color: COLORS.planarianPink,
    roughness: 0.34,
    metalness: 0.035,
    emissive: 0xaa2266,
    emissiveIntensity: 0.06,
  });

  const tubeMain = new THREE.TubeGeometry(wormCurve, 72, 0.088, 8, false);
  const ribbon = new THREE.Mesh(tubeMain, ventralSkin);
  ribbon.scale.set(1.2, 0.33, 1.05);

  const tubePink = new THREE.TubeGeometry(wormCurve, 56, 0.064, 6, false);
  const dorsalBand = new THREE.Mesh(tubePink, dorsal);
  dorsalBand.scale.set(1.14, 0.52, 1.02);
  dorsalBand.position.y = 0.046;

  const espMat = new THREE.MeshStandardMaterial({
    color: COLORS.planarianEyespot,
    roughness: 0.78,
    emissive: 0x331122,
    emissiveIntensity: 0.065,
    metalness: 0.1,
  });
  const tEyes = 0.9;
  const ptEyes = wormCurve.getPointAt(tEyes);
  const tan = wormCurve.getTangentAt(tEyes);
  const perp = new THREE.Vector3(-tan.z, 0, tan.x);
  const perLen = Math.hypot(perp.x, perp.z) || 1;
  perp.multiplyScalar(0.078 / perLen);
  const eyeLMesh = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), espMat);
  eyeLMesh.position.set(ptEyes.x + perp.x, ptEyes.y + 0.048, ptEyes.z + perp.z);
  const eyeRMesh = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 5), espMat);
  eyeRMesh.position.set(ptEyes.x - perp.x, ptEyes.y + 0.048, ptEyes.z - perp.z);

  const suckerTip = wormCurve.getPointAt(0.998);
  const headPivot = suckerTip.clone();
  headPivot.y += 0.024;

  /** Anterior disc + spit glow parented for look-at while firing. */
  const headAimGrp = new THREE.Group();
  headAimGrp.position.copy(headPivot);

  const sucker = new THREE.Mesh(new THREE.SphereGeometry(0.074, 10, 8), dorsal.clone());
  sucker.material.roughness = 0.28;
  sucker.scale.set(0.92, 0.42, 0.9);
  sucker.position.set(0, 0, 0);

  const pitPt = wormCurve.getPointAt(0.54);
  const pharynxPit = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.014, 8, 20), dorsal.clone());
  pharynxPit.material.color = new THREE.Color(0x4a2740);
  pharynxPit.material.emissiveIntensity = 0.02;
  pharynxPit.rotation.x = Math.PI / 2;
  pharynxPit.position.copy(pitPt.clone().add(new THREE.Vector3(0, -0.05, -0.01)));

  /** Pharynx / gland glow — toxin hint for ranged spitter reads. */
  const spitGlow = new THREE.Mesh(
    new THREE.RingGeometry(0.068, 0.14, 20),
    new THREE.MeshBasicMaterial({
      color: 0xff8fd8,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );
  spitGlow.rotation.x = -Math.PI / 2;
  const glowPt = wormCurve.getPointAt(0.84);
  spitGlow.position.set(
    glowPt.x + 0.08 - headPivot.x,
    glowPt.y - 0.02 - headPivot.y,
    glowPt.z + 0.02 - headPivot.z
  );
  spitGlow.scale.setScalar(1 / SCALE);

  headAimGrp.add(sucker, spitGlow);

  let headRefForward = wormCurve.getTangentAt(0.998).clone();
  if (headRefForward.lengthSq() < 1e-10) headRefForward = new THREE.Vector3(0, 0, 1);
  else headRefForward.normalize();

  grp.add(
    ribbon,
    dorsalBand,
    eyeLMesh,
    eyeRMesh,
    pharynxPit,
    headAimGrp
  );

  grp.userData.planarianRig = {
    headAimGrp,
    headRefForward,
  };

  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh && o.material && !Array.isArray(o.material)) {
      const m = /** @type {THREE.MeshStandardMaterial | THREE.MeshBasicMaterial} */ (o.material);
      const isGlow = "blending" in m && m.blending === THREE.AdditiveBlending;
      /** @type {THREE.Mesh} */ (o).frustumCulled = false;
      if (!isGlow) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    }
  });

  grp.userData.baseScale = SCALE;
  const hpHud = createHpStripSprite(2.45, 0.58, 2.94);
  attachHpStripForScaledPredator(grp, SCALE, hpHud);
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

const _planarianHeadWorld = new THREE.Vector3();
const _planarianAimDir = new THREE.Vector3();
const _planarianGrpQInv = new THREE.Quaternion();
const _planarianAimQ = new THREE.Quaternion();

/** Aim anterior sucker + spit glow at the swimmer (full blend while `aimBlend` → 1). */
export function posePlanarianHeadAim(grp, aimBlend, playerX, playerY, playerZ) {
  const rig = grp.userData?.planarianRig;
  if (!rig?.headAimGrp || !rig.headRefForward) return;
  const b = THREE.MathUtils.clamp(aimBlend, 0, 1);
  if (b <= 0.012) {
    rig.headAimGrp.quaternion.identity();
    return;
  }
  _planarianHeadWorld.copy(rig.headAimGrp.position);
  grp.localToWorld(_planarianHeadWorld);
  _planarianAimDir.set(playerX, playerY, playerZ).sub(_planarianHeadWorld);
  if (_planarianAimDir.lengthSq() < 1e-8) return;
  _planarianAimDir.normalize();
  grp.getWorldQuaternion(_planarianGrpQInv);
  _planarianGrpQInv.invert();
  _planarianAimDir.applyQuaternion(_planarianGrpQInv);
  _planarianAimQ.setFromUnitVectors(rig.headRefForward, _planarianAimDir);
  rig.headAimGrp.quaternion.slerp(_planarianAimQ, b * 0.94);
}

const PLANARIAN_RETREAT_SEC = 1.42;
const PLANARIAN_WAIT_MIN = 2.35;
const PLANARIAN_WAIT_RAND = 1.45;

/**
 * Planarian spitter locomotion: phase 0 = stalk like other grazers; 1 = snake retreat after a spit;
 * 2 = brief pause before re-engaging.
 */
export function advancePlanarianSpitterLocomotion(
  grp,
  dt,
  playerX,
  playerZ,
  chaseSpeed,
  anchorX,
  anchorZ,
  engageRadiusSq,
  timeSec,
  damageKickRad = 0,
  marshConceal = false,
  live
) {
  if (typeof live.planarianPhase !== "number") live.planarianPhase = 0;

  if (live.planarianPendingRetreat) {
    live.planarianPendingRetreat = false;
    live.planarianPhase = 1;
    live.planarianRetreatElapsed = 0;
    live.planarianSpitAimT = 0;
  }

  if (live.planarianPhase === 1) {
    live.planarianRetreatElapsed = (live.planarianRetreatElapsed ?? 0) + dt;
    const idle = grp.userData.idlePhase ?? 0;
    const baseSpd = Math.max(Number(chaseSpeed) || 0, 0.08) * 1.36;
    const w = Math.sin(timeSec * 8.65 + idle) * 0.52;
    const ca = Math.cos(w);
    const sa = Math.sin(w);
    const rdx = live.planarianRetreatDx ?? 0;
    const rdz = live.planarianRetreatDz ?? 1;
    const mx = rdx * ca - rdz * sa;
    const mz = rdx * sa + rdz * ca;
    const ml = Math.hypot(mx, mz) || 1;
    const ux = mx / ml;
    const uz = mz / ml;
    const step = baseSpd * dt;
    grp.position.x += ux * step;
    grp.position.z += uz * step;
    grp.rotation.y = -Math.atan2(ux, uz);
    grp.rotation.order = "YXZ";
    const baseRoll = Math.sin(timeSec * 10.8 + idle) * 0.19;
    const kick = typeof damageKickRad === "number" && Number.isFinite(damageKickRad) ? damageKickRad : 0;
    grp.rotation.z = baseRoll + kick;
    if (live.planarianRetreatElapsed >= PLANARIAN_RETREAT_SEC) {
      live.planarianPhase = 2;
      live.planarianWaitT = PLANARIAN_WAIT_MIN + Math.random() * PLANARIAN_WAIT_RAND;
      live.planarianRetreatElapsed = 0;
    }
    return;
  }

  if (live.planarianPhase === 2) {
    live.planarianWaitT = (live.planarianWaitT ?? 0) - dt;
    grp.rotation.order = "YXZ";
    const idle = grp.userData.idlePhase ?? 0;
    grp.rotation.z = Math.sin(timeSec * 7.1 + idle) * 0.07;
    if (live.planarianWaitT <= 0) {
      live.planarianPhase = 0;
      live.planarianWaitT = 0;
    }
    return;
  }

  advanceMozzieTowardPlayer(
    grp,
    dt,
    playerX,
    playerZ,
    chaseSpeed,
    anchorX,
    anchorZ,
    engageRadiusSq,
    timeSec,
    damageKickRad,
    marshConceal,
    1,
    null
  );
}

/**
 * Daphnid: periodic **dart bursts** toward the swimmer between brief loafing windows (reads faster than flat chase).
 */
export function advanceDaphnidChargerTowardPlayer(
  grp,
  dt,
  playerX,
  playerZ,
  chaseSpeed,
  anchorX,
  anchorZ,
  engageRadiusSq,
  timeSec,
  damageKickRad = 0,
  marshConceal = false,
  live
) {
  if (typeof live.daphBurstCd !== "number") live.daphBurstCd = 0.35 + Math.random() * 0.55;
  if (typeof live.daphBurstT !== "number") live.daphBurstT = 0;
  live.daphBurstCd -= dt;

  const lx = grp.position.x;
  const lz = grp.position.z;
  const vx = playerX - lx;
  const vz = playerZ - lz;
  const distSq = vx * vx + vz * vz;
  const engaged = !marshConceal && distSq <= engageRadiusSq && distSq > 1e-6;

  let speedScale = 1;
  if (engaged) {
    if (live.daphBurstT > 0) {
      live.daphBurstT -= dt;
      speedScale = 1.72;
    } else if (live.daphBurstCd <= 0 && distSq > 9 && distSq < engageRadiusSq * 0.92) {
      live.daphBurstT = 0.4 + Math.random() * 0.08;
      live.daphBurstCd = 2.05 + Math.random() * 0.75;
      speedScale = 1.72;
    } else {
      speedScale = distSq > 100 ? 0.92 : 1.06;
    }
  }

  advanceMozzieTowardPlayer(
    grp,
    dt,
    playerX,
    playerZ,
    chaseSpeed,
    anchorX,
    anchorZ,
    engageRadiusSq,
    timeSec,
    damageKickRad,
    marshConceal,
    speedScale,
    null
  );
}

/** Cladoceran riff — hinged bivalve carapace, rostral beak & paired antennae, brood-pocket read. */
export function predatorDaphnidMesh() {
  const grp = new THREE.Group();
  const SCALE = 2.5;
  grp.scale.setScalar(SCALE);

  const shellMat = new THREE.MeshStandardMaterial({
    color: COLORS.daphnidShell,
    roughness: 0.38,
    metalness: 0.045,
    transparent: true,
    opacity: 0.82,
    emissive: 0x226655,
    emissiveIntensity: 0.045,
    side: THREE.DoubleSide,
  });

  const vGeom = new THREE.SphereGeometry(0.43, 16, 12);
  const valveL = new THREE.Mesh(vGeom, shellMat);
  valveL.scale.set(0.48, 0.62, 0.93);
  valveL.rotation.set(-0.06, -0.14, -0.06);
  valveL.position.set(-0.16, 0.05, -0.04);
  const valveR = new THREE.Mesh(vGeom, shellMat);
  valveR.scale.set(valveL.scale.x, valveL.scale.y, valveL.scale.z);
  valveR.rotation.set(-0.06, 0.14, 0.06);
  valveR.position.set(-valveL.position.x, valveL.position.y, valveL.position.z);

  const dorsalStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.92), shellMat.clone());
  dorsalStripe.material.opacity = 0.55;
  dorsalStripe.material.color = new THREE.Color(0x1d6b5c);
  dorsalStripe.position.set(0, 0.2, -0.02);
  dorsalStripe.rotation.z = Math.PI / 2;

  const coreMat = new THREE.MeshStandardMaterial({
    color: COLORS.daphnidCore,
    roughness: 0.52,
    emissive: 0x44ddcc,
    emissiveIntensity: 0.1,
    metalness: 0.06,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), coreMat);
  core.scale.set(0.86, 0.44, 0.78);
  core.position.set(0.02, 0.045, -0.08);

  const rostrum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.055, 0.42, 6, 1),
    new THREE.MeshStandardMaterial({
      color: COLORS.daphnidRostrum,
      roughness: 0.28,
      metalness: 0.12,
      emissive: 0x226655,
      emissiveIntensity: 0.06,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  rostrum.rotation.x = Math.PI / 2;
  rostrum.rotation.z = Math.PI / 48;
  rostrum.position.set(0, 0.08, 0.72);

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x0a0408,
    roughness: 0.52,
    emissive: 0xffeeaa,
    emissiveIntensity: 0.18,
    metalness: 0.08,
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), eyeMat);
  eye.scale.set(1.06, 0.78, 0.96);
  eye.position.set(0, 0.14, 0.74);

  const corneaMat = new THREE.MeshStandardMaterial({
    color: 0xcfffff,
    roughness: 0.06,
    metalness: 0.42,
    transparent: true,
    opacity: 0.28,
    emissive: 0x88eeff,
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
  });
  const cornea = new THREE.Mesh(new THREE.SphereGeometry(0.069, 8, 6), corneaMat);
  cornea.scale.copy(eye.scale);
  cornea.position.copy(eye.position);
  cornea.position.z += 0.038;

  const legMat = new THREE.MeshStandardMaterial({
    color: COLORS.daphnidLeg,
    roughness: 0.62,
    metalness: 0.03,
    emissive: 0x224848,
    emissiveIntensity: 0.035,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  const antL = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.024, 0.74, 4, 2), legMat);
  antL.rotation.set(0.2, -0.18, Math.PI / 5.5);
  antL.position.set(0.2, 0.15, -0.06);
  const antR = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.024, 0.74, 4, 2), legMat);
  antR.rotation.set(0.2, 0.18, -Math.PI / 5.5);
  antR.position.set(-0.2, 0.15, -0.06);

  const broodMat = shellMat.clone();
  broodMat.color = new THREE.Color(0x5ec4b8);
  broodMat.opacity = 0.45;
  broodMat.emissiveIntensity = 0.07;
  const brood = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), broodMat);
  brood.scale.set(0.95, 0.52, 0.92);
  brood.position.set(0.04, -0.12, -0.32);

  const tailSpine = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.15, 4), legMat);
  tailSpine.rotation.x = -Math.PI / 2 - 0.24;
  tailSpine.position.set(0, 0.1, -0.74);

  grp.add(
    valveL,
    valveR,
    dorsalStripe,
    core,
    rostrum,
    eye,
    cornea,
    antL,
    antR,
    brood,
    tailSpine
  );

  grp.traverse((o) => {
    if ("isMesh" in o && o.isMesh && o.material && !Array.isArray(o.material)) {
      const m = /** @type {THREE.MeshStandardMaterial} */ (o.material);
      if (!m.blending || m.blending === THREE.NormalBlending) {
        /** @type {THREE.Mesh} */ (o).castShadow = true;
        /** @type {THREE.Mesh} */ (o).receiveShadow = true;
      }
      /** @type {THREE.Mesh} */ (o).frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;
  const hpHud = createHpStripSprite(1.78, 0.53, 2.74);
  attachHpStripForScaledPredator(grp, SCALE, hpHud);
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

/** Hydra riff — rooted pedal disk, tapered stalk, hypostome collar & dangling cnidocyte tentacles. */
export function predatorHydraPodMesh() {
  const grp = new THREE.Group();
  const SCALE = 3.2;
  grp.scale.setScalar(SCALE);

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: COLORS.hydraPedestal,
    roughness: 0.68,
    metalness: 0.035,
    emissive: 0x1a3528,
    emissiveIntensity: 0.04,
  });

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.272, 0.068, 14, 1), pedestalMat);
  foot.position.y = -0.334;

  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.14, 0.92, 10, 2), pedestalMat);
  stalk.position.y = 0;
  stalk.rotation.z = 0.11;

  const stemGlow = new THREE.MeshStandardMaterial({
    color: COLORS.hydraStem,
    roughness: 0.54,
    metalness: 0.05,
    emissive: COLORS.hydraGlow,
    emissiveIntensity: 0.07,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  });

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), stemGlow.clone());
  bulb.position.y = 0.52;
  bulb.scale.set(0.94, 0.52, 0.94);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.032, 8, 18), stemGlow.clone());
  collar.rotation.x = Math.PI / 2 - 0.18;
  collar.position.set(0, 0.32, -0.02);

  const mouthPit = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), pedestalMat.clone());
  mouthPit.material.color.setHex(0x0c1812);
  mouthPit.material.emissiveIntensity = 0;
  mouthPit.material.side = THREE.DoubleSide;
  mouthPit.rotation.x = -Math.PI / 2 + 0.06;
  mouthPit.position.set(0, 0.58, 0.06);

  const tentTipMat = new THREE.MeshStandardMaterial({
    color: COLORS.hydraNematocyst,
    roughness: 0.38,
    metalness: 0.05,
    emissive: 0xaaffff,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const tentShaftMat = new THREE.MeshStandardMaterial({
    color: COLORS.hydraTentacle,
    roughness: 0.54,
    metalness: 0.035,
    emissive: COLORS.hydraGlow,
    emissiveIntensity: 0.08,
    side: THREE.DoubleSide,
  });

  for (let ti = 0; ti < 5; ti += 1) {
    const beta = ti * Math.PI * 2 * 0.2 + 0.22;
    const rx = Math.cos(beta) * 0.32;
    const rz = Math.sin(beta) * 0.32 + 0.04;
    const base = new THREE.Vector3(rx, 0.36, rz);
    const mid = new THREE.Vector3(rx * 1.82, -0.12, rz * 1.72 + Math.sin(ti * 1.31) * 0.06);
    const tip = new THREE.Vector3(rx * 2.2, -0.58, rz * 2.08);
    const tCurve = new THREE.CatmullRomCurve3([base, mid, tip], false, "centripetal", 0.4);
    const tentGeo = new THREE.TubeGeometry(tCurve, 32, 0.036, 5, false);
    const tent = new THREE.Mesh(tentGeo, tentShaftMat);
    grp.add(tent);

    const tipPt = tCurve.getPointAt(1);
    const sting = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), tentTipMat.clone());
    sting.scale.set(0.86, 0.72, 0.88);
    sting.position.copy(tipPt);
    grp.add(sting);
  }

  grp.add(foot, stalk, bulb, collar, mouthPit);

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
  const hpHud = createHpStripSprite(2.25, 0.55, 2.94);
  attachHpStripForScaledPredator(grp, SCALE, hpHud);
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

/** Notonectid nymph riff — hemelytron wing-pads & dorsal keel, jointed cerci, wet corneal glare. */
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
  eyeMat.emissiveIntensity = 0.26;
  eyeMat.metalness = 0.08;

  const corneaEye = new THREE.MeshStandardMaterial({
    color: 0xe8f4ff,
    roughness: 0.06,
    metalness: 0.55,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    emissive: 0xffeedd,
    emissiveIntensity: 0.1,
    side: THREE.DoubleSide,
  });

  const accent = carapace.clone();
  accent.color = new THREE.Color(COLORS.scorpionAccent);

  const wingPadMat = accent.clone();
  wingPadMat.color = new THREE.Color(COLORS.scorpionWingPad);
  wingPadMat.roughness = 0.72;
  wingPadMat.metalness = 0.04;

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), accent);
  thorax.scale.set(0.48, 0.34, 0.94);
  thorax.position.set(0.02, 0.08, 0.72);

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), carapace);
  abdomen.scale.set(0.94, 0.38, 1.92);
  abdomen.position.set(0, 0.1, -0.74);

  /** Dorsal keel / midline reinforcement (weak-tail target reads dorsally). */
  const keelMat = accent.clone();
  keelMat.color = new THREE.Color(COLORS.scorpionKeel);
  keelMat.roughness = 0.64;
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 1.92), keelMat);
  keel.position.set(0.02, 0.275, -0.5);

  /** Hardened ovate wing cushions on hemelytron. */
  const wL = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), wingPadMat);
  wL.scale.set(0.92, 0.22, 1.06);
  wL.rotation.z = -0.18;
  wL.position.set(-0.52, 0.11, -0.28);
  const wR = wL.clone();
  wR.position.x *= -1;
  wR.rotation.z *= -1;

  const tailSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.176, 0.58, 6, 1), accent);
  tailSeg.rotation.x = -Math.PI / 2 + 0.36;
  tailSeg.position.set(-0.02, 0.09, -1.74);

  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 6, 1, false), accent);
  tailTip.rotation.x = -Math.PI / 2 + 0.2;
  tailTip.position.set(-0.02, 0.07, -2.18);

  const raptorialL = new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.42, 3, 6), accent);
  raptorialL.position.set(-0.34, -0.04, 0.95);
  raptorialL.rotation.set(0.24, -0.18, -0.6);
  const raptorialR = raptorialL.clone();
  raptorialR.position.x *= -1;
  raptorialR.rotation.z *= -1;
  raptorialR.rotation.y *= -1;

  /** Paddle-like rowing legs — exaggerated for chase-cam sillhouette. */
  const paddMat = accent.clone();
  paddMat.metalness = 0.04;
  paddMat.roughness = 0.5;
  const paddleL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.92), paddMat);
  paddleL.position.set(-0.46, -0.02, -1.06);
  paddleL.rotation.set(0.16, -0.22, -0.38);
  const paddleR = paddleL.clone();
  paddleR.position.x *= -1;
  paddleR.rotation.y *= -1;
  paddleR.rotation.z *= -1;

  const eyeBase = new THREE.SphereGeometry(0.11, 8, 6);
  const eyeL = new THREE.Mesh(eyeBase, eyeMat);
  eyeL.position.set(-0.18, 0.26, 1.14);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.18;

  const corGeom = new THREE.SphereGeometry(0.112, 8, 6);
  const cL = new THREE.Mesh(corGeom, corneaEye);
  cL.scale.copy(eyeL.scale);
  cL.position.copy(eyeL.position.clone().add(new THREE.Vector3(0, 0, 0.06)));
  const cR = cL.clone();
  cR.position.copy(eyeR.position.clone().add(new THREE.Vector3(0, 0, 0.06)));
  /** Skip shadow from thin corneal shells — avoids murky blobs on the keel. */
  cL.userData.skipEnemyShadow = true;
  cR.userData.skipEnemyShadow = true;

  grp.add(
    thorax,
    abdomen,
    keel,
    wL,
    wR,
    tailSeg,
    tailTip,
    raptorialL,
    raptorialR,
    paddleL,
    paddleR,
    eyeL,
    eyeR,
    cL,
    cR
  );

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
      if (o.userData.skipEnemyShadow) {
        o.frustumCulled = false;
        return;
      }
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });

  grp.userData.baseScale = SCALE;
  const hpHud = createHpStripSprite(3.4, 0.74, 3.72);
  attachHpStripForScaledPredator(grp, SCALE, hpHud);
  grp.userData.idlePhase = Math.random() * Math.PI * 2;
  return grp;
}

/**
 * Minute cladoceran micro-flock analogue — docile, no HUD; reads as jittery water fleas.
 * @returns {THREE.Group}
 */
export function daphniaFlockMemberMesh() {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshStandardMaterial({
    color: COLORS.daphnidShell,
    roughness: 0.41,
    metalness: 0.042,
    transparent: true,
    opacity: 0.74,
    emissive: 0x1a5c52,
    emissiveIntensity: 0.05,
    side: THREE.DoubleSide,
  });
  const bod = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), shellMat);
  bod.scale.set(1.05, 0.68, 1.26);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x040c10,
    roughness: 0.54,
    emissive: 0xffefb8,
    emissiveIntensity: 0.22,
    metalness: 0.07,
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 4), eyeMat);
  eye.position.set(0, 0.036, 0.132);

  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.54, 4, 1), shellMat.clone());
  ant.rotation.set(0.26, -0.11, Math.PI / 5.2);
  ant.position.set(0.1, 0.055, -0.02);
  const antR = ant.clone();
  antR.rotation.set(0.26, 0.11, -Math.PI / 5.2);
  antR.position.set(-0.1, 0.055, -0.02);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.15, 4), shellMat.clone());
  tail.rotation.x = -Math.PI / 2 - 0.18;
  tail.position.set(0, 0.016, -0.162);

  g.add(bod, eye, ant, antR, tail);

  g.traverse((o) => {
    if ("isMesh" in o && o.isMesh && o.material && !Array.isArray(o.material)) {
      o.castShadow = true;
      o.receiveShadow = true;
      /** @type {THREE.Mesh} */ (o).frustumCulled = false;
    }
  });
  return g;
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

/** Pursue target when closer than √engageRadiusSq; otherwise idle near anchor. Larva rolls toward motion.
 * @param {number} [speedScale] — multiplier on `chaseSpeed` (e.g. daphnid sprint burst).
 * @param {{ x: number; z: number } | null} [chaseOverride] — when engaged, steer toward this XZ instead of the player (waterscorpion strafe).
 */
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
  damageKickRad = 0,
  playerMarshConcealed = false,
  speedScale = 1,
  chaseOverride = null
) {
  const lx = grp.position.x;
  const lz = grp.position.z;

  let tx = anchorX;
  let tz = anchorZ;
  const vx = playerX - lx;
  const vz = playerZ - lz;
  if (!playerMarshConcealed && vx * vx + vz * vz <= engageRadiusSq) {
    if (
      chaseOverride &&
      Number.isFinite(chaseOverride.x) &&
      Number.isFinite(chaseOverride.z)
    ) {
      tx = chaseOverride.x;
      tz = chaseOverride.z;
    } else {
      tx = playerX;
      tz = playerZ;
    }
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
  const spdMul = Number.isFinite(speedScale) ? THREE.MathUtils.clamp(speedScale, 0.18, 3.2) : 1;
  if (moved) {
    const step = Math.min(Math.max(Number(chaseSpeed) || 0, 0) * spdMul * dt, wl);
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
