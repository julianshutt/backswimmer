import yaml from "js-yaml";

const DEFAULT_META = {
  name: "Untitled pond",
  laps: 3,
};

function metaScore(md, srcRoot = {}) {
  const m = md && typeof md === "object" ? md : {};

  const out = {
    ...DEFAULT_META,
    ...m,
  };

  out.laps = Math.max(1, Number(out.laps) || DEFAULT_META.laps);
  out.allFoodClearBonus = clampNumScore(
    m.allFoodClearBonus ?? m.buffetBonus ?? srcRoot.allFoodClearBonus,
    520,
    0,
    500000
  );
  out.lapScoreBonus = clampNumScore(m.lapScoreBonus ?? m.pointsPerLap ?? srcRoot.lapScoreBonus, 230, 0, 500000);

  /** When false, aqua spline + buoy gates are omitted (procedural exploratory pond). Default on. */
  out.courseRibbon = m.courseRibbon !== false;

  return out;
}

function clampNumScore(v, fallback, lo, hi) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = fallback;
  return Math.min(hi, Math.max(lo, n));
}

function optionalPoints(v, lo = 5, hi = 20000) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

const DEFAULT_SPAWN = {
  position: [0, 0.35, 0],
  yawDeg: 0,
};

export async function loadTrack(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load track (${res.status}) ${url}`);
  }
  const text = await res.text();
  const data = yaml.load(text);
  return mergeTrackDefaults(data);
}

export function mergeTrackDefaults(raw) {
  const src = raw && typeof raw === "object" ? raw : {};

  const metadata = metaScore(src.metadata, src);

  const spawn = { ...DEFAULT_SPAWN, ...(src.spawn || {}) };
  spawn.position = vec3(spawn.position, DEFAULT_SPAWN.position);
  spawn.yawDeg = Number(spawn.yawDeg ?? DEFAULT_SPAWN.yawDeg);

  const checkpoints = Array.isArray(src.checkpoints)
    ? src.checkpoints.map((c, i) => ({
        index: i,
        position: vec3(c.position, [0, 0.35, -20 * (i + 1)]),
        radius: clampNum(c.radius, 8, 1, 40),
      }))
    : [];

  const obstacles = src.obstacles && typeof src.obstacles === "object" ? src.obstacles : {};

  const lilies = normList(obstacles.lilies).map((o) => ({
    kind: "lily",
    position: xz(o.position),
    radius: clampNum(o.radius, 3, 0.35, 24),
    y: num(o.position?.[1], 0),
  }));

  const bubbles = normList(obstacles.bubbles).map((o) => ({
    kind: "bubble",
    position: xz(o.position),
    radius: clampNum(o.radius, 3.5, 0.8, 20),
    slowFactor: clampNum(o.slowFactor, 0.55, 0.08, 0.98),
    y: num(o.position?.[1], 0),
  }));

  const fish = normList(obstacles.fish).map((o) => ({
    kind: "fish",
    position: xz(o.position),
    y: num(o.position?.[1], 0.2),
    length: clampNum(o.length, 4, 0.5, 30),
    width: clampNum(o.width, 1, 0.2, 6),
    height: clampNum(o.height, 0.45, 0.1, 4),
    speed: clampNum(o.speed, 4, 0.1, 25),
    patrol: normPairs(o.patrol, [
      xz(o.position),
      [xz(o.position)[0] + 18, xz(o.position)[1] - 10],
    ]),
  }));

  const racerInputs = [
    ...normList(obstacles.racers),
    ...normList(obstacles.rivals),
    ...normList(obstacles.npcs),
    ...normList(src.rivals),
    ...normList(src.npcs),
  ];

  const racers = racerInputs.map((o) => ({
    kind: "racer",
    position: xz(o.position),
    y: num(o.position?.[1], 0.35),
    speed: clampNum(o.speed, 3.5, 0.2, 20),
    turnSmooth: clampNum(o.turnSmooth, 0.08, 0.01, 0.35),
    path: normPairs(o.path, [
      xz(o.position),
      [xz(o.position)[0] + 22, xz(o.position)[1]],
    ]),
    hullHex: parseHexColor(o.hullHex ?? o.hull_hex),
    hue: racerHueDeg(o.hue),
    heading: undefined,
    pathIndex: 0,
    x: xz(o.position)[0],
    z: xz(o.position)[1],
  }));

  const ripples = normList(obstacles.ripples).map((o) => ({
    kind: "ripple",
    position: xz(o.position),
    radius: clampNum(o.radius, 8, 1, 40),
    slowFactor: clampNum(o.slowFactor, 0.65, 0.08, 0.99),
    pulseSpeed: clampNum(o.pulseSpeed, 1.1, 0.05, 5),
    y: num(o.position?.[1], 0),
    phase: Math.random() * Math.PI * 2,
  }));

  const predatorInputs = [...normList(obstacles.predators), ...normList(obstacles.baddies)];

  /** Hostile creatures (≠ edible `food`; e.g. parasitic mosquito larvae). */
  const predators = predatorInputs.map((o, i) => normalizePredator(o, i));

  const daphniaFlocks = normalizeDaphniaFlocks(obstacles);

  const food = normList(src.food).map((f, i) => ({
    id: `${i}:${f?.type}`,
    type: typeof f?.type === "string" ? f.type : "protozoa",
    active: true,
    position: vec3(f.position, [0 + (i % 5) * 3, 0.35, -8 - i * 6]),
    radius: 0.85,
    stacks: clampNum(f.stacks ?? f.bonus ?? f.bonusSlots, 1, 1, 5),
    pointValue: optionalPoints(f.points ?? f.score),
    color: FOOD_PALETTE[f.type] || FOOD_PALETTE.protozoa,
  }));

  return {
    metadata,
    spawn,
    checkpoints,
    lilies,
    bubbles,
    fish,
    racers,
    ripples,
    predators,
    daphniaFlocks,
    food,
  };
}

/** @param {unknown} rawList */
function normalizeWeakSpots(rawList) {
  return normList(rawList).map((w, si) => {
    const rw = w && typeof w === "object" ? w : {};
    const off = vec3(rw.offset ?? rw.local ?? rw.position, [0, 0.06, 0]);
    const keyRaw = rw.key;
    const key = typeof keyRaw === "string" && keyRaw.trim() ? keyRaw.trim() : `spot${si}`;
    const rSpot = clampNum(rw.radius ?? rw.r ?? 0.45, 0.45, 0.06, 2.6);
    const vul = clampNum(rw.venomVulnerability ?? rw.vulnMult ?? 1, 1, 0.35, 2.75);
    return { key, offset: off, radius: rSpot, venomVulnerability: vul };
  });
}

/** @param {unknown} raw */
function normalizePredatorRanged(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  return {
    damage: clampNum(r.damage ?? 11, 11, 0, 140),
    cooldown: clampNum(r.cooldownSec ?? r.cooldown ?? 2.08, 2.08, 0.42, 24),
    maxRange: clampNum(r.maxRange ?? r.range ?? 17.5, 17.5, 2.2, 95),
    projectileSpeed: clampNum(r.projectileSpeed ?? r.speed ?? 11, 11, 0.4, 48),
    projectileRadius: clampNum(r.projectileRadius ?? r.projRadius ?? 0.34, 0.34, 0.075, 2.35),
    leadBias: clampNum(r.leadBias ?? r.leading ?? 0.85, 0.85, 0, 2.75),
    colorHex: parseHexColor(r.colorHex ?? r.color) ?? null,
  };
}

const WEAK_SCORPION_PRESET_RAW = [
  { key: "eye_l", offset: [-0.145, 0.2, 1.06], radius: 0.32 },
  { key: "eye_r", offset: [0.145, 0.2, 1.06], radius: 0.32 },
  { key: "tail", offset: [0.0, 0.12, -1.48], radius: 0.5 },
];

/** Kill score defaults per grazer/analogue kind (`points`/`score` in YAML overrides). */
export const PRESET_PREDATOR_KILL_POINTS = {
  mosquito_larva: 52,
  planarian_spitter: 138,
  daphnid_charger: 74,
  hydra_pod: 172,
  waterscorpion_tank: 340,
  /** Unknown kinds reuse this unless YAML sets `points`/`score`. */
  default: 58,
};

/** Fallback preset per `kind` — YAML fields override clamps / extend weak spots / ranged blobs. */
const PRED_KIND_DEFAULTS = {
  mosquito_larva: {
    radius: 0.58,
    hp: 2,
    damage: 11,
    biteIntervalSec: 0.98,
    engageRadius: 36,
    chaseSpeed: 5.15,
    venomSusceptibility: 1,
    shellContactBleed: null,
    visualMultiplier: 1,
    ranged: null,
    weakSpots: [],
  },
  /** Planarian that harpoons toxin globs — chases calmly, bites lightly. */
  planarian_spitter: {
    radius: 0.62,
    hp: 3,
    damage: 4,
    biteIntervalSec: 1.32,
    engageRadius: 22,
    chaseSpeed: 2.02,
    venomSusceptibility: 1.08,
    shellContactBleed: 3.5,
    visualMultiplier: 1,
    ranged: {
      damage: 9.5,
      cooldownSec: 2.05,
      maxRange: 17.25,
      projectileSpeed: 11.25,
      projectileRadius: 0.245,
      leadBias: 0.92,
    },
    weakSpots: [],
  },
  /** Darting cladoceran grazer analogue — spongy hull, no armour gimmick. */
  daphnid_charger: {
    radius: 0.44,
    hp: 1,
    damage: 5.5,
    biteIntervalSec: 0.86,
    engageRadius: 26,
    chaseSpeed: 4.06,
    venomSusceptibility: 0.98,
    shellContactBleed: null,
    visualMultiplier: 0.94,
    ranged: null,
    weakSpots: [],
  },
  /** Rooted polyp analogue — negligible melee, rhythmic stingers. */
  hydra_pod: {
    radius: 0.68,
    hp: 4,
    damage: 0,
    biteIntervalSec: 8,
    engageRadius: 24,
    chaseSpeed: 0.94,
    venomSusceptibility: 1.12,
    shellContactBleed: 0,
    visualMultiplier: 1,
    ranged: {
      damage: 14.25,
      cooldownSec: 2.42,
      maxRange: 18.85,
      projectileSpeed: 9.95,
      projectileRadius: 0.52,
      leadBias: 0.74,
    },
    weakSpots: [],
  },
  /** Larger notonectid nymph analogue — plating shrugs venom except eyes/tail hinge. */
  waterscorpion_tank: {
    radius: 1.32,
    hp: 14,
    damage: 16.5,
    biteIntervalSec: 0.86,
    engageRadius: 24,
    chaseSpeed: 1.94,
    venomSusceptibility: 0.78,
    shellContactBleed: 5.5,
    visualMultiplier: 1,
    ranged: null,
    weakSpots: WEAK_SCORPION_PRESET_RAW,
  },
};

/** Tiny fleeing cladoceran flocks — splash converts to nibbles. */
function normalizeDaphniaFlocks(obstacles) {
  const list = [...normList(obstacles?.daphnia), ...normList(obstacles?.daphnia_flocks)];
  const dk = {
    count: 8,
    spread: 3.3,
    fleeSpeed: 6.82,
    scareRadius: 15,
    bodyRadius: 0.34,
    separationRadius: 0.62,
    cohesionWeight: 0.48,
    separationWeight: 2.08,
    nibbleHealPer: 11,
    splashHitRadius: 3.05,
    pointValuePer: 26,
  };
  return list.map((raw, fi) => {
    const r = raw && typeof raw === "object" ? raw : {};
    const pos = vec3(r.position, [fi * 1.92 - 1, 0.32, -20 - fi * 4.8]);
    return {
      position: [...pos],
      count: clampNum(r.count ?? r.flockSize ?? r.members ?? r.n, dk.count, 3, 22),
      spread: clampNum(r.spread ?? r.radius ?? r.cluster, dk.spread, 0.75, 16),
      fleeSpeed: clampNum(r.fleeSpeed, dk.fleeSpeed, 2, 17),
      scareRadius: clampNum(r.scareRadius, dk.scareRadius, 4, 50),
      bodyRadius: clampNum(r.bodyRadius, dk.bodyRadius, 0.14, 0.95),
      separationRadius: clampNum(r.separationRadius, dk.separationRadius, 0.22, 1.95),
      cohesionWeight: clampNum(r.cohesionWeight, dk.cohesionWeight, 0, 2.85),
      separationWeight: clampNum(r.separationWeight, dk.separationWeight, 0, 7),
      nibbleHealPer: clampNum(r.nibbleHealPer ?? r.nibbleHeal ?? r.heal ?? r.healEach, dk.nibbleHealPer, 1, 48),
      splashHitRadius: clampNum(r.splashHitRadius ?? r.smashRadius, dk.splashHitRadius, 1.3, 8.8),
      pointValuePer: clampNum(
        r.pointValuePer ?? r.points ?? r.pointValue ?? r.scorePer,
        dk.pointValuePer,
        0,
        500000
      ),
    };
  });
}

/** Unknown kinds still hydrate as chunky grazers — keeps YAML exploratory. */
const PRED_FALLBACK_KIND = {

  radius: 0.66,
  hp: 2,
  damage: 9.5,
  biteIntervalSec: 1.2,
  engageRadius: 14.5,
  chaseSpeed: 2.42,
  venomSusceptibility: 1,
  shellContactBleed: null,
  visualMultiplier: 1,
  ranged: null,
  weakSpots: [],
};

/** @param {number} idx */
function normalizePredator(o, idx) {
  const raw = o && typeof o === "object" ? o : {};
  const typ = typeof raw.type === "string" && raw.type.trim() ? raw.type.trim() : "mosquito_larva";
  const pos = vec3(raw.position, [(idx % 4) * 4 - 2, 0.32, -20 - idx * 5]);
  const preset = PRED_KIND_DEFAULTS[typ] ?? PRED_FALLBACK_KIND;
  const killPtsFallback =
    (typ && PRESET_PREDATOR_KILL_POINTS[typ]) ?? PRESET_PREDATOR_KILL_POINTS.default;

  /** `weakSpots: []` clears inherited defaults; omission keeps preset weak spots on armoured kinds. */
  let weakNorm;
  if (Object.prototype.hasOwnProperty.call(raw, "weakSpots")) {
    weakNorm = normalizeWeakSpots(raw.weakSpots);
  } else if (preset.weakSpots.length) {
    weakNorm = normalizeWeakSpots(preset.weakSpots);
  } else {
    weakNorm = [];
  }

  let rangedOut = null;
  if (Object.prototype.hasOwnProperty.call(raw, "rangedAttack") || Object.prototype.hasOwnProperty.call(raw, "ranged")) {
    const rSrc = raw.rangedAttack ?? raw.ranged;
    if (rSrc === false || rSrc === null) rangedOut = null;
    else rangedOut = normalizePredatorRanged(rSrc ?? {});
  } else {
    rangedOut = preset.ranged && typeof preset.ranged === "object" ? normalizePredatorRanged(preset.ranged) : null;
  }

  const vm = clampNum(raw.visualMultiplier ?? raw.meshScale ?? raw.scale ?? preset.visualMultiplier, preset.visualMultiplier, 0.32, 3.95);

  const shellRaw = raw.shellContactBleed ?? raw.shellBleed ?? raw.armourBleed ?? preset.shellContactBleed;

  /** Parasitic scrape damage when brushing armoured plating (usually only when `weakSpots` constrain vitals — set 0 to disable). */
  let shellBleed = 0;
  if (typeof shellRaw === "number" && Number.isFinite(shellRaw)) shellBleed = clampNum(shellRaw, 0, 0, 70);
  else if (preset.shellContactBleed != null && Number.isFinite(preset.shellContactBleed))
    shellBleed = clampNum(preset.shellContactBleed, 0, 0, 70);

  return {
    kind: typ,
    id: `${idx}:${typ}`,
    position: [...pos],
    radius: clampNum(raw.radius ?? raw.bodyRadius, preset.radius, 0.3, 2.95),
    hp: clampNum(raw.hp ?? raw.health, preset.hp, 1, 85),
    damage: clampNum(raw.damage ?? raw.biteDamage, preset.damage, 0, 95),
    biteIntervalSec: clampNum(raw.biteIntervalSec ?? raw.biteInterval, preset.biteIntervalSec, 0.25, 10),
    engageRadius: clampNum(raw.engageRadius, preset.engageRadius, 2.2, 68),
    chaseSpeed: clampNum(raw.chaseSpeed, preset.chaseSpeed, 0.06, 15),
    venomSusceptibility: clampNum(raw.venomSusceptibility ?? 1, preset.venomSusceptibility, 0.2, 5.75),
    visualMultiplier: vm,
    weakSpots: weakNorm,
    rangedAttack: rangedOut,
    shellContactBleed: shellBleed,
    pointValue: clampNum(
      raw.points ?? raw.pointValue ?? raw.score ?? killPtsFallback,
      killPtsFallback,
      0,
      999999
    ),
  };
}

export const FOOD_PALETTE = {
  protozoa: 0xfff2a8,
  nematode: 0xff8866,
  mosquito_larva: 0x88ffcc,
};

function normList(x) {
  return Array.isArray(x) ? x : [];
}

function vec3(v, fallback) {
  if (!Array.isArray(v) || v.length < 3) return [...fallback];
  return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])];
}

function xz(p) {
  if (!Array.isArray(p)) return [0, 0];
  return [num(p[0], 0), num(p[2], 0)];
}

function num(v, fb) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function clampNum(v, fb, lo, hi) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = fb;
  return Math.min(hi, Math.max(lo, n));
}

function normPairs(points, fb) {
  if (!Array.isArray(points) || points.length === 0) return fb.map(([ax, az]) => [num(ax, 0), num(az, 0)]);
  return points.map((pt) => {
    if (!Array.isArray(pt) || pt.length < 2) return [0, 0];
    return [num(pt[0], 0), num(pt[1], 0)];
  });
}

function parseHexColor(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  return Number.parseInt(m[1], 16);
}

function racerHueDeg(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}
