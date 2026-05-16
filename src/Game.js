import * as THREE from "three";
import { loadTrack } from "./trackLoader.js";
import { buildCourseRibbon, buildCheckpointMarkers } from "./courseVisuals.js";
import {
  COLORS,
  lilyGroup,
  bubbleGroup,
  rippleGroup,
  fishGroup,
  rivalGroup,
  boatGroup,
  foodMesh,
  advanceFish,
  advanceRival,
  predatorMesh,
  advanceMozzieTowardPlayer,
  createHpStripSprite,
} from "./sceneMeshes.js";

const PLAYER_RADIUS = 0.58;

const SPEED = {
  baseMax: 10.8,
  perFoodMax: 0.78,
  absoluteMaxCap: 19.8,
  baseAccel: 10.6,
  turnRate: 2.85,
  /** Sculling in place: A/D still swing yaw at this fraction of full moving turn. */
  inPlaceTurnFrac: 0.58,
  waterDragLinear: 3.45,
  /** Max reverse speed as fraction of forward ceiling (still scales with food-boost etc.). */
  reverseMaxFrac: 0.4,
  reverseAccelFrac: 0.5,
};

/** Rowing cadence (~full cycles / s alternating legs). */
const ROW_STROKE_HZ = 5.95;

/** Burst forward when hind legs sweep back (fraction of glide speed × speedNorm). */
const ROW_KICK_BURST = 0.128;

/** Slight slowdown while blades recover forward (paired with ROW_KICK_BURST). */
const ROW_RECOVERY_DRAG = 0.078;

const ROW_MOVE_MULT_MIN = 0.88;
const ROW_MOVE_MULT_MAX = 1.16;

/** Yaw amplitude: punchy backward stroke vs quieter forward recovery */
const ROW_YAW_POWER = 0.92;
const ROW_YAW_RECOVER = 0.34;

/** Extra pitch only while powering */
const ROW_DIP_POWER = 0.26;

/** Thrust impulse only during backward power sweep (smooth positive half-cycle). */
function legKickDrive(sinPhase) {
  if (sinPhase <= 0.085) return 0;
  return Math.pow(THREE.MathUtils.smoothstep(sinPhase, 0.085, 0.982), 1.72);
}

/** Softer amplitude while oar swings forward toward recovery posture */
function legRecoveryPortion(sinPhase) {
  const u = THREE.MathUtils.clamp(-sinPhase, 0, 1);
  if (u <= 0.04) return 0;
  return Math.pow(THREE.MathUtils.smoothstep(u, 0.045, 0.93), 1.06);
}

/** ~1 only when exactly one side is midway through drive; ~0 mid-recovery */
function combinedKickDrive(phaseRad) {
  const a = legKickDrive(Math.sin(phaseRad));
  const b = legKickDrive(Math.sin(phaseRad + Math.PI));
  return THREE.MathUtils.clamp(a + b, 0, 1.12);
}

const HARD_HIT = {
  foodLoss: 2,
  velocityFactor: 0.34,
  cooldownSec: 0.52,
};

const PLAYER_HP_MAX = 100;

const VENOM = {
  cap: 100,
  biteCost: 42,
  /** Passive refill (~empty → full seconds). Used up bites recover here unless boosted by prey. */
  passiveRefillSeconds: 14,
  /** Instant portion restored when munching pickups. */
  foodChunk: 34,
  meleeCooldown: 0.48,
};

const VENOM_SURGE_SECONDS = 4.9;
/** Multiplier applied to passive refill while prey energy is absorbed. */
const VENOM_SURGE_MULT = 2.05;

/** Strike chip subtracted from each grazer (`VENOM_BITE_PREY_KILL * venomSusceptibility`, vs YAML `hp`). */
const VENOM_BITE_PREY_KILL = 2.25;

/** Probe sits slightly ahead of hull center so grazing reads from the rostrum. */
const VENOM_BITE_FORWARD_INSET = 0.44;
/** Spherical reach from probe; larvae beyond this clip out (still must sit inside the yaw fan). */
const VENOM_BITE_RANGE = 9.95;
const VENOM_BITE_REACH_SQ = VENOM_BITE_RANGE ** 2;
/** Narrow tip at apex (−boat Z) opening toward +boat Z after `rotation.x = -π/2`. */
const VENOM_SPIT_VISUAL_LENGTH = 5.5;
/** Local Z where saliva cone attaches (narrow end ~ apex after orientation fix). */
const VENOM_SPIT_MOUNT_Z = 0.53 + VENOM_SPIT_VISUAL_LENGTH / 2;
/** cos(half fan angle); larvae outside this wedge are spared. ~52° each side (~104° total). */
const VENOM_BITE_COS_HALF_FAN = Math.cos(THREE.MathUtils.degToRad(52));
/** Chip scales from near (mouthful) → far grazing at `VENOM_BITE_RANGE`. */
const VENOM_BITE_NEAR_DMG_MULT = 1.24;
const VENOM_BITE_FAR_DMG_MULT = 0.22;

/** Violet spit cone glued to hull when venom nip fires. */
const VENOM_SPIT_SECONDS = 0.38;
/** Additive ripple at centroid of struck grazers (world space). */
const VENOM_HIT_BURST_SECONDS = 0.3;

/** Broad-phase band pad so tail/eye probes still test even if hull centroid grazes sideways. */
const VENOM_BROAD_SQ_PAD = (VENOM_BITE_RANGE + 17) ** 2;

const ENEMY_BOLT_POOL = 56;
/** Small grazing heal when pickups are swallowed. */
const FOOD_HEAL = 7;

/** Base points awarded per-food type when YAML does not specify `points`/`score`. */
const FOOD_SCORE_TABLE = {
  protozoa: 120,
  nematode: 165,
  mosquito_larva: 140,
};

function pickupPointsForFood(fd) {
  if (typeof fd.pointValue === "number" && Number.isFinite(fd.pointValue)) return fd.pointValue;
  const base = FOOD_SCORE_TABLE[fd.type];
  return Number.isFinite(base) ? base : 95;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export class Game {
  constructor(canvas, trackUrl) {
    this.canvas = canvas;
    this.trackUrl = trackUrl;

    /** @type {Awaited<import("./trackLoader.js").loadTrack>} */
    this.track = null;

    this.clock = new THREE.Clock();
    this.renderer = null;
    this.scene = null;
    this.camera = null;

    this.playerMesh = null;
    this.camScratch = new THREE.Vector3();

    this.keys = Object.create(null);

    this.hitCooldown = 0;
    this.foodStacks = 0;
    this.speed = 0;
    this.yaw = 0;

    this.pos = new THREE.Vector3(0, 0.35, 0);

    this.nextCp = 0;
    this.completedLaps = 0;
    this.finished = false;

    this.points = 0;
    /** @type {'laps'|'buffet' | null} */
    this.winReason = null;
    /** @type {{ mealSweepBonus: boolean }} */
    this.scoreFlags = { mealSweepBonus: false };

    this.health = PLAYER_HP_MAX;
    this.healthMax = PLAYER_HP_MAX;
    /** Prey-saliva reserve; burns on rostrum strikes, passively refills faster after feeding. */
    this.venom = VENOM.cap;
    this.venomMax = VENOM.cap;
    /** Seconds of boosted venom synthesis after eating. */
    this.venomSurgeT = 0;
    this.playerDead = false;
    /** Saliva strike timing. */
    this.venomMeleeCd = 0;
    this.pendingVenomBite = false;

    this.foodMeshes = [];
    /** @type {THREE.Object3D[]} */
    this.disposeCleanup = [];

    /** @type {THREE.Object3D[]} */
    this.predatorInst = [];

    /** @type {THREE.Mesh | null} */
    this.venomSpitCone = null;
    /** @type {THREE.MeshBasicMaterial | null} */
    this.venomSpitMat = null;
    /** @type {THREE.Mesh | null} */
    this.venomBurstMesh = null;
    /** @type {THREE.MeshBasicMaterial | null} */
    this.venomBurstMat = null;
    this.venomStrikeFxT = 0;
    this.venomBurstT = 0;
    /** @type {THREE.Vector3} */
    this._venomBurstCentroid = new THREE.Vector3();

    /** Hot colour for predator wake lash when venom connects. */
    this._strikeHotTint = new THREE.Color(0xfff7ff);

    /** Overhead hull strip sprite (canvas). */
    this.playerHpHud = null;

    /** Remaining hull-hit flash accent for hud/wobble. */
    this.playerDmgFlashT = 0;

    /** Cache key for swimmer overhead HP canvas. */
    this._playerHudSnap = "";

    /** Ranged predator projectiles (pool of additive spheres). */
    /** @type {THREE.Mesh[]} */
    this.enemyBoltPool = [];
    /** @type {{ mesh: THREE.Mesh; x: number; z: number; vx: number; vz: number; ttl: number; dmg: number; pr: number }[]} */
    this.enemyBolts = [];

    this._predWeakScratch = new THREE.Vector3();
    this._predSpawnScratch = new THREE.Vector3();

    this.resize = () => this.onResize();
    this.boundKeyDown = (e) => this.onKey(e, true);
    this.boundKeyUp = (e) => this.onKey(e, false);

    /** smoothed [0–1]: how vigorously hind legs animate / speed ripples */
    this._kickBlend = 0;
    this._rowPhaseLive = 0;
  }

  async init() {
    this.track = await loadTrack(this.trackUrl);

    const spawn = this.track.spawn;
    this.pos.set(spawn.position[0], spawn.position[1], spawn.position[2]);
    this.yaw = THREE.MathUtils.degToRad(Number(spawn.yawDeg ?? 0));
    this.speed = 0;
    this.foodStacks = 0;
    this.hitCooldown = 0;
    this.nextCp = 0;
    this.completedLaps = 0;
    this.finished = false;
    this.points = 0;
    this.winReason = null;
    this.scoreFlags = { mealSweepBonus: false };
    this.health = PLAYER_HP_MAX;
    this.healthMax = PLAYER_HP_MAX;
    this.venom = VENOM.cap;
    this.venomMax = VENOM.cap;
    this.venomSurgeT = 0;
    this.playerDead = false;
    this.venomMeleeCd = 0;
    this.pendingVenomBite = false;

    if (this.venomSpitCone || this.venomBurstMesh) this.clearVenomBiteFx();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8e9);
    this.scene.fog = new THREE.Fog(0x7ec8e9, 70, 240);

    const aspect = window.innerWidth / window.innerHeight || 1;
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 450);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.buildWorld();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
  }

  dispose() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    while (this.scene && this.scene.children.length) {
      const obj = this.scene.children[0];
      this.disposeObject(obj);
      this.scene.remove(obj);
    }
    this.disposeCleanup.length = 0;
    this.foodMeshes.length = 0;
    this.predatorInst = [];
    if (this.renderer) this.renderer.dispose();
  }

  disposeObject(root) {
    root.traverse((child) => {
      if ("geometry" in child && child.geometry) child.geometry.dispose();
      const m = "material" in child ? child.material : null;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mat) => mat?.dispose?.());
    });
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  onKey(/** @type {KeyboardEvent} */ e, down) {
    const map = {
      KeyW: "thrust",
      ArrowUp: "thrust",
      KeyS: "reverse",
      ArrowDown: "reverse",
      KeyA: "left",
      ArrowLeft: "left",
      KeyD: "right",
      ArrowRight: "right",
    };
    const a = map[e.code];
    if (a) {
      this.keys[a] = down;
      e.preventDefault();
    }
    if (down && e.code === "KeyR") this.resetRace();
    if (e.code === "Space" && down && !e.repeat) {
      this.pendingVenomBite = true;
      e.preventDefault();
    }
  }

  resetRace() {
    if (!this.track) return;
    const s = this.track.spawn;
    this.pos.set(s.position[0], s.position[1], s.position[2]);
    this.yaw = THREE.MathUtils.degToRad(Number(s.yawDeg ?? 0));
    this.speed = 0;
    this.foodStacks = 0;
    this.hitCooldown = 0;
    this.nextCp = 0;
    this.completedLaps = 0;
    this.finished = false;
    this.points = 0;
    this.winReason = null;
    this.scoreFlags = { mealSweepBonus: false };
    this._kickBlend = 0;
    this._rowPhaseLive = 0;

    this.health = PLAYER_HP_MAX;
    this.healthMax = PLAYER_HP_MAX;
    this.venom = VENOM.cap;
    this.venomMax = VENOM.cap;
    this.venomSurgeT = 0;
    this.playerDead = false;
    this.venomMeleeCd = 0;
    this.pendingVenomBite = false;
    this.clearVenomBiteFx();
    this.playerDmgFlashT = 0;
    this._playerHudSnap = "";
    this.releaseEnemyRangedBolts();

    let i = 0;    for (const fd of this.track.food) {
      fd.active = true;
      const m = this.foodMeshes[i];
      if (m) m.visible = true;
      i += 1;
    }

    for (const grp of this.predatorInst) {
      const pd = grp.userData.predCfg;
      const live = grp.userData.live;
      if (!pd || !live) continue;
      live.hpNow = live.hpMax;
      live.biteCd = 0.35 + Math.random() * 0.45;
      live.rangedCd = 0.22 + Math.random() * 0.95;
      grp.visible = true;
      const surfY = Math.max(Number(pd.position[1]), 0.38);
      grp.position.set(pd.position[0], surfY, pd.position[2]);
      grp.userData.baseY = surfY;
      grp.rotation.set(0, 0, 0);
      grp.userData.dmgSquashT = 0;
      grp.userData._predHudSnap = "";

      const h = grp.userData.hpHud;
      if (h?.draw && live.hpMax > 0) {
        h.draw(1, 0, 0);
        grp.userData._predHudSnap = "1.0000:0.000:0.000";
      }
    }
  }

  buildWorld() {
    const ambient = new THREE.HemisphereLight(0xffffff, 0x224466, 0.55);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff3dd, 1.08);
    sun.position.set(-40, 90, -20);
    sun.castShadow = true;
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -130;
    cam.right = cam.top = 130;
    cam.far = 270;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 520),
      new THREE.MeshStandardMaterial({
        color: COLORS.water,
        roughness: 0.42,
        metalness: 0.06,
        transparent: true,
        opacity: 0.93,
        emissive: new THREE.Color(COLORS.waterDeep),
        emissiveIntensity: 0.15,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = true;
    this.scene.add(water);
    this.disposeCleanup.push(water);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 520),
      new THREE.MeshStandardMaterial({ color: COLORS.waterDeep, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.disposeCleanup.push(floor);

    const grid = new THREE.GridHelper(260, 52, 0x1fb2d5, 0x104d66);
    grid.position.y = 0.01;
    grid.material.opacity = 0.12;
    grid.material.transparent = true;
    this.scene.add(grid);
    this.disposeCleanup.push(grid);

    const cpts = this.track.checkpoints ?? [];
    this.courseRibbonObj = buildCourseRibbon(cpts, 0.15);
    if (this.courseRibbonObj?.mesh) {
      this.scene.add(this.courseRibbonObj.mesh);
      this.disposeCleanup.push(this.courseRibbonObj.mesh);
    }

    this.checkpointBuoys = buildCheckpointMarkers(cpts);
    for (const buoy of this.checkpointBuoys) {
      this.scene.add(buoy.group);
      this.disposeCleanup.push(buoy.group);
    }

    for (const l of this.track.lilies) {
      const g = lilyGroup(l.radius);
      g.position.set(l.position[0], l.y || 0.02, l.position[1]);
      g.castShadow = true;
      g.receiveShadow = true;
      this.scene.add(g);
      this.disposeCleanup.push(g);
    }

    for (const b of this.track.bubbles) {
      const grp = bubbleGroup(b.radius * 2);
      grp.position.set(b.position[0], 0.4, b.position[1]);
      this.scene.add(grp);
      this.disposeCleanup.push(grp);
    }

    /** @type {Array<{ripple:any, meshes:any}>} */
    this.rippleObjs = [];

    for (const ri of this.track.ripples) {
      const r = rippleGroup(ri.radius);
      r.mesh.position.set(ri.position[0], 0.045, ri.position[1]);
      this.scene.add(r.mesh);
      this.disposeCleanup.push(r.mesh);
      this.rippleObjs.push({ ripple: ri, meshes: r });
    }

    this.fishInst = [];
    for (const fd of this.track.fish) {
      const grp = fishGroup(fd.length, fd.width, fd.height);
      grp.position.set(fd.position[0], fd.y, fd.position[1]);
      grp.userData.fishData = fd;
      this.scene.add(grp);
      this.disposeCleanup.push(grp);
      this.fishInst.push(grp);
    }

    this.racerInst = [];
    for (let ri = 0; ri < this.track.racers.length; ri++) {
      const rc = this.track.racers[ri];
      const grp = rivalGroup({
        hullHex: typeof rc.hullHex === "number" && Number.isFinite(rc.hullHex) ? rc.hullHex : null,
        hue: typeof rc.hue === "number" && Number.isFinite(rc.hue) ? rc.hue : null,
        hueIndex: ri,
      });
      const x = rc.x ?? rc.position[0];
      const z = rc.z ?? rc.position[1];
      grp.position.set(x, rc.y ?? 0.35, z);
      grp.userData.racerCfg = rc;
      this.scene.add(grp);
      this.disposeCleanup.push(grp);
      this.racerInst.push(grp);
    }

    for (const fd of this.track.food) {
      const m = foodMesh(fd.type);
      m.position.set(fd.position[0], fd.position[1], fd.position[2]);
      m.castShadow = true;
      this.scene.add(m);
      this.disposeCleanup.push(m);
      this.foodMeshes.push(m);
    }

    this.predatorInst = [];
    for (const pd of this.track.predators ?? []) {
      const surfY = Math.max(Number(pd.position[1]), 0.38);
      const grp = predatorMesh(pd.kind);
      grp.position.set(pd.position[0], surfY, pd.position[2]);
      const vm = pd.visualMultiplier ?? 1;
      if (Math.abs(vm - 1) > 1e-4) grp.scale.multiplyScalar(vm);
      grp.userData.baseY = surfY;
      grp.userData.predCfg = pd;
      grp.userData.live = {
        hpMax: pd.hp,
        hpNow: pd.hp,
        biteCd: 0.25 + Math.random() * 0.55,
        rangedCd: 0.35 + Math.random() * 0.85,
        homeX: pd.position[0],
        homeZ: pd.position[2],
      };
      this.scene.add(grp);
      this.disposeCleanup.push(grp);
      this.predatorInst.push(grp);

      const wakeMat = grp.userData.predWakeMat;
      if (wakeMat) {
        grp.userData.predWakeSnap = {
          opacity: wakeMat.opacity,
          color: wakeMat.color.clone(),
        };
      }
    }

    const player = boatGroup();
    player.position.copy(this.pos);
    this.playerMesh = player;
    this.scene.add(player);
    this.disposeCleanup.push(player);

    this.ensureVenomBiteMeshes(player);
    this.ensurePlayerHpBar(player);

    this.ensureEnemyBoltPool();
  }

  /** Overhead hull strip (canvas sprite parented above your mesh). */
  ensurePlayerHpBar(player) {
    if (this.playerHpHud || !player) return;
    const h = createHpStripSprite(2.32, 0.5, 2.74);
    this.playerHpHud = h;
    player.add(h.sprite);
  }

  /** Repaints strip when vitality or hull-hit flash envelope changes. */
  refreshPlayerHudStrip() {
    if (!this.track || !this.playerHpHud?.draw) return;
    if (this.playerDead) {
      if (this.playerHpHud.sprite) this.playerHpHud.sprite.visible = false;
      return;
    }
    if (this.playerHpHud.sprite) this.playerHpHud.sprite.visible = true;
    const r = THREE.MathUtils.clamp(this.health / Math.max(this.healthMax, 1e-5), 0, 1);
    const dmgF = THREE.MathUtils.clamp(1 - r, 0, 1);
    const pulse = THREE.MathUtils.clamp(this.playerDmgFlashT / 0.5, 0, 1);
    const snap = `${this.health.toFixed(2)}|${pulse.toFixed(2)}|${dmgF.toFixed(3)}`;
    if (snap === this._playerHudSnap) return;
    this._playerHudSnap = snap;
    this.playerHpHud.draw(r, dmgF, pulse);
  }

  /** Child cone on hull + additive burst in world space — created once after player mesh exists. */
  ensureVenomBiteMeshes(player) {
    if (this.venomSpitCone || !player || !this.scene) return;

    const spitMat = new THREE.MeshBasicMaterial({
      color: 0xbb71ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    /** Cone apex (−boat Z narrow tip) opens toward +boat Z ahead of swimmer. See `VENOM_*` sizing. */
    const coneGeom = new THREE.ConeGeometry(
      0.72,
      VENOM_SPIT_VISUAL_LENGTH,
      16,
      1,
      false
    );
    const spitCone = new THREE.Mesh(coneGeom, spitMat);
    spitCone.rotation.x = -Math.PI / 2;
    spitCone.position.set(0.02, 0.075, VENOM_SPIT_MOUNT_Z);
    spitCone.visible = false;
    spitCone.renderOrder = 6;
    player.add(spitCone);

    const burstGeom = new THREE.SphereGeometry(0.62, 16, 12);
    const burstMat = new THREE.MeshBasicMaterial({
      color: 0xd9bfff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const burst = new THREE.Mesh(burstGeom, burstMat);
    burst.visible = false;
    burst.renderOrder = 6;
    burst.frustumCulled = false;

    this.scene.add(burst);
    this.disposeCleanup.push(burst);

    this.venomSpitCone = spitCone;
    this.venomSpitMat = spitMat;
    this.venomBurstMesh = burst;
    this.venomBurstMat = burstMat;
  }

  /** Stop saliva VFX timers and hide meshes. */
  clearVenomBiteFx() {
    this.venomStrikeFxT = 0;
    this.venomBurstT = 0;
    if (this.venomSpitCone) this.venomSpitCone.visible = false;
    if (this.venomSpitMat) this.venomSpitMat.opacity = 0;
    if (this.venomBurstMesh) this.venomBurstMesh.visible = false;
    if (this.venomBurstMat) this.venomBurstMat.opacity = 0;
    this.syncVenomBiteVisuals();
  }

  /** Decay saliva/burst timers, then repaint meshes so VFX survives the rest of `update`. */
  advanceVenomBiteTimers(dt) {
    if (dt > 0) {
      if (this.venomStrikeFxT > 0) this.venomStrikeFxT = Math.max(0, this.venomStrikeFxT - dt);
      if (this.venomBurstT > 0) this.venomBurstT = Math.max(0, this.venomBurstT - dt);
    }
    this.syncVenomBiteVisuals();
  }

  /** Paint saliva jet + grazing burst from timers (runs after timers are armed mid-frame too). */
  syncVenomBiteVisuals() {
    if (this.venomSpitCone && this.venomSpitMat) {
      const phase =
        VENOM_SPIT_SECONDS <= 1e-5 ? 0 : THREE.MathUtils.clamp(this.venomStrikeFxT / VENOM_SPIT_SECONDS, 0, 1);
      const flicker = Math.sin(phase * Math.PI);
      this.venomSpitCone.visible = flicker > 0.04;
      if (this.venomSpitCone.visible) {
        this.venomSpitMat.opacity = flicker * 0.74;
        this.venomSpitCone.scale.set(
          THREE.MathUtils.lerp(0.92, 1.28, flicker),
          THREE.MathUtils.lerp(1.98, 0.88, 1 - phase),
          THREE.MathUtils.lerp(0.92, 1.24, flicker)
        );
      } else {
        this.venomSpitMat.opacity = 0;
      }
    }

    if (this.venomBurstMesh && this.venomBurstMat && this.scene) {
      const ringPhase =
        VENOM_HIT_BURST_SECONDS <= 1e-6
          ? 0
          : THREE.MathUtils.clamp(this.venomBurstT / VENOM_HIT_BURST_SECONDS, 0, 1);
      const swell = Math.sin(ringPhase * Math.PI);
      if (swell > 0.035 && this.venomBurstT > 0) {
        this.venomBurstMesh.visible = true;
        this.venomBurstMat.opacity = swell * 0.58;
        const s = THREE.MathUtils.lerp(5.5, 0.92, 1 - ringPhase);
        this.venomBurstMesh.scale.setScalar(s);
      } else {
        this.venomBurstMesh.visible = false;
        this.venomBurstMat.opacity = 0;
      }
    }
  }

  predWakeStrikeFlashTick(grp, dt) {
    const wakeMat = grp.userData.predWakeMat;
    const snap = grp.userData.predWakeSnap;
    if (!wakeMat || !snap) return;

    let ft = grp.userData.venomHitFlashT ?? 0;
    if (ft > 0) {
      ft -= dt;
      grp.userData.venomHitFlashT = Math.max(ft, 0);
      grp.userData.venWakeDirty = true;
      const pulse = THREE.MathUtils.clamp(grp.userData.venomHitFlashT / 0.31, 0, 1);
      wakeMat.opacity = snap.opacity + pulse * 0.62;
      wakeMat.color.copy(snap.color).lerp(this._strikeHotTint, pulse);
    } else if (grp.userData.venWakeDirty) {
      wakeMat.opacity = snap.opacity;
      wakeMat.color.copy(snap.color);
      grp.userData.venWakeDirty = false;
    }
  }

  applyHardImpact() {
    if (this.hitCooldown > 0 || !this.track) return;
    this.hitCooldown = HARD_HIT.cooldownSec;
    this.foodStacks = Math.max(0, this.foodStacks - HARD_HIT.foodLoss);
    this.speed *= HARD_HIT.velocityFactor;
    this.playerDmgFlashT = Math.max(this.playerDmgFlashT, 0.18);
  }

  /** Mosquito larvae (etc.) scraping the swimmer instead of lily/fish pancake hits. */
  applyParasiteBleed(amount) {
    if (!this.track || this.playerDead || this.finished) return;
    let a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;
    this.health -= a;
    this.playerDmgFlashT = Math.max(this.playerDmgFlashT, 0.48);
    if (this.health <= 0) {
      this.health = 0;
      this.playerDead = true;
      this.speed *= 0.22;
      this.winReason = null;
    }
  }

  ensureEnemyBoltPool() {
    if (!this.scene || this.enemyBoltPool.length > 0) return;
    for (let i = 0; i < ENEMY_BOLT_POOL; i += 1) {
      const geom = new THREE.SphereGeometry(0.42, 10, 8);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa8ffe8,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 7;
      this.scene.add(mesh);
      this.disposeCleanup.push(mesh);
      this.enemyBoltPool.push(mesh);
    }
  }

  releaseEnemyRangedBolts() {
    for (const bolt of this.enemyBolts) {
      bolt.mesh.visible = false;
    }
    this.enemyBolts.length = 0;
  }

  /**
   * @param {number} sx world X
   * @param {number} sz world Z
   */
  spawnEnemyBolt(sx, sz, vx, vz, dmg, projR, maxRangeHints, colorHex) {
    const mesh = this.enemyBoltPool.find((m) => !m.visible);
    if (!mesh) return false;
    mesh.visible = true;
    const mat = /** @type {THREE.MeshBasicMaterial} */ (mesh.material);
    if (typeof colorHex === "number" && Number.isFinite(colorHex)) mat.color.setHex(colorHex);
    const speed = Math.hypot(vx, vz);
    mesh.scale.setScalar(THREE.MathUtils.clamp(projR / 0.42, 0.085, 2.95));
    mesh.position.set(sx, 0.32, sz);
    const spdHint = THREE.MathUtils.clamp(speed, 0.08, 60);
    const ttl = THREE.MathUtils.clamp(maxRangeHints / spdHint + 1.4, 1.95, 12.75);
    this.enemyBolts.push({
      mesh,
      x: sx,
      z: sz,
      vx,
      vz,
      ttl,
      dmg,
      pr: projR,
    });
    return true;
  }

  advanceEnemyRangedBolts(dt, /** @type {number} */ playerX, /** @type {number} */ playerZ) {
    if (!dt || dt <= 0) return;
    for (let i = this.enemyBolts.length - 1; i >= 0; i -= 1) {
      const bolt = this.enemyBolts[i];
      bolt.x += bolt.vx * dt;
      bolt.z += bolt.vz * dt;
      bolt.mesh.position.set(bolt.x, 0.32, bolt.z);
      bolt.ttl -= dt;

      const rr = PLAYER_RADIUS + bolt.pr;
      const rdx = bolt.x - playerX;
      const rdz = bolt.z - playerZ;
      if (
        rdx * rdx + rdz * rdz < rr * rr &&
        !this.finished &&
        !this.playerDead &&
        bolt.dmg > 0
      ) {
        this.applyParasiteBleed(bolt.dmg);
        bolt.mesh.visible = false;
        this.enemyBolts.splice(i, 1);
        continue;
      }

      if (bolt.ttl <= 0) {
        bolt.mesh.visible = false;
        this.enemyBolts.splice(i, 1);
      }
    }
  }

  predatorMeleeEnvelopeRadius(grp, pd) {
    let rr = pd.radius;
    const ws = pd.weakSpots;
    const sx = grp.scale.x || 1;
    if (!Array.isArray(ws) || ws.length === 0) return rr;
    for (let wi = 0; wi < ws.length; wi += 1) {
      const w = ws[wi];
      const oxz = Math.hypot(Number(w.offset[0]) || 0, Number(w.offset[2]) || 0);
      const wr = typeof w.radius === "number" && Number.isFinite(w.radius) ? w.radius : 0.45;
      rr = Math.max(rr, oxz * sx + wr * sx);
    }
    return rr;
  }

  /**
   * Aim weak-spots into the saliva cone relative to probe origin — returns `{ dist, vulnMul }`.
   * @returns {{ dist: number; vulnMul: number } | null}
   */
  predatorWeakVenemShot(grp, pd, biteX, biteZ, fwdSn, fwdCs) {
    const weak = pd.weakSpots;
    if (!Array.isArray(weak) || weak.length === 0) return null;
    let bestD = Infinity;
    let bestVm = 1;

    for (let i = 0; i < weak.length; i += 1) {
      const spot = weak[i];
      this._predWeakScratch.set(spot.offset[0], spot.offset[1], spot.offset[2]);
      grp.localToWorld(this._predWeakScratch);

      const wx = this._predWeakScratch.x;
      const wz = this._predWeakScratch.z;
      let edx = wx - biteX;
      let edz = wz - biteZ;
      const dsq = edx * edx + edz * edz;
      if (dsq < 1e-10) continue;
      const dist = Math.sqrt(dsq);
      const sR =
        typeof spot.radius === "number" && Number.isFinite(spot.radius) ? spot.radius : 0.45;
      const sx = grp.scale.x || 1;
      const worldSpotR = sR * sx;
      if (dist > VENOM_BITE_RANGE + worldSpotR) continue;

      const dot = (edx / dist) * fwdSn + (edz / dist) * fwdCs;
      if (dot < VENOM_BITE_COS_HALF_FAN) continue;

      const vmRaw = spot.venomVulnerability;
      const vulnMul =
        typeof vmRaw === "number" && Number.isFinite(vmRaw)
          ? THREE.MathUtils.clamp(vmRaw, 0.06, 3.95)
          : 1;

      const penalized = THREE.MathUtils.clamp(dist - worldSpotR * 0.22, dist * 0.55, VENOM_BITE_RANGE);

      if (penalized < bestD) {
        bestD = penalized;
        bestVm = vulnMul;
      }
    }

    if (!Number.isFinite(bestD) || bestD === Infinity) return null;
    return { dist: bestD, vulnMul: bestVm };
  }

  tryEnemyRangedFire(predGrp, pd, live, dt, playerX, playerZ) {
    const ra = pd.rangedAttack;
    if (!ra || live.hpNow <= 0 || dt <= 0) return;
    if (this.playerDead || this.finished) return;

    live.rangedCd -= dt;

    const gx = predGrp.position.x;
    const gz = predGrp.position.z;
    const pdx = playerX - gx;
    const pdz = playerZ - gz;
    const rng = Math.hypot(pdx, pdz);

    if (rng > ra.maxRange) return;
    if (live.rangedCd > 0) return;

    live.rangedCd = ra.cooldown;

    this._predSpawnScratch.set(0, 0.07, 0.58);
    predGrp.localToWorld(this._predSpawnScratch);

    const sx = this._predSpawnScratch.x;
    const sz = this._predSpawnScratch.z;

    let leadBx = typeof this.speed === "number" ? this.speed * Math.sin(this.yaw) * ra.leadBias * 0.34 : 0;
    let leadBz = typeof this.speed === "number" ? this.speed * Math.cos(this.yaw) * ra.leadBias * 0.34 : 0;

    leadBx *= THREE.MathUtils.clamp(1 - THREE.MathUtils.smoothstep(rng / Math.max(ra.maxRange, 1e-3), 0.15, 0.95), 0, 1);
    leadBz *= THREE.MathUtils.clamp(1 - THREE.MathUtils.smoothstep(rng / Math.max(ra.maxRange, 1e-3), 0.15, 0.95), 0, 1);

    const tx = playerX + leadBx;
    const tz = playerZ + leadBz;

    let dx = tx - sx;
    let dz = tz - sz;
    let dirLen = Math.hypot(dx, dz);

    const spd = ra.projectileSpeed;
    let ux;
    let uz;
    if (dirLen > 1e-3) {
      ux = (dx / dirLen) * spd;
      uz = (dz / dirLen) * spd;
    } else {
      const base = rng > 1e-4 ? 1 / rng : 1;
      ux = pdx * base * spd;
      uz = pdz * base * spd;
    }

    let colorHex = 0xb3ffe9;
    if (typeof ra.colorHex === "number" && Number.isFinite(ra.colorHex)) colorHex = ra.colorHex >>> 0;
    if (pd.kind === "planarian_spitter") colorHex = 0xff8fe4;
    if (pd.kind === "hydra_pod") colorHex = 0x9eecff;

    this.spawnEnemyBolt(sx, sz, ux, uz, ra.damage, ra.projectileRadius, ra.maxRange, colorHex);
  }

  consumeVenomStrikeAttempt() {
    if (!this.pendingVenomBite) return;
    this.pendingVenomBite = false;
    if (!this.track || this.playerDead || this.finished) return;
    if (this.venomMeleeCd > 0 || this.venom < VENOM.biteCost) return;

    const sn = Math.sin(this.yaw);
    const cs = Math.cos(this.yaw);
    const steerRev = this.speed < -0.05;
    const fwdSn = steerRev ? -sn : sn;
    const fwdCs = steerRev ? -cs : cs;

    const biteX = this.pos.x + fwdSn * VENOM_BITE_FORWARD_INSET;
    const biteZ = this.pos.z + fwdCs * VENOM_BITE_FORWARD_INSET;

    this.venom -= VENOM.biteCost;
    this.venomMeleeCd = VENOM.meleeCooldown;
    this.venomStrikeFxT = VENOM_SPIT_SECONDS;

    /** @type {THREE.Object3D[]} */
    const hitPredators = [];

    for (const grp of this.predatorInst) {
      const live = grp.userData.live;
      const pd = grp.userData.predCfg;
      if (!live || !pd || live.hpNow <= 0) continue;

      const tcx = grp.position.x - biteX;
      const tcz = grp.position.z - biteZ;
      if (tcx * tcx + tcz * tcz > VENOM_BROAD_SQ_PAD) continue;

      /** Armoured larvae only hemorrhage saliva when cones dust eyes/tails/etc.; others use centroid tests. */
      const hasWeak = Array.isArray(pd.weakSpots) && pd.weakSpots.length > 0;
      let dist;
      let vulnVen = 1;
      if (!hasWeak) {
        const dsq = tcx * tcx + tcz * tcz;
        if (dsq > VENOM_BITE_REACH_SQ || dsq < 1e-9) continue;
        dist = Math.sqrt(dsq);
        const dot = (tcx / dist) * fwdSn + (tcz / dist) * fwdCs;
        if (dot < VENOM_BITE_COS_HALF_FAN) continue;
      } else {
        const ws = this.predatorWeakVenemShot(grp, pd, biteX, biteZ, fwdSn, fwdCs);
        if (!ws) continue;
        dist = ws.dist;
        vulnVen = ws.vulnMul;
      }

      const sus =
        typeof pd.venomSusceptibility === "number" && Number.isFinite(pd.venomSusceptibility)
          ? pd.venomSusceptibility
          : 1;

      const distFrac = THREE.MathUtils.clamp(dist / Math.max(VENOM_BITE_RANGE, 1e-5), 0, 1);
      const distMult = THREE.MathUtils.lerp(
        VENOM_BITE_NEAR_DMG_MULT,
        VENOM_BITE_FAR_DMG_MULT,
        THREE.MathUtils.smoothstep(distFrac, 0.035, 0.995)
      );
      const chip = VENOM_BITE_PREY_KILL * sus * distMult * vulnVen;
      if (chip <= 1e-6) continue;

      hitPredators.push(grp);

      const hpWas = live.hpNow;
      live.hpNow -= chip;
      if (hpWas > live.hpNow) {
        grp.userData.dmgSquashT = Math.max(
          grp.userData.dmgSquashT ?? 0,
          0.28 + THREE.MathUtils.clamp(distMult * vulnVen, 0, 4) * 0.54
        );
        grp.userData._predHudSnap = "";
      }
      if (live.hpNow <= 0) {
        live.hpNow = 0;
        grp.visible = false;
      }
    }

    if (hitPredators.length > 0 && this.venomBurstMesh) {
      this._venomBurstCentroid.set(0, 0, 0);
      for (const g of hitPredators) {
        this._venomBurstCentroid.x += g.position.x;
        this._venomBurstCentroid.y += g.position.y;
        this._venomBurstCentroid.z += g.position.z;

        const prev = typeof g.userData.venomHitFlashT === "number" ? g.userData.venomHitFlashT : 0;
        g.userData.venomHitFlashT = Math.max(prev, 0.32);
        g.userData.venWakeDirty = true;
      }
      const inv = 1 / hitPredators.length;
      this._venomBurstCentroid.multiplyScalar(inv);
      this._venomBurstCentroid.y += 0.1;
      this.venomBurstMesh.position.copy(this._venomBurstCentroid);
      this.venomBurstT = Math.max(this.venomBurstT, VENOM_HIT_BURST_SECONDS);
    }

    this.syncVenomBiteVisuals();
  }

  syncRowKickDynamics(time, propulseFwd, propulseRev, dt, speedCeilingFwd) {
    let targetKick = 0;
    if (!this.finished && !this.playerDead) {
      if (propulseFwd || propulseRev) targetKick = 1;
      else if (Math.abs(this.speed) > 0.52) targetKick = 0.22;
      else targetKick = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 0.08);
    }

    this._kickBlend = THREE.MathUtils.lerp(
      this._kickBlend,
      targetKick,
      1 - Math.exp(-dt * (targetKick >= this._kickBlend ? 30 : 5.5))
    );

    this._rowPhaseLive = time * Math.PI * 2 * ROW_STROKE_HZ;

    if ((this.finished || this.playerDead) || this._kickBlend < 0.02) return 1;

    const ph = this._rowPhaseLive;

    const kickMag = combinedKickDrive(ph);
    const slack = THREE.MathUtils.clamp(1 - kickMag, 0, 1);
    const revCeilAbs = Math.max(0.35, speedCeilingFwd * SPEED.reverseMaxFrac);
    const refCap = this.speed >= 0 ? speedCeilingFwd : revCeilAbs;

    const speedNorm = THREE.MathUtils.clamp(
      Math.abs(this.speed) / Math.max(Number(refCap) || 1, 0.001),
      0,
      1
    );

    const astern = this.speed < -0.06;
    const burst = ROW_KICK_BURST * (astern ? 0.72 : 1);
    const drag = ROW_RECOVERY_DRAG * (astern ? 0.85 : 1);

    const moveMult =
      1 +
      burst * speedNorm * kickMag -
      drag * speedNorm * slack;

    return THREE.MathUtils.clamp(moveMult, ROW_MOVE_MULT_MIN, ROW_MOVE_MULT_MAX);
  }

  poseRowKickMeshes() {
    /** Reverse travel: invert stroke timing so kicks read “rowing astern”. */
    const phase = this._rowPhaseLive + (this.speed < -0.06 ? Math.PI : 0);
    const stroke = /** @type {any} */ (this.playerMesh?.userData?.stroke);

    const relax = this.finished || this.playerDead || this._kickBlend < 0.015;

    if (relax) {
      if (stroke?.hindLPivot && stroke?.hindRPivot) {
        const rxL =
          stroke.hindLPivot.userData?.restKickX !== undefined ? stroke.hindLPivot.userData.restKickX : -0.16;
        const rxR =
          stroke.hindRPivot.userData?.restKickX !== undefined ? stroke.hindRPivot.userData.restKickX : -0.16;
        const ryL =
          stroke.hindLPivot.userData?.restKickY !== undefined ? stroke.hindLPivot.userData.restKickY : 0.32;
        const ryR =
          stroke.hindRPivot.userData?.restKickY !== undefined ? stroke.hindRPivot.userData.restKickY : -0.32;

        stroke.hindLPivot.rotation.x = rxL;
        stroke.hindRPivot.rotation.x = rxR;
        stroke.hindLPivot.rotation.y = ryL;
        stroke.hindRPivot.rotation.y = ryR;
        stroke.hindLPivot.rotation.z = 0;
        stroke.hindRPivot.rotation.z = 0;
      }
      if (stroke?.foreGroup) stroke.foreGroup.rotation.z = 0;
      if (stroke?.midGroup) stroke.midGroup.rotation.z = 0;
      if (this.playerMesh) {
        this.playerMesh.rotation.x = 0;
        this.playerMesh.rotation.z = 0;
      }
      return;
    }

    if (stroke?.hindLPivot && stroke?.hindRPivot) {
      const rxL =
        stroke.hindLPivot.userData?.restKickX !== undefined ? stroke.hindLPivot.userData.restKickX : -0.16;
      const rxR =
        stroke.hindRPivot.userData?.restKickX !== undefined ? stroke.hindRPivot.userData.restKickX : -0.16;
      const ryL =
        stroke.hindLPivot.userData?.restKickY !== undefined ? stroke.hindLPivot.userData.restKickY : 0.32;
      const ryR =
        stroke.hindRPivot.userData?.restKickY !== undefined ? stroke.hindRPivot.userData.restKickY : -0.32;

      /** Fore→aft: snapper backward stroke, softer blade recovery; dip only during drive */
      const b = this._kickBlend;

      const sinL = Math.sin(phase);
      const sinR = Math.sin(phase + Math.PI);

      const powL = legKickDrive(sinL);
      const powR = legKickDrive(sinR);
      const recL = legRecoveryPortion(sinL);
      const recR = legRecoveryPortion(sinR);

      stroke.hindLPivot.rotation.y = ryL + b * (ROW_YAW_POWER * powL - ROW_YAW_RECOVER * recL);
      stroke.hindRPivot.rotation.y = ryR + b * (ROW_YAW_POWER * powR - ROW_YAW_RECOVER * recR);

      const dipAmp = b * ROW_DIP_POWER;
      stroke.hindLPivot.rotation.x = rxL + dipAmp * powL;
      stroke.hindRPivot.rotation.x = rxR + dipAmp * powR;

      stroke.hindLPivot.rotation.z = -0.04 * b * powL * Math.sin(phase * 2);
      stroke.hindRPivot.rotation.z = -0.04 * b * powR * Math.sin((phase + Math.PI) * 2);
    }

    if (stroke?.foreGroup) stroke.foreGroup.rotation.z = Math.sin(phase * 1.92) * 0.065 * this._kickBlend;

    if (stroke?.midGroup) stroke.midGroup.rotation.z = Math.sin(phase * 2.05 + 0.55) * 0.058 * this._kickBlend * -1;

    if (this.playerMesh) {
      const kk = combinedKickDrive(phase);
      const b = this._kickBlend;
      this.playerMesh.rotation.x = -b * kk * 0.041;
      this.playerMesh.rotation.z = b * kk * Math.sin(phase * 2) * 0.022;
    }
  }

  collideDisk(ax, az, bx, bz, rA, rB) {
    const dx = ax - bx;
    const dz = az - bz;
    const rr = rA + rB;
    return dx * dx + dz * dz < rr * rr;
  }

  update(dt, time) {
    if (!this.track || dt <= 0) return;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;

    this.advanceVenomBiteTimers(dt);

    if (dt > 0 && this.playerDmgFlashT > 0) {
      this.playerDmgFlashT = Math.max(0, this.playerDmgFlashT - dt);
    }

    if (this.venomMeleeCd > 0) this.venomMeleeCd -= dt;
    if (this.venomSurgeT > 0) this.venomSurgeT -= dt;
    if (!this.playerDead && !this.finished) {
      const surgeMult = this.venomSurgeT > 0 ? VENOM_SURGE_MULT : 1;
      const passivePerSec =
        (this.venomMax / Math.max(VENOM.passiveRefillSeconds, 0.001)) * surgeMult;
      this.venom = Math.min(this.venomMax, this.venom + passivePerSec * dt);
    }

    const thrust = !!this.keys.thrust && !this.finished && !this.playerDead;
    /** <kbd>W</kbd> overrides <kbd>S</kbd>; <kbd>S</kbd>/<kbd>↓</kbd> brake then reverse. */
    const reverse =
      !!(this.keys.reverse && !this.keys.thrust && !this.finished && !this.playerDead);
    const steerL = !!this.keys.left;
    const steerR = !!this.keys.right;

    let softMult = 1;
    for (const b of this.track.bubbles) {
      if (this.collideDisk(this.pos.x, this.pos.z, b.position[0], b.position[1], PLAYER_RADIUS * 1.06, b.radius)) {
        softMult = Math.min(softMult, b.slowFactor);
      }
    }

    if (this.rippleObjs) {
      for (const { ripple: rp, meshes: rv } of this.rippleObjs) {
        const pulse = Math.sin(time * rp.pulseSpeed + rp.phase) * 0.1 + 1;
        const effR = rp.radius * pulse * 1.05;
        if (this.collideDisk(this.pos.x, this.pos.z, rp.position[0], rp.position[1], PLAYER_RADIUS * 1.06, effR)) {
          softMult = Math.min(softMult, rp.slowFactor);
        }
        rv.mesh.rotation.y = time * rp.pulseSpeed * 0.42;
        const s = THREE.MathUtils.clamp(pulse * 0.035 + 1, 1, 1.12);
        rv.mesh.scale.setScalar(s);
        const op = THREE.MathUtils.clamp(0.24 + (pulse - 0.9) * 0.75, 0.2, 0.54);
        rv.mat.opacity = op;
        rv.innerMat.opacity = THREE.MathUtils.clamp(op - 0.1, 0.12, 0.42);
      }
    }

    const foodCeiling =
      SPEED.baseMax + THREE.MathUtils.clamp(this.foodStacks, 0, 999) * SPEED.perFoodMax;
    const speedCeiling = Math.min(SPEED.absoluteMaxCap, foodCeiling * softMult);

    const accel = SPEED.baseAccel * (1 + this.foodStacks * 0.055);
    const revCeilAbs = Math.max(0.35, speedCeiling * SPEED.reverseMaxFrac);
    const revAccel = accel * SPEED.reverseAccelFrac;

    const yawInRaw = Number(steerL) - Number(steerR);
    if (yawInRaw !== 0 && !this.finished && !this.playerDead) {
      const stopped = Math.abs(this.speed) <= 0.035;
      const steerSign =
        stopped ? 1 : this.speed >= -0.025 ? 1 : -1;
      const yawIn = steerSign * yawInRaw;
      const spf = stopped
        ? SPEED.inPlaceTurnFrac
        : THREE.MathUtils.clamp(Math.abs(this.speed) / 8, 0.28, 1.22);
      this.yaw += yawIn * SPEED.turnRate * spf * dt;
    }

    if (this.finished) {
      const d = THREE.MathUtils.lerp(Math.abs(this.speed), 0, 1 - Math.exp(-4.2 * dt));
      this.speed = Math.sign(this.speed) * d;
    } else if (thrust) {
      this.speed += accel * dt;
      this.speed = THREE.MathUtils.clamp(this.speed, -revCeilAbs, speedCeiling);
    } else if (reverse) {
      this.speed -= revAccel * dt;
      this.speed = THREE.MathUtils.clamp(this.speed, -revCeilAbs, speedCeiling);
    } else {
      const d = THREE.MathUtils.lerp(
        Math.abs(this.speed),
        0,
        1 - Math.exp(-SPEED.waterDragLinear * dt)
      );
      this.speed = Math.sign(this.speed) * d;
      this.speed = THREE.MathUtils.clamp(this.speed, -revCeilAbs, speedCeiling);
    }

    const sn = Math.sin(this.yaw);
    const cs = Math.cos(this.yaw);

    const rowBoost = this.syncRowKickDynamics(time, thrust, reverse, dt, speedCeiling);
    this.pos.x += sn * this.speed * rowBoost * dt;
    this.pos.z += cs * this.speed * rowBoost * dt;

    this.playerMesh.position.copy(this.pos);
    this.playerMesh.rotation.y = this.yaw;
    this.poseRowKickMeshes();

    if (this.playerMesh && this.playerDmgFlashT > 0) {
      const kk = THREE.MathUtils.clamp(this.playerDmgFlashT / 0.52, 0, 1);
      this.playerMesh.rotation.z += Math.sin(time * 138) * 0.086 * kk;
    }

    const forward = this.camScratch.set(sn, 0, cs);

    const lookPt = new THREE.Vector3(
      this.pos.x + forward.x * 3.2,
      this.pos.y + 0.9,
      this.pos.z + forward.z * 3.2
    );
    const camWish = new THREE.Vector3(this.pos.x - forward.x * 11.8, this.pos.y + 10.2, this.pos.z - forward.z * 11.8);
    this.camera.position.lerp(camWish, 1 - Math.exp(-3.85 * dt));
    this.camera.lookAt(lookPt);

    const hard = () => this.applyHardImpact();
    for (const l of this.track.lilies) {
      const hit = this.collideDisk(this.pos.x, this.pos.z, l.position[0], l.position[1], PLAYER_RADIUS, l.radius);
      if (hit) hard();
    }

    for (const grp of this.fishInst) {
      const fd = grp.userData.fishData;
      advanceFish(grp, fd, dt);
      grp.position.y = fd.y + Math.sin(time * 2.1 + fd.position[0] * 0.12) * 0.05;
      const bodyR = Math.max(fd.length, fd.width) * 0.36;
      if (this.collideDisk(this.pos.x, this.pos.z, grp.position.x, grp.position.z, PLAYER_RADIUS, bodyR)) hard();
    }

    for (const grp of this.racerInst) {
      const rcfg = grp.userData.racerCfg;
      advanceRival(grp, rcfg, dt);
      grp.position.y = rcfg.y ?? 0.35;
      const bodyR = 1.06;
      if (this.collideDisk(this.pos.x, this.pos.z, grp.position.x, grp.position.z, PLAYER_RADIUS, bodyR)) hard();
    }

    for (const grp of this.predatorInst) {
      const pd = grp.userData.predCfg;
      const live = grp.userData.live;
      if (!pd || !live || live.hpNow <= 0) {
        grp.visible = false;
        continue;
      }
      grp.visible = true;

      const idle = grp.userData.idlePhase ?? 0;

      let dmgSqu = grp.userData.dmgSquashT ?? 0;
      if (dmgSqu > 0) dmgSqu -= dt;
      grp.userData.dmgSquashT = Math.max(0, dmgSqu);

      const engageSq = pd.engageRadius * pd.engageRadius;
      const kick =
        grp.userData.dmgSquashT > 0
          ? Math.sin(time * 124 + idle) *
            THREE.MathUtils.clamp(grp.userData.dmgSquashT / 0.44, 0, 1) *
            0.28
          : 0;

      advanceMozzieTowardPlayer(
        grp,
        dt,
        this.pos.x,
        this.pos.z,
        pd.chaseSpeed,
        live.homeX,
        live.homeZ,
        engageSq,
        time,
        kick
      );

      const baseY = grp.userData.baseY ?? pd.position[1];
      grp.position.y = baseY + Math.sin(time * 16.4 + idle) * 0.038;

      const hud = grp.userData.hpHud;
      if (hud?.draw && live.hpMax > 0.001) {
        const hpR = THREE.MathUtils.clamp(live.hpNow / live.hpMax, 0, 1);
        const dmgFrac = THREE.MathUtils.clamp(1 - hpR, 0, 1);
        const pr = grp.userData.dmgSquashT > 0 ? THREE.MathUtils.clamp(grp.userData.dmgSquashT / 0.44, 0, 1) : 0;
        const snap = `${live.hpNow.toFixed(4)}:${pr.toFixed(3)}:${dmgFrac.toFixed(3)}`;
        if (grp.userData._predHudSnap !== snap) {
          grp.userData._predHudSnap = snap;
          hud.draw(hpR, dmgFrac, pr);
        }
      }

      this.tryEnemyRangedFire(grp, pd, live, dt, this.pos.x, this.pos.z);

      const meleeR = this.predatorMeleeEnvelopeRadius(grp, pd);
      const hullOverlap = this.collideDisk(
        this.pos.x,
        this.pos.z,
        grp.position.x,
        grp.position.z,
        PLAYER_RADIUS,
        meleeR
      );

      let weakHit = false;
      const weakArr = pd.weakSpots;
      if (Array.isArray(weakArr) && weakArr.length > 0) {
        for (let wi = 0; wi < weakArr.length; wi += 1) {
          const w = weakArr[wi];
          this._predWeakScratch.set(w.offset[0], w.offset[1], w.offset[2]);
          grp.localToWorld(this._predWeakScratch);
          const sr = typeof w.radius === "number" && Number.isFinite(w.radius) ? w.radius : 0.45;
          const sWorld = sr * grp.scale.x;
          if (
            this.collideDisk(
              this.pos.x,
              this.pos.z,
              this._predWeakScratch.x,
              this._predWeakScratch.z,
              PLAYER_RADIUS,
              sWorld
            )
          ) {
            weakHit = true;
            break;
          }
        }
      }

      let parasite = 0;
      if (weakArr?.length) {
        if (weakHit) parasite = pd.damage;
        else if (hullOverlap) parasite = pd.shellContactBleed ?? 0;
      } else if (hullOverlap) {
        parasite = pd.damage;
      }

      const inContact = parasite > 1e-6 && (weakHit || hullOverlap);
      if (inContact && !this.playerDead && !this.finished) {
        live.biteCd -= dt;
        if (live.biteCd <= 0) {
          this.applyParasiteBleed(parasite);
          live.biteCd = pd.biteIntervalSec;
        }
      } else {
        live.biteCd = THREE.MathUtils.clamp(live.biteCd, 0, pd.biteIntervalSec);
      }

      this.predWakeStrikeFlashTick(grp, dt);
    }

    this.advanceEnemyRangedBolts(dt, this.pos.x, this.pos.z);

    for (let i = 0; i < this.track.food.length; i++) {
      const fd = this.track.food[i];
      if (!fd.active || this.playerDead) continue;
      if (
        this.collideDisk(
          this.pos.x,
          this.pos.z,
          fd.position[0],
          fd.position[2],
          PLAYER_RADIUS,
          fd.radius ?? 0.85
        )
      ) {
        fd.active = false;
        const mesh = this.foodMeshes[i];
        if (mesh) mesh.visible = false;

        const gain = fd.stacks ?? 1;
        this.foodStacks += gain;

        const per = pickupPointsForFood(fd);
        this.points += per * gain;

        this.health = Math.min(this.healthMax, this.health + FOOD_HEAL);
        this.venom = Math.min(this.venomMax, this.venom + VENOM.foodChunk);
        this.venomSurgeT = Math.max(this.venomSurgeT, VENOM_SURGE_SECONDS);
      }
    }

    if (!this.finished && !this.playerDead) this.updateCheckpoint();

    if (!this.playerDead) this.maybeFinishBuffetVictory();

    this.consumeVenomStrikeAttempt();

    this.refreshPlayerHudStrip();

    this.updateCourseVisuals(dt, time);
  }

  updateCourseVisuals(_dt, elapsed) {
    const buoys = this.checkpointBuoys;
    if (!buoys?.length) return;

    const bob = Math.sin(elapsed * 4.35);
    const ringPulse = bob * 0.042;

    for (const b of buoys) {
      const active = !this.finished && b.index === this.nextCp;

      if (active) {
        b.ringMat.color.setHex(0xffeecb);
        b.ringMat.emissive.setHex(0xff8822);
        b.ringMat.emissiveIntensity = THREE.MathUtils.clamp(0.55 + bob * 0.22, 0.42, 0.92);
        b.ringMat.opacity = THREE.MathUtils.clamp(0.93 + bob * 0.05, 0.76, 1);
      } else {
        b.ringMat.color.setHex(0x4abef2);
        b.ringMat.emissive.setHex(0x1a5580);
        b.ringMat.emissiveIntensity = 0.065;
        b.ringMat.opacity = 0.5;
      }

      if (b.ring) {
        b.ring.scale.setScalar(active ? 1 + ringPulse : 1);
      }
    }

    const ribbon = this.courseRibbonObj?.material;
    if (ribbon) {
      ribbon.emissiveIntensity = 0.22 + bob * 0.08;
    }
  }

  nextGoalHudLine() {
    if (!this.track || this.finished || this.playerDead) return "";
    const cps = this.track.checkpoints;
    if (!cps || cps.length === 0) return "";

    const cp = cps[this.nextCp];
    const dx = cp.position[0] - this.pos.x;
    const dz = cp.position[2] - this.pos.z;
    const dist = Math.hypot(dx, dz);

    const sn = Math.sin(this.yaw);
    const cs = Math.cos(this.yaw);
    const toTarget = Math.atan2(dx, dz);
    const steerRev = this.speed < -0.05;
    const motionSn = steerRev ? -sn : sn;
    const motionCs = steerRev ? -cs : cs;
    const facing = Math.atan2(motionSn, motionCs);
    let headingErr = THREE.MathUtils.euclideanModulo(toTarget - facing + Math.PI, Math.PI * 2) - Math.PI;

    let turn = "";
    if (headingErr > 0.52) turn = ', veer <kbd>D</kbd> / right';
    else if (headingErr < -0.52) turn = ', veer <kbd>A</kbd> / left';

    return `Follow aqua ribbon → <strong>gate ${escapeHtml(String(this.nextCp + 1))}</strong> ~${escapeHtml(dist.toFixed(0))} units${turn}`;
  }

  maybeFinishBuffetVictory() {
    if (!this.track) return;
    const meals = this.track.food ?? [];
    if (meals.length === 0 || !meals.every((f) => !f.active)) return;

    if (!this.scoreFlags.mealSweepBonus) {
      const bonus = this.track.metadata.allFoodClearBonus ?? 520;
      this.points += bonus;
      this.scoreFlags.mealSweepBonus = true;
    }

    if (this.finished) return;

    this.winReason = "buffet";
    this.finished = true;
    this.speed *= 0.08;
  }

  updateCheckpoint() {
    const cps = this.track.checkpoints;
    if (!cps || cps.length === 0 || this.finished) return;
    const cp = cps[this.nextCp];
    const dx = cp.position[0] - this.pos.x;
    const dz = cp.position[2] - this.pos.z;
    if (dx * dx + dz * dz < cp.radius * cp.radius) {
      const last = this.nextCp === cps.length - 1;
      if (last) {
        const lapPts = this.track.metadata.lapScoreBonus ?? 230;
        this.points += lapPts;
        this.completedLaps += 1;
        if (this.completedLaps >= this.track.metadata.laps) {
          this.finished = true;
          if (!this.winReason) this.winReason = "laps";
        }
      }
      this.nextCp = (this.nextCp + 1) % cps.length;
    }
  }

  hudHtml() {
    if (!this.track) return "";
    const name = escapeHtml(this.track.metadata.name);
    const totalLaps = this.track.metadata.laps;
    const meals = this.track.food ?? [];
    const nibbled = meals.filter((f) => !f.active).length;
    const lapLine = `${this.completedLaps}/${totalLaps}`;
    const spd = (Math.abs(this.speed) * 3.6).toFixed(1);

    const larvaeAlive = Array.isArray(this.predatorInst)
      ? this.predatorInst.reduce(
          (n, grp) => n + ((grp?.userData?.live?.hpNow ?? 0) > 0 ? 1 : 0),
          0
        )
      : 0;

    let done = "";
    if (this.finished) {
      if (this.winReason === "buffet") {
        done = `<div style="color:#bfffc4;margin-top:4px;"><strong>You cleared every bite.</strong></div>`;
      } else if (this.winReason === "laps") {
        done = `<div style="color:#bfffc4;margin-top:4px;"><strong>You finished ${escapeHtml(String(totalLaps))} lap(s).</strong></div>`;
      } else {
        done = `<div style="color:#bfffc4;margin-top:4px;"><strong>Race complete.</strong></div>`;
      }

      done += `<div style="margin-top:4px;"><strong>Total points: ${escapeHtml(String(this.points))}</strong></div>`;
    }

    const hpW = THREE.MathUtils.clamp((this.health / Math.max(this.healthMax, 1)) * 100, 0, 100);
    const vnW = THREE.MathUtils.clamp((this.venom / Math.max(this.venomMax, 1)) * 100, 0, 100);

    let hurt = "";
    if (this.playerDead) {
      hurt = `<div style="color:#ff9eab;margin-top:5px;line-height:1.45;"><strong>Hull breached.</strong> Mosquito larvae had the final bite — tap <kbd>R</kbd>.</div>`;
    }

    const surgeNote =
      this.venomSurgeT > 0
        ? ` <span style="color:#d6cbff;font-size:11px;opacity:.9">(digested prey → faster saliva refill)</span>`
        : "";

    const vitals = `<div style="margin-top:6px;line-height:1.35;display:flex;flex-direction:column;gap:7px">${hurt}
<div>
  <span style="opacity:.82;font-size:11px">Hull integrity (${Math.round(this.health)}/${Math.round(this.healthMax)})</span>
  <div style="margin-top:2px;height:9px;background:rgba(0,0,0,.3);border-radius:4px;overflow:hidden;border:1px solid rgba(180,235,215,.28)"><div style="height:100%;width:${escapeHtml(String(hpW.toFixed(1)))}%;background:linear-gradient(90deg,#2ad8a9,#71f0c9)"></div></div>
</div>
<div>
  <span style="opacity:.82;font-size:11px">Venom saliva (${Math.round(this.venom)}/${Math.round(this.venomMax)})${surgeNote}</span>
  <div style="margin-top:2px;height:9px;background:rgba(0,0,0,.3);border-radius:4px;overflow:hidden;border:1px solid rgba(210,180,255,.24)"><div style="height:100%;width:${escapeHtml(String(vnW.toFixed(1)))}%;background:linear-gradient(90deg,#7b5bdc,#cfa8ff)"></div></div>
</div>
</div>`;

    let goalHtml = "";
    const navHint = !this.finished && !this.playerDead ? this.nextGoalHudLine() : "";
    if (navHint) {
      goalHtml = `<div style="color:#aaf0ff;margin-top:3px;line-height:1.45">${navHint}</div>`;
    }

    const grazingLine =
      larvaeAlive > 0
        ? `<span style="opacity:.75"> Grazers left: <strong>${larvaeAlive}</strong></span>`
        : `<span style="opacity:.72"> Grazers cleared</span>`;

    let footer = "";
    if (this.playerDead || this.finished) {
      footer = `<span style="opacity:.75">Pick another course or <kbd>R</kbd>.</span>${grazingLine}`;
    } else {
      footer = `<span style="opacity:.75"><kbd>W</kbd>/<kbd>↑</kbd> forward · <kbd>S</kbd>/<kbd>↓</kbd> reverse · <kbd>A</kbd><kbd>D</kbd> steer (works while stationary) · <kbd>Space</kbd> venom spray cone (ranges ahead; nearer larvae take heavier venom) · <kbd>R</kbd> reset.<br>${grazingLine}</span>`;
    }

    const rows = [
      `<strong>${name}</strong> <span style="opacity:.76;font-weight:500;font-size:11px;">backswimmer (Notonectidae)</span>`,
      goalHtml,
      vitals,
      `Points ${this.points} · Snacks ${nibbled}/${Math.max(meals.length, 0)}`,
      `Speed≈ ${spd} · Food stacks ${this.foodStacks} · Gate ${this.nextCp + 1}/${Math.max(this.track.checkpoints.length, 1)} · Laps ${lapLine}`,
      done,
      footer,
    ];
    return rows.join("");
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}