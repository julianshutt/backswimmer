function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Playable extents — inside pond rim used by reed field (`half ≈ 258`). */
const POND_LIM = 236;
/** Core race loop stays inside this softer box so gates read clearly vs sky line. */
const CORE_LIM = 198;

/** @param {(n:number)=>number} r */
function rRange(r, lo, hi) {
  return lo + r() * (hi - lo);
}

/** @param {(n:number)=>number} r */
function rInt(r, loInclusive, hiInclusive) {
  return loInclusive + Math.floor(r() * (hiInclusive - loInclusive + 1));
}

/** @typedef {{ x: number; z: number; r: number }} ExclDisk */

/** @param {number} x
 * @param {number} z
 * @param {number} rad
 * @param {ExclDisk[]} discs
 */
function clearOfDiscs(x, z, rad, discs) {
  for (const d of discs) {
    const dx = x - d.x;
    const dz = z - d.z;
    if (dx * dx + dz * dz < (rad + d.r) ** 2 * 0.999) return false;
  }
  return true;
}

/** @param {{ x:number; z:number; r:number; kind?: string }} disk */
function pushExcl(arr, disk) {
  arr.push({ x: disk.x, z: disk.z, r: disk.r });
}

const PREDATOR_KINDS_WEIGHTED = [
  ["mosquito_larva", 0.4],
  ["daphnid_charger", 0.26],
  ["planarian_spitter", 0.16],
  ["hydra_pod", 0.12],
  ["waterscorpion_tank", 0.06],
];

/** @param {(n:number)=>number} rand */
function pickPredKind(rand) {
  let u = rand();
  for (const [k, w] of PREDATOR_KINDS_WEIGHTED) {
    u -= w;
    if (u <= 0) return k;
  }
  return "mosquito_larva";
}

const FOOD_TYPES = ["protozoa", "nematode", "mosquito_larva"];

/**
 * Produce a YAML-shaped root consumed by {@link mergeTrackDefaults}.
 *
 * @param {number} [seedOpt] deterministic when set; omit → based on coarse wall clock (still passed from Game).
 */
export function generateProceduralTrackRaw(seedOpt) {
  const seed =
    typeof seedOpt === "number" && Number.isFinite(seedOpt)
      ? seedOpt >>> 0
      : (Date.now() ^ (Math.floor(Math.random() * 0x100000000) >>> 0)) >>> 0;
  const rand = mulberry32(seed >>> 0);

  /** @type {ExclDisk[]} */
  const excl = [];

  const laps = rInt(rand, 2, 4);
  const nCp = rInt(rand, 5, 8);
  const rxEllipse = rRange(rand, 78, 128);
  const rzEllipse = rRange(rand, 92, 152);
  const theta0 = rRange(rand, 0, Math.PI * 2);

  /** @type {{ position: number[]; radius: number }[]} */
  const cpRaw = [];
  for (let i = 0; i < nCp; i += 1) {
    const frac = i / nCp;
    const ang = theta0 + frac * Math.PI * 2 + (rand() - 0.5) * 0.11;
    let x = Math.cos(ang) * rxEllipse + (rand() - 0.5) * 8;
    let z = Math.sin(ang) * rzEllipse + (rand() - 0.5) * 8;
    x = Math.min(POND_LIM, Math.max(-POND_LIM, x));
    z = Math.min(POND_LIM, Math.max(-POND_LIM, z));

    cpRaw.push({
      position: [x, 0.35, z],
      radius: rRange(rand, 7.5, 11.8),
    });
  }

  const sx = rRange(rand, -22, 22);
  const sz = rRange(rand, 28, 86);
  const spawnPos = /** @type {[number, number, number]} */ ([sx, 0.35, sz]);

  pushExcl(excl, { x: sx, z: sz, r: 24 });

  for (const c of cpRaw) {
    pushExcl(excl, {
      x: c.position[0],
      z: c.position[2],
      r: c.radius + 7,
    });
  }

  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < cpRaw.length; i += 1) {
    const c = cpRaw[i];
    const d = Math.hypot(c.position[0] - sx, c.position[2] - sz);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  /** Rotate so checkpoint 0 is the closest gate — lap order preserved. */
  const orderedCp = [...cpRaw.slice(bestI), ...cpRaw.slice(0, bestI)];

  const first = orderedCp[0];
  const dx = first.position[0] - sx;
  const dz = first.position[2] - sz;
  const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;

  /** Scattered lily pads — avoid hull / ribbon spine. */
  const nLilies = rInt(rand, 7, 19);
  const lilies = [];
  for (let k = 0; k < nLilies && k < 560; k += 1) {
    let x = 0;
    let z = 0;
    let ok = false;
    for (let t = 0; t < 90; t += 1) {
      x = rRange(rand, -CORE_LIM * 0.96, CORE_LIM * 0.96);
      z = rRange(rand, -CORE_LIM * 0.96, CORE_LIM * 0.96);
      const rad = rRange(rand, 2.35, 3.95);
      if (!clearOfDiscs(x, z, rad + 2.8, excl)) continue;
      ok = true;
      lilies.push({ position: [x, rand() > 0.55 ? -0.04 : -0.12, z], radius: rad });
      pushExcl(excl, { x, z, r: rad + 4.4 });
      break;
    }
    if (!ok) continue;
  }

  /** Slow patches. */
  const nBubbles = rInt(rand, 2, 7);
  const bubbles = [];
  for (let k = 0; k < nBubbles && k < 120; k += 1) {
    for (let t = 0; t < 70; t += 1) {
      const x = rRange(rand, -CORE_LIM * 0.88, CORE_LIM * 0.88);
      const z = rRange(rand, -CORE_LIM * 0.88, CORE_LIM * 0.88);
      const br = rRange(rand, 3.2, 7.8);
      if (!clearOfDiscs(x, z, br + 3.5, excl)) continue;
      bubbles.push({
        position: [x, rand() > 0.5 ? 0 : -0.15, z],
        radius: br,
        slowFactor: rRange(rand, 0.45, 0.62),
      });
      pushExcl(excl, { x, z, r: br + 8 });
      break;
    }
  }

  /** Drift-log fish patrols across open water. */
  const fish = [];
  const nFish = rInt(rand, 3, 7);
  for (let fi = 0; fi < nFish; fi += 1) {
    let placed = false;
    for (let t = 0; t < 70 && !placed; t += 1) {
      const ax = rRange(rand, -CORE_LIM * 0.75, CORE_LIM * 0.75);
      const az = rRange(rand, -CORE_LIM * 0.75, CORE_LIM * 0.75);
      const lenEst = rRange(rand, 32, 86);
      if (!clearOfDiscs(ax, az, Math.max(lenEst * 0.28, 12), excl)) continue;
      const bx = Math.min(POND_LIM * 0.88, Math.max(-POND_LIM * 0.88, ax + rRange(rand, -lenEst, lenEst)));
      const bz = Math.min(POND_LIM * 0.88, Math.max(-POND_LIM * 0.88, az + rRange(rand, -lenEst, lenEst)));

      fish.push({
        position: [ax, 0.22, az],
        length: rRange(rand, 4.2, 6.8),
        width: rRange(rand, 0.9, 1.35),
        height: rRange(rand, 0.38, 0.52),
        speed: rRange(rand, 3.6, 5.2),
        patrol: [
          [ax, az],
          [bx, bz],
        ],
      });
      pushExcl(excl, { x: ax, z: az, r: 12 });
      placed = true;
    }
  }

  /** Backswimmer rivals — short lazy ovals between random corners. */
  const racers = [];
  const nRacers = rInt(rand, 2, 6);
  for (let ri = 0; ri < nRacers; ri += 1) {
    const cx = rRange(rand, -CORE_LIM * 0.55, CORE_LIM * 0.55);
    const cz = rRange(rand, -CORE_LIM * 0.55, CORE_LIM * 0.55);
    const spread = rRange(rand, 22, 58);
    const path = [
      [cx, cz],
      [cx + spread, cz - spread * 0.35],
      [cx - spread * 0.4, cz - spread * 0.78],
      [cx - spread * 0.85, cz + spread * 0.18],
    ];
    racers.push({
      position: [cx, 0.35, cz],
      speed: rRange(rand, 3.2, 4.8),
      turnSmooth: rRange(rand, 0.055, 0.11),
      path,
      hue: rInt(rand, 0, 359),
    });
    pushExcl(excl, { x: cx, z: cz, r: spread * 0.45 + 6 });
  }

  /** Ripple slow rings. */
  const ripples = [];
  const nRip = rInt(rand, 3, 10);
  for (let rp = 0; rp < nRip; rp += 1) {
    for (let t = 0; t < 55; t += 1) {
      const rx = rRange(rand, -CORE_LIM * 0.92, CORE_LIM * 0.92);
      const rz = rRange(rand, -CORE_LIM * 0.92, CORE_LIM * 0.92);
      const rr = rRange(rand, 9, 24);
      if (!clearOfDiscs(rx, rz, rr * 1.06, excl)) continue;
      ripples.push({
        position: [rx, -0.1, rz],
        radius: rr,
        slowFactor: rRange(rand, 0.55, 0.78),
        pulseSpeed: rRange(rand, 0.85, 1.95),
      });
      pushExcl(excl, { x: rx, z: rz, r: rr + 11 });
      break;
    }
  }

  /** Hostile grazers biased toward choke points but never dogpiling spawn. */
  const predatorsInput = [];
  const nPred = rInt(rand, 13, 32);
  for (let p = 0; p < nPred && p < 720; p += 1) {
    const kind = pickPredKind(rand);
    const bodyRGuess =
      kind === "waterscorpion_tank" ? 26 : kind === "hydra_pod" ? 18 : kind === "planarian_spitter" ? 17 : 12;
    for (let t = 0; t < 124; t += 1) {
      const gx = rRange(rand, -CORE_LIM * 0.93, CORE_LIM * 0.93);
      const gz = rRange(rand, -CORE_LIM * 0.93, CORE_LIM * 0.93);
      if (!clearOfDiscs(gx, gz, bodyRGuess + 9, excl)) continue;

      /** @type {Record<string, unknown>} */
      const ob = {
        type: kind,
        position: [gx, 0.32, gz],
      };
      if (kind === "waterscorpion_tank" && rand() > 0.62) ob.hp = rInt(rand, 11, 16);
      if ((kind === "mosquito_larva" || kind === "daphnid_charger") && rand() > 0.7) ob.hp = rInt(rand, 2, 3);
      if (rand() > 0.82) ob.chaseSpeed = rRange(rand, 2.05, 3.95);

      predatorsInput.push(ob);
      pushExcl(excl, { x: gx, z: gz, r: bodyRGuess + rand() > 0.72 ? 3 : 0 });
      break;
    }
  }

  /** Micro graze pickups for buffet arcs. */
  const food = [];
  const nFood = rInt(rand, 17, 40);
  for (let f = 0; f < nFood; f += 1) {
    for (let t = 0; t < 88; t += 1) {
      const fx = rRange(rand, -CORE_LIM * 0.94, CORE_LIM * 0.94);
      const fz = rRange(rand, -CORE_LIM * 0.94, CORE_LIM * 0.94);
      if (!clearOfDiscs(fx, fz, 8, excl)) continue;
      const typ = FOOD_TYPES[Math.floor(rand() * FOOD_TYPES.length)] || "protozoa";
      food.push({
        type: typ,
        position: [fx, 0.35, fz],
        stacks: rand() > 0.78 ? 2 : rand() > 0.93 ? 3 : 1,
        ...(rand() > 0.94 ? { points: rInt(rand, 42, 95) } : {}),
      });
      pushExcl(excl, { x: fx, z: fz, r: rand() > 0.82 ? 5.5 : 4.2 });
      break;
    }
  }

  if (predatorsInput.length === 0) {
    predatorsInput.push({ type: "mosquito_larva", position: [sx + 110, 0.32, sz - 140] });
  }
  if (food.length === 0) {
    food.push({ type: "protozoa", position: [sx + 72, 0.35, sz - 92], stacks: 1 });
  }

  const seedShort = seed.toString(16).padStart(8, "0").slice(-6);

  return {
    metadata: {
      name: `Procedural pond (${seedShort})`,
      laps,
      lapScoreBonus: rInt(rand, 200, 280),
      allFoodClearBonus: rInt(rand, 455, 640),
    },
    spawn: {
      position: spawnPos,
      yawDeg,
    },
    checkpoints: orderedCp,
    obstacles: {
      lilies,
      bubbles,
      fish,
      racers,
      ripples,
      predators: predatorsInput,
    },
    food,
  };
}
