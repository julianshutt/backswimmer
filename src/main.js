import * as THREE from "three";
import { Game } from "./Game.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
const loading = /** @type {HTMLDivElement} */ (document.getElementById("loading"));
const hudStats = /** @type {HTMLDivElement} */ (document.getElementById("hud-stats"));
const select = /** @type {HTMLSelectElement} */ (document.getElementById("track-file"));

/** @type {Game | null} */
let active = null;
let restarting = false;

async function attachTrack(url) {
  if (restarting) return;
  restarting = true;
  loading?.classList.remove("hidden");
  loading.textContent = `Loading ${url}`;

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
  if (!active) return;
  const dt = Math.min(clock.getDelta(), 1 / 20);
  const t = clock.getElapsedTime();
  active.update(dt, t);
  active.render(t);
  if (hudStats) hudStats.innerHTML = active.hudHtml();
})();
