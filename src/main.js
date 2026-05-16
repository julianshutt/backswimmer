import * as THREE from "three";
import { Game } from "./Game.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const loading = /** @type {HTMLDivElement} */ (document.getElementById("loading"));
const hudStats = /** @type {HTMLDivElement} */ (document.getElementById("hud-stats"));
const scoreHud = /** @type {HTMLDivElement | null} */ (document.getElementById("score-hud"));
const pauseGuide = /** @type {HTMLDivElement | null} */ (document.getElementById("pause-guide"));
const deathOverlay = /** @type {HTMLDivElement | null} */ (document.getElementById("death-overlay"));
const pauseOverlay = /** @type {HTMLDivElement | null} */ (document.getElementById("pause-overlay"));

const debugTrackBar = /** @type {HTMLDivElement | null} */ (document.getElementById("debug-track-bar"));
const debugTrackSelect = /** @type {HTMLSelectElement | null} */ (
  document.getElementById("debug-track-select")
);

const urlParams = new URLSearchParams(window.location.search);
const DEBUG_MODE =
  urlParams.has("debug") ||
  urlParams.get("debug") === "1" ||
  urlParams.get("debug") === "true";

/** Canonical entry: procedural generator (`Game` reads this as `"procedural"`). */
const DEFAULT_TRACK_URL = "procedural";

/**
 * Debug bar options — values are `Game` track URLs (`fetch` from page origin).
 * Predator `type` strings match `predatorMesh` / `PRED_KIND_DEFAULTS` in `trackLoader.js`.
 */
const DEBUG_TRACK_ENTRIES = [
  { label: "Procedural pond", value: "procedural" },
  { label: "Tutorial (YAML)", value: "tracks/tutorial.yaml" },
  { label: "Lily loop (YAML)", value: "tracks/lily_loop.yaml" },
  { label: "Debug · all enemies", value: "tracks/debug/arena_all_enemies.yaml" },
  { label: "Debug · mosquito_larva", value: "tracks/debug/arena_mosquito_larva.yaml" },
  { label: "Debug · planarian_spitter", value: "tracks/debug/arena_planarian_spitter.yaml" },
  { label: "Debug · daphnid_charger", value: "tracks/debug/arena_daphnid_charger.yaml" },
  { label: "Debug · hydra_pod", value: "tracks/debug/arena_hydra_pod.yaml" },
  { label: "Debug · waterscorpion_tank", value: "tracks/debug/arena_waterscorpion_tank.yaml" },
];

const splashInner = /** @type {HTMLDivElement | null} */ (document.getElementById("splash-inner"));
const splashError = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById("splash-error")
);
const loadingBusy = /** @type {HTMLDivElement | null} */ (document.getElementById("loading-busy"));
const loadingBusyMsg = /** @type {HTMLParagraphElement | null} */ (
  document.getElementById("loading-busy-msg")
);

/** @type {Game | null} */
let active = null;
let restarting = false;

function resetSplashOverlayUi() {
  splashInner?.classList.remove("hidden");
  splashError && (splashError.textContent = "");
  loadingBusy?.classList.add("hidden");
  if (loadingBusyMsg) loadingBusyMsg.textContent = "";
}

function showSplashLoadingPhase(url) {
  splashInner?.classList.add("hidden");
  loadingBusy?.classList.remove("hidden");
  splashError && (splashError.textContent = "");
  if (loadingBusyMsg) {
    loadingBusyMsg.textContent =
      url === "procedural" ? "Generating procedural pond…" : `Loading ${url}`;
  }
}

function populateDebugTrackSelect() {
  if (!debugTrackSelect) return;
  debugTrackSelect.textContent = "";

  const addGroup = (title, slice) => {
    const og = document.createElement("optgroup");
    og.label = title;
    for (const e of slice) {
      const o = document.createElement("option");
      o.value = e.value;
      o.textContent = e.label;
      og.appendChild(o);
    }
    debugTrackSelect.appendChild(og);
  };

  addGroup("Shipped", DEBUG_TRACK_ENTRIES.slice(0, 3));
  addGroup("Debug · one grazer each", DEBUG_TRACK_ENTRIES.slice(3));
}

function syncDebugTrackSelect(url) {
  if (!DEBUG_MODE || !debugTrackSelect) return;
  const ok = Array.from(debugTrackSelect.options).some((o) => o.value === url);
  if (ok) debugTrackSelect.value = url;
}

function desiredStartTrackUrl() {
  if (DEBUG_MODE && debugTrackSelect?.value) return debugTrackSelect.value;
  return DEFAULT_TRACK_URL;
}

if (DEBUG_MODE) {
  populateDebugTrackSelect();
  debugTrackBar?.classList.remove("hidden");
  debugTrackBar?.setAttribute("aria-hidden", "false");
  debugTrackSelect?.addEventListener("change", () => {
    if (debugTrackSelect?.value) attachTrack(debugTrackSelect.value);
  });
  const splashSub = document.querySelector("#splash-inner .splash-sub");
  if (splashSub) {
    splashSub.textContent =
      "Debug mode: pick Track (lower-left), then Play — swap anytime to reload.";
  }
}

async function attachTrack(url) {
  if (restarting) return;
  restarting = true;
  loading?.classList.remove("hidden");
  showSplashLoadingPhase(url);

  try {
    const prev = active;
    active = null;
    if (prev) prev.dispose();

    const game = new Game(canvas, url);
    await game.init();
    active = game;
    loading?.classList.add("hidden");
    resetSplashOverlayUi();
    syncDebugTrackSelect(url);
  } catch (e) {
    const detail =
      typeof e?.message === "string"
        ? e.message
        : "Unknown error loading track (check DevTools Console).";
    const msg =
      `Could not load ${url}: ${detail} — open this folder via a local web server (` +
      `for example Python: python3 -m http.server) so fetch() works.`;
    splashError && (splashError.textContent = msg);
    loadingBusy?.classList.add("hidden");
    splashInner?.classList.remove("hidden");
    if (loadingBusyMsg) loadingBusyMsg.textContent = "";
    loading?.classList.remove("hidden");
    console.error(e);
  }

  restarting = false;
}

function startGameFromSplash() {
  attachTrack(desiredStartTrackUrl());
}

document.getElementById("start-game")?.addEventListener("click", () => {
  startGameFromSplash();
});

/** Title screen only: Enter starts the pond (ignored while generating or already playing). */
document.addEventListener("keydown", (e) => {
  if (e.code !== "Enter" && e.code !== "NumpadEnter") return;
  if (active || restarting) return;
  if (loading?.classList.contains("hidden")) return;
  e.preventDefault();
  startGameFromSplash();
});

resetSplashOverlayUi();

const clock = new THREE.Clock();
(function loop() {
  requestAnimationFrame(loop);
  if (!active) {
    pauseOverlay?.classList.add("hidden");
    pauseOverlay?.setAttribute("aria-hidden", "true");
    if (pauseGuide) pauseGuide.innerHTML = "";
    if (scoreHud) scoreHud.innerHTML = "";
    if (deathOverlay) {
      deathOverlay.innerHTML = "";
      deathOverlay.classList.add("hidden");
      deathOverlay.setAttribute("aria-hidden", "true");
    }
    return;
  }
  const dtRaw = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  const capped = Math.min(dtRaw, 1 / 20);

  /** While playing, stash wall-clock elapsed so shaders / bob stay frozen mid-pause. */
  if (!active.paused) active._simFreezeTime = elapsed;
  const tSim = active._simFreezeTime;
  const dtSim = active.paused ? 0 : capped;

  active.update(dtSim, tSim);
  active.render();
  if (hudStats) hudStats.innerHTML = active.hudHtml();
  if (scoreHud) scoreHud.innerHTML = active.scoreHudHtml();

  const death = active.deathOverlayInnerHtml();
  if (deathOverlay) {
    deathOverlay.innerHTML = death.html;
    const showDeath = !!(death.show && death.html);
    deathOverlay.classList.toggle("hidden", !showDeath);
    deathOverlay.setAttribute("aria-hidden", showDeath ? "false" : "true");
  }

  const p = active.paused;
  if (pauseGuide) pauseGuide.innerHTML = p ? active.pauseGuideHtml() : "";
  if (pauseOverlay) {
    pauseOverlay.classList.toggle("hidden", !p);
    pauseOverlay.setAttribute("aria-hidden", p ? "false" : "true");
  }
})();
