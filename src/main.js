import * as THREE from "three";
import { Game } from "./Game.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const loading = /** @type {HTMLDivElement} */ (document.getElementById("loading"));
const hudStats = /** @type {HTMLDivElement} */ (document.getElementById("hud-stats"));
const scoreHud = /** @type {HTMLDivElement | null} */ (document.getElementById("score-hud"));
const pauseGuide = /** @type {HTMLDivElement | null} */ (document.getElementById("pause-guide"));
const deathOverlay = /** @type {HTMLDivElement | null} */ (document.getElementById("death-overlay"));
const pauseOverlay = /** @type {HTMLDivElement | null} */ (document.getElementById("pause-overlay"));
const select = /** @type {HTMLSelectElement} */ (document.getElementById("track-file"));

/** @type {Game | null} */
let active = null;
let restarting = false;

async function attachTrack(url) {
  if (restarting) return;
  restarting = true;
  loading?.classList.remove("hidden");
  loading.textContent = url === "procedural" ? "Generating procedural pond…" : `Loading ${url}`;

  try {
    const prev = active;
    active = null;
    if (prev) prev.dispose();

    const game = new Game(canvas, url);
    await game.init();
    active = game;
    loading?.classList.add("hidden");
  } catch (e) {
    const msg =
      typeof e?.message === "string"
        ? e.message
        : "Unknown error loading track (check DevTools Console).";
    loading?.classList.remove("hidden");
    loading.textContent =
      `Could not load ${url}: ${msg} — open this folder via a local web server (` +
      `for example Python: python3 -m http.server) so fetch() works.`;
    console.error(e);
  }

  restarting = false;
}

select?.addEventListener("change", () => {
  attachTrack(select.value);
});

await attachTrack(select?.value || "tracks/tutorial.yaml");

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
