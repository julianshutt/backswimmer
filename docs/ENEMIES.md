# Enemies reference

Sandbox track with **every predator** plus **Daphnia flocks**:

`tracks/debug/arena_all_enemies.yaml`

Enable **Debug** mode and pick **Debug · all enemies** in the track bar, or load that YAML via your usual flow.

**Diagrams** below are **inline SVG** (schematic silhouettes from the same dimensions and colors as the Three.js meshes in `src/sceneMeshes.js`). They are not in-engine renders.

| Enemy / flock | Mesh builder (source of truth for the diagram) |
|---------------|-----------------------------------------------|
| Mosquito larva | `predatorMozzieMesh` |
| Planarian | `predatorPlanarianMesh` (`wormCurve`, `headAimGrp`) |
| Daphnid charger | `predatorDaphnidMesh` |
| Hydra pod | `predatorHydraPodMesh` |
| Waterscorpion tank | `predatorWaterScorpionTankMesh` |
| Daphnia flock member | `daphniaFlockMemberMesh` |

---

## Mosquito larva (`mosquito_larva`)

<p align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 200" width="420" height="200" aria-labelledby="title-mozzie">
  <title id="title-mozzie">Mosquito larva — schematic side silhouette from predatorMozzieMesh (sceneMeshes.js)</title>
  <rect width="420" height="200" fill="#0a1c24"/>
  <g transform="translate(10,100)">
    <path fill="#6f5238" d="M-8,-12 L-42,-6 L-38,8 L-6,10 Z"/>
    <ellipse cx="-58" cy="2" rx="14" ry="7" fill="#6f5238" opacity="0.9"/>
    <path fill="#a88863" stroke="#c96f4a" stroke-width="0.5" opacity="0.95"
      d="M-95,6 Q-88,-10 -78,-8 L-52,-6 Q-38,-14 -28,-6 L-12,-5 Q2,-12 12,-3 L28,-4 Q38,-10 48,2 L48,10 Q38,18 28,14 L12,16 Q2,22 -12,14 L-28,15 Q-38,22 -52,14 L-78,18 Q-88,20 -95,6Z"/>
    <ellipse cx="-102" cy="8" rx="10" ry="6" fill="#dcc4a8" opacity="0.55"/>
    <ellipse cx="6" cy="2" rx="34" ry="26" fill="#b89a72"/>
    <ellipse cx="-8" cy="12" rx="22" ry="15" fill="#b89a72" opacity="0.88"/>
    <ellipse cx="58" cy="4" rx="20" ry="16" fill="#3d3024"/>
    <line x1="62" y1="12" x2="72" y2="22" stroke="#e8d4bc" stroke-width="2" opacity="0.7"/>
    <line x1="58" y1="14" x2="68" y2="26" stroke="#e8d4bc" stroke-width="2" opacity="0.7"/>
    <line x1="54" y1="12" x2="60" y2="24" stroke="#e8d4bc" stroke-width="2" opacity="0.7"/>
  </g>
  <text x="210" y="188" fill="#5a7a88" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">Side view · +Z → · colors from COLORS.mozzie*</text>
</svg>

</p>

| Mechanism | Detail |
|-----------|--------|
| **Role** | Aggressive grazer / hull parasite |
| **Movement** | Patrols near spawn until you enter **engage radius**, then chases. **Latches** to a point slightly **aft of your keel** (same heading as you) for a limited “stuck” run, then **backs off** toward its home and patrols again. |
| **Damage** | **Melee** on hull overlap: repeated **parasite bleed** on an interval (`biteIntervalSec`). Cone-based venom bite from the player can chip HP via **weak-centroid** rules (no armour weak spots). |
| **Presentation** | Attack pose animates the rig; head **aims at the swimmer** while stalking / latched. |

**Defaults (YAML overrides allowed):** see `PRED_KIND_DEFAULTS.mosquito_larva` in `src/trackLoader.js`.

---

## Planarian spitter (`planarian_spitter`)

<p align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 200" width="420" height="200" aria-labelledby="title-planarian">
  <title id="title-planarian">Planarian — wormCurve CatmullRom points projected (XZ), sceneMeshes.js</title>
  <rect width="420" height="200" fill="#1a1220"/>
  <path fill="none" stroke="#f5e8f0" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"
    d="M 48 104 C 95 118, 125 72, 175 96 S 255 88, 305 100 S 365 92, 378 104"/>
  <path fill="none" stroke="#d95aa4" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"
    d="M 48 104 C 95 118, 125 72, 175 96 S 255 88, 305 100 S 365 92, 378 104"/>
  <circle cx="318" cy="88" r="5" fill="#1a1018"/>
  <circle cx="332" cy="98" r="5" fill="#1a1018"/>
  <ellipse cx="384" cy="104" rx="12" ry="7" fill="#d95aa4" opacity="0.95"/>
  <ellipse cx="205" cy="96" rx="10" ry="4" fill="none" stroke="#4a2740" stroke-width="2" transform="rotate(-8 205 96)"/>
  <ellipse cx="350" cy="90" rx="16" ry="8" fill="none" stroke="#ff8fd8" stroke-width="2" opacity="0.8"/>
  <text x="210" y="188" fill="#886688" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">XZ projection of wormCurve · anterior right</text>
</svg>

</p>

| Mechanism | Detail |
|-----------|--------|
| **Role** | Soft, calm chaser with **ranged toxin globs** |
| **Melee** | Light bite / **shell contact bleed** on overlap; lower base melee than larva. |
| **Ranged** | **Pink glob** projectile toward you (with **lead bias**). **Head / sucker aim** at you while lining up and right after a shot. Projectile size uses a **smaller base radius** plus slight **per-shot random** scale. |
| **Movement** | After a successful spit: **snake-like retreat** away from you, **idle** a few seconds, then **stalks again** like other grazers. No volleys during retreat / wait. |
| **Spawn point** | Glob exits from the **head pivot** (mouth end), not the generic mozzie offset. |

**Defaults:** `planarian_spitter` in `src/trackLoader.js`.

---

## Daphnid charger (`daphnid_charger`)

<p align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 200" width="420" height="200" aria-labelledby="title-daphnid">
  <title id="title-daphnid">Daphnid charger — valve layout from predatorDaphnidMesh</title>
  <rect width="420" height="200" fill="#0c2420"/>
  <g transform="translate(210,100)">
    <ellipse cx="-38" cy="6" rx="28" ry="42" fill="#3aab98" opacity="0.82" transform="rotate(-12 -38 6)"/>
    <ellipse cx="38" cy="6" rx="28" ry="42" fill="#3aab98" opacity="0.82" transform="rotate(12 38 6)"/>
    <rect x="-6" y="-48" width="12" height="88" rx="2" fill="#1d6b5c" opacity="0.55" transform="rotate(90)"/>
    <ellipse cx="2" cy="4" rx="22" ry="14" fill="#7ef3d9" opacity="0.45"/>
    <path fill="#4ac4b0" d="M-6,-58 L6,-58 L0,-92 Z"/>
    <circle cx="0" cy="-78" r="10" fill="#0a0408"/>
    <circle cx="0" cy="-82" r="9" fill="#cfffff" opacity="0.35"/>
    <line x1="52" y1="-8" x2="92" y2="-48" stroke="#8ad4ce" stroke-width="3" stroke-linecap="round"/>
    <line x1="-52" y1="-8" x2="-92" y2="-48" stroke="#8ad4ce" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="8" cy="34" rx="12" ry="7" fill="#5ec4b8" opacity="0.45"/>
    <path fill="#3aab98" d="M-4,58 L4,58 L0,82 Z" opacity="0.9"/>
  </g>
  <text x="210" y="188" fill="#5aa090" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">Top-ish schematic · rostrum toward top of frame</text>
</svg>

</p>

| Mechanism | Detail |
|-----------|--------|
| **Role** | Fast **cladoceran-style** charger |
| **Movement** | Same stalk pattern as generic grazers: idle near **home** until you are inside **engage radius**, then **chases** your position. |
| **Damage** | **Melee-only**: parasite bleed ticks on hull contact; **low HP** (often one good venom bite). |
| **Presentation** | Hinged shell / rostrum mesh; no ranged. |

**Defaults:** `daphnid_charger` in `src/trackLoader.js`.

---

## Hydra pod (`hydra_pod`)

<p align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 200" width="420" height="200" aria-labelledby="title-hydra">
  <title id="title-hydra">Hydra pod — stalk, bulb, 5 tentacle tubes from predatorHydraPodMesh</title>
  <rect width="420" height="200" fill="#0c1814"/>
  <g transform="translate(210,28)">
    <ellipse cx="0" cy="38" rx="52" ry="30" fill="#558f6f" opacity="0.92" stroke="#c8fff1" stroke-width="1"/>
    <ellipse cx="0" cy="56" rx="36" ry="10" fill="none" stroke="#7aab8c" stroke-width="3" transform="rotate(-10)"/>
    <path fill="#3d5c48" d="M-14,68 Q-8,118 0,138 L0,148 Q16,118 14,68 Z"/>
    <ellipse cx="0" cy="152" rx="40" ry="12" fill="#3d5c48"/>
    <ellipse cx="4" cy="24" rx="10" ry="6" fill="#0c1812"/>
    <path fill="none" stroke="#7aab8c" stroke-width="4" stroke-linecap="round" d="M 62,8 Q 95,75 120,115"/>
    <path fill="none" stroke="#7aab8c" stroke-width="4" stroke-linecap="round" d="M 38,-22 Q 55,50 72,108"/>
    <path fill="none" stroke="#7aab8c" stroke-width="4" stroke-linecap="round" d="M -38,-22 Q -55,50 -72,108"/>
    <path fill="none" stroke="#7aab8c" stroke-width="4" stroke-linecap="round" d="M -62,8 Q -95,75 -120,115"/>
    <path fill="none" stroke="#7aab8c" stroke-width="4" stroke-linecap="round" d="M 0,-28 Q 0,45 0,108"/>
    <circle cx="120" cy="115" r="9" fill="#e8ffff" opacity="0.88"/>
    <circle cx="72" cy="108" r="9" fill="#e8ffff" opacity="0.88"/>
    <circle cx="-72" cy="108" r="9" fill="#e8ffff" opacity="0.88"/>
    <circle cx="-120" cy="115" r="9" fill="#e8ffff" opacity="0.88"/>
    <circle cx="0" cy="108" r="9" fill="#e8ffff" opacity="0.88"/>
  </g>
  <text x="210" y="188" fill="#6a9880" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">Stylized front · 5× TubeGeometry tentacles</text>
</svg>

</p>

| Mechanism | Detail |
|-----------|--------|
| **Role** | Mostly **stationary / slow** polyp analogue |
| **Melee** | Preset has negligible melee `damage`; engagement is about **ranged**. |
| **Ranged** | **Cyan-styled** projectiles on cooldown; high **max range** / chunky **projectile radius** relative to planarian. |
| **Movement** | Very low **chaseSpeed** — barely nudges toward you inside engage bubble. |

**Defaults:** `hydra_pod` in `src/trackLoader.js`.

---

## Waterscorpion tank (`waterscorpion_tank`)

<p align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 200" width="460" height="200" aria-labelledby="title-scorpion">
  <title id="title-scorpion">Waterscorpion tank — side silhouette from predatorWaterScorpionTankMesh (+Z right)</title>
  <rect width="460" height="200" fill="#12100c"/>
  <g transform="translate(28,98)">
    <ellipse cx="-120" cy="4" rx="130" ry="38" fill="#5f4f38"/>
    <rect x="-210" y="-22" width="175" height="6" rx="1" fill="#2a2318" transform="rotate(-2 -120 4)"/>
    <ellipse cx="-148" cy="-12" rx="14" ry="10" fill="#4a4030" transform="rotate(-20 -148 -12)"/>
    <ellipse cx="-88" cy="-12" rx="14" ry="10" fill="#4a4030" transform="rotate(18 -88 -12)"/>
    <path fill="#b89b6b" d="M-228,-6 L-268,2 L-266,16 L-230,14 Z"/>
    <path fill="#b89b6b" d="M-262,8 L-302,18 L-298,32 L-258,24 Z"/>
    <ellipse cx="75" cy="-2" rx="36" ry="28" fill="#b89b6b"/>
    <path fill="#5f4f38" d="M52,8 L28,38 L18,32 L38,4Z" opacity="0.9"/>
    <path fill="#5f4f38" d="M98,8 L122,38 L132,32 L112,4Z" opacity="0.9"/>
    <rect x="-72" y="14" width="12" height="68" rx="2" fill="#5f4f38" transform="rotate(-25 -66 48)"/>
    <rect x="-150" y="18" width="12" height="68" rx="2" fill="#5f4f38" transform="rotate(25 -144 52)"/>
    <circle cx="102" cy="-28" r="12" fill="#1a0810"/>
    <circle cx="138" cy="-28" r="12" fill="#1a0810"/>
    <circle cx="104" cy="-30" r="11" fill="#e8f4ff" opacity="0.28"/>
    <circle cx="140" cy="-30" r="11" fill="#e8f4ff" opacity="0.28"/>
  </g>
  <text x="230" y="188" fill="#8a7860" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">Side view · tail left, eyes + raptorial arms right (COLORS.scorpion*)</text>
</svg>

</p>

| Mechanism | Detail |
|-----------|--------|
| **Role** | Heavy **armoured** grazer |
| **Weak spots** | **Eyes** and **tail hinge** in local space — overlapping those volumes with the player deals full **parasite** damage. |
| **Hull** | If you touch the shell without hitting a weak spot, only **shell contact bleed** (`shellContactBleed`) applies — much less than a weak hit. |
| **Venom** | **Lower susceptibility** than soft grazers; weak spots use **directional venom cone** logic so bites matter from the front arc. |
| **HP** | High — intended as a mini-boss feel on a course. |

Weak spot offsets: `WEAK_SCORPION_PRESET_RAW` in `src/trackLoader.js`.

---

## Daphnia flock (`obstacles.daphnia` / `daphnia_flocks`)

<p align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 200" width="420" height="200" aria-labelledby="title-daphnia">
  <title id="title-daphnia">Daphnia flock member — daphniaFlockMemberMesh proportions</title>
  <rect width="420" height="200" fill="#0a1e1c"/>
  <g transform="translate(210,100)">
    <ellipse cx="0" cy="4" rx="40" ry="26" fill="#3aab98" opacity="0.8"/>
    <ellipse cx="0" cy="4" rx="36" ry="22" fill="#1a5c52" opacity="0.25"/>
    <circle cx="0" cy="-18" r="8" fill="#040c10"/>
    <circle cx="0" cy="-20" r="6" fill="#ffefb8" opacity="0.35"/>
    <line x1="28" y1="-4" x2="68" y2="-38" stroke="#3aab98" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <line x1="-28" y1="-4" x2="-68" y2="-38" stroke="#3aab98" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <path fill="#3aab98" d="M-10,22 L10,22 L0,52 Z" opacity="0.88"/>
  </g>
  <g opacity="0.35">
    <ellipse cx="118" cy="112" rx="28" ry="18" fill="#3aab98"/>
    <ellipse cx="312" cy="118" rx="24" ry="15" fill="#3aab98"/>
    <ellipse cx="260" cy="78" rx="22" ry="14" fill="#3aab98"/>
  </g>
  <text x="210" y="188" fill="#5a9888" font-size="10" font-family="system-ui,sans-serif" text-anchor="middle">Centre = anatomical mesh · faint = flock context</text>
</svg>

</p>

| Mechanism | Detail |
|-----------|--------|
| **Role** | **Non-predator** swarm — many tiny copies with **flocking** (cohesion, separation, flee). |
| **Flee** | Accelerates away when you enter about **scareRadius**. |
| **Hull** | Members can **scrape** the hull for small capped DPS when you swim through the swarm (not a single “attack”, more abrasion). |
| **Splash / fin-kick** | **Dive splash** and **mega fin-kick** wedge can **burst** members; they despawn and drop **nibble** pickups / score per `pointValuePer`. |

Configured per flock in YAML: `count`, `spread`, `fleeSpeed`, `scareRadius`, `splashHitRadius`, etc. See `normalizeDaphniaFlocks` in `src/trackLoader.js`.

---

## Related code

| Concern | Location |
|---------|----------|
| Track merge + predator presets | `src/trackLoader.js` |
| Predator AI / melee / ranged | `src/Game.js` |
| Meshes & mozzie / larva / planarian movement helpers | `src/sceneMeshes.js` |
| Debug track picker | `src/main.js` → `DEBUG_TRACK_ENTRIES` |

---

## Other hazards (not on the all-enemy arena)

**Patrol fish** and **rivals** can deal collisions / race pressure; see `tracks/lily_loop.yaml` for a fuller obstacle mix. They are **not** defined in `predators` and are not covered by the diagrams above.
