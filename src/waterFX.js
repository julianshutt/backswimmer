import * as THREE from "three";

/**
 * Seamless tiling albedo + bump canvases — scroll `map.offset` for slow drift.
 */
export function createTiledWaterMaps(albedoHex = 0x0c4f6f, hiliteHex = 0x1a8aae) {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const bump = document.createElement("canvas");
  bump.width = n;
  bump.height = n;
  const bctx = /** @type {CanvasRenderingContext2D} */ (bump.getContext("2d"));
  const img = ctx.createImageData(n, n);
  const imb = bctx.createImageData(n, n);
  const alb = new THREE.Color(albedoHex);
  const hil = new THREE.Color(hiliteHex);
  const ar = alb.r * 255;
  const ag = alb.g * 255;
  const ab = alb.b * 255;
  const hr = hil.r * 255;
  const hg = hil.g * 255;
  const hb = hil.b * 255;

  /** [0,1) hash without obvious Voronoi “cells” seams (old generator read as squares on the pond). */
  const grid01 = (ix, iy) => {
    const s =
      Math.sin(ix * 12.9898 + iy * 78.233 + 91.716) * 43758.5453123 +
      Math.cos(ix * 37.719 + iy * 11.082) * 23421.962;
    let t = s - Math.floor(s);
    if (t < 0) t += 1;
    return t;
  };

  /** Periodic bilinear value noise → smooth tiling film. */
  const valueNoise = (u, v, gridN) => {
    const ux = ((u % 1) + 1) % 1 * gridN;
    const vy = ((v % 1) + 1) % 1 * gridN;
    const x0 = Math.floor(ux);
    const y0 = Math.floor(vy);
    const xf = ux - x0;
    const yf = vy - y0;
    const xm = /** @type {(a: number) => number} */ ((a) => (((a % gridN) + gridN) % gridN));

    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);

    const a01 = THREE.MathUtils.lerp(grid01(xm(x0), xm(y0)), grid01(xm(x0 + 1), xm(y0)), sx);
    const b01 = THREE.MathUtils.lerp(grid01(xm(x0), xm(y0 + 1)), grid01(xm(x0 + 1), xm(y0 + 1)), sx);
    return THREE.MathUtils.lerp(a01, b01, sy);
  };

  /** Integer-cycle sine stack — ripple read without chunky square blocks across UV space. */
  const rippleTone = (u, v) => {
    let s = 0;
    s += Math.sin((u * 7 + v * 5 + 1.7) * Math.PI * 2) * 0.32;
    s += Math.sin((u * -11 + v * 13 + 0.43) * Math.PI * 2) * 0.24;
    s += Math.sin((u * 19 + v * 17 + 2.91) * Math.PI * 2) * 0.17;
    s += Math.cos((u * -23 + v * 29 + 5.05) * Math.PI * 2) * 0.13;
    s += Math.sin((u + v * 37) * Math.PI * 2 * 1.5) * 0.095;
    s += Math.cos((u * 41 - v * 31) * Math.PI * 2 * 2) * 0.068;
    return THREE.MathUtils.clamp(s * 0.28 + 0.5, 0, 1);
  };

  const fract01 = (t) => ((t % 1) + 1) % 1;

  /** Finite-difference magnitude of ripple field → bump shading (derivative scales roughly ~ wave frequency). */
  const rippleBumpGrey = (u, v, step) => {
    const cen = rippleTone(fract01(u), fract01(v));
    const gx =
      rippleTone(fract01(u + step), fract01(v)) - rippleTone(fract01(u - step), fract01(v));
    const gy =
      rippleTone(fract01(u), fract01(v + step)) - rippleTone(fract01(u), fract01(v - step));
    return Math.min(255, Math.hypot(gx, gy) * 620 + THREE.MathUtils.lerp(118, 188, cen));
  };

  const sampStep = 1.8 / Math.max(n, 2);
  const G1 = 19;
  const G2 = 31;

  for (let py = 0; py < n; py += 1) {
    for (let px = 0; px < n; px += 1) {
      const u = (px + 0.5) / n;
      const v = (py + 0.5) / n;

      const nFine = THREE.MathUtils.lerp(valueNoise(u, v, G1), valueNoise(u * 5.07 + v, v * 5.07 - u, G2), 0.44);
      const rip = rippleTone(u, v);
      let f = nFine * 0.72 + rip * 0.55;
      /** Third octave — finer grain without chunky square tiling. */


      const nDetail = valueNoise(u * 9.63 + v * 0.77, v * 9.63 - u * 0.71, G1 + 17);
      f = THREE.MathUtils.clamp((f + nDetail * 0.12) * 0.84, 0, 1);

      const bright = THREE.MathUtils.lerp(0.66, 1.05, THREE.MathUtils.smoothstep(f, 0.1, 0.93));
      const i = (py * n + px) * 4;
      img.data[i] = THREE.MathUtils.clamp(ar * bright, 0, 255);
      img.data[i + 1] = THREE.MathUtils.clamp((ag + (hg - ag) * f * 0.26) * bright, 0, 255);
      img.data[i + 2] = THREE.MathUtils.clamp((ab + (hb - ab) * f * 0.2) * bright, 0, 255);
      img.data[i + 3] = 255;

      let bumpGrey = rippleBumpGrey(u, v, sampStep);
      bumpGrey += (nFine - rip * 0.5) * 28;
      bumpGrey = THREE.MathUtils.clamp(bumpGrey, 0, 255);
      imb.data[i] = bumpGrey;
      imb.data[i + 1] = bumpGrey;
      imb.data[i + 2] = bumpGrey;
      imb.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  bctx.putImageData(imb, 0, 0);

  const colorMap = new THREE.CanvasTexture(c);
  colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(36, 36);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.minFilter = THREE.LinearMipmapLinearFilter;
  colorMap.generateMipmaps = true;
  colorMap.anisotropy = 10;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.copy(colorMap.repeat);
  bumpMap.anisotropy = colorMap.anisotropy;
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.generateMipmaps = true;

  return { colorMap, bumpMap };
}

/**
 * World-space Y offset for the displaced water mesh (matches `sw` appended to `wp.y` in
 * {@link createAnimatedWaterMaterial}). Use the same elapsed seconds passed to uniform `uTime`.
 * @param {number} x
 * @param {number} z
 * @param {number} uTimeSeconds
 */
export function waterSurfaceDisplacementY(x, z, uTimeSeconds) {
  const wt = uTimeSeconds * 0.42;
  return (
    Math.sin(x * 0.021 + z * 0.018 + wt * 0.55) * 0.028 +
    Math.sin(x * -0.014 + z * 0.023 - wt * 0.48) * 0.022 +
    Math.sin((x + z) * 0.015 + wt * 0.35) * 0.014
  );
}

/**
 * Stylised pond surface: slight mesh ripples + animated analytic normals, sun lighting, Fresnel rim.
 * @param {{ colorMap: THREE.Texture; bumpMap?: THREE.Texture }} maps
 * @param {{ waterHex: number; deepHex: number; opacity?: number }} pal
 */
export function createAnimatedWaterMaterial(maps, pal) {
  const colorMap = maps.colorMap;
  colorMap.offset.set(0, 0);

  const waterC = new THREE.Color(pal.waterHex);
  const deepC = new THREE.Color(pal.deepHex);
  const rim = new THREE.Color(0xa8e8ff);

  const uniforms = {
    uTime: { value: 0 },
    uMap: { value: colorMap },
    uMapRepeat: { value: new THREE.Vector2(colorMap.repeat.x, colorMap.repeat.y) },
    uMapOffset: { value: new THREE.Vector2(0, 0) },
    uDeep: { value: new THREE.Vector3(deepC.r, deepC.g, deepC.b) },
    uShallow: { value: new THREE.Vector3(waterC.r, waterC.g, waterC.b) },
    uRim: { value: new THREE.Vector3(rim.r, rim.g, rim.b) },
    uSunDir: { value: new THREE.Vector3(-0.35, 0.88, -0.32).normalize() },
    uSunColor: { value: new THREE.Vector3(1, 0.97, 0.9) },
    uAmbient: { value: new THREE.Vector3(0.14, 0.205, 0.28) },
    /** Calmer shading — avoids “scanning bulls-eye” artefacts from ripple interference. */
    uSunStr: { value: 0.38 },
    uSpecStr: { value: 0.14 },
    uShininess: { value: 28 },
    uOpacity: { value: pal.opacity ?? 0.94 },
  };

  const vertexShader = `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec2 xz = wp.xz;
      float wt = uTime * 0.42;
      // Keep in sync with waterSurfaceDisplacementY() in this module.
      float sw = sin(xz.x * 0.021 + xz.y * 0.018 + wt * 0.55) * 0.028
        + sin(xz.x * -0.014 + xz.y * 0.023 - wt * 0.48) * 0.022
        + sin((xz.x + xz.y) * 0.015 + wt * 0.35) * 0.014;
      wp.y += sw;
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    uniform sampler2D uMap;
    uniform vec2 uMapRepeat;
    uniform vec2 uMapOffset;
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    uniform vec3 uRim;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uAmbient;
    uniform float uSunStr;
    uniform float uSpecStr;
    uniform float uShininess;
    uniform float uOpacity;

    varying vec3 vWorldPos;
    varying vec2 vUv;

    void main() {
      vec2 muv = vUv * uMapRepeat + uMapOffset;
      vec3 tex = texture2D(uMap, muv).rgb;
      float tone = dot(tex, vec3(0.299, 0.587, 0.114));
      vec3 baseCol = mix(uDeep, uShallow, tone);

      // Long wavelengths, slower animation, smoothed normals — avoid harsh bulls-eye fringe.
      vec2 w = vWorldPos.xz * 0.048;
      float t = uTime * 0.36;

      float dhdx = 0.0;
      float dhdz = 0.0;

      float a1 = (w.x * 1.027 + w.y * 0.713) * 3.47 + t * 0.71;
      float c1 = cos(a1);
      dhdx += c1 * (3.47 * 1.027 * 0.011);
      dhdz += c1 * (3.47 * 0.713 * 0.011);

      float a2 = (w.x * -0.831 + w.y * 1.089) * 5.083 - t * 0.58 + 1.917;
      float c2 = cos(a2);
      dhdx += c2 * (5.083 * (-0.831) * 0.008);
      dhdz += c2 * (5.083 * (1.089) * 0.008);

      float a3 = (w.x * 1.303 + w.y * -0.916) * 6.241 + t * 0.66 + -0.443;
      float c3 = cos(a3);
      dhdx += c3 * (6.241 * 1.303 * 0.0046);
      dhdz += c3 * (6.241 * (-0.916) * 0.0046);

      vec3 Nraw = normalize(vec3(-dhdx * 1.05, 1.0, -dhdz * 1.05));
      vec3 N = normalize(mix(vec3(0.0, 1.0, 0.0), Nraw, 0.58));

      vec3 L = normalize(uSunDir);
      float diff = max(dot(N, L), 0.0);

      vec3 V = normalize(cameraPosition - vWorldPos);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), uShininess) * uSpecStr;

      float NdotV = max(dot(N, V), 0.0);
      float fr = pow(1.0 - NdotV, 5.8);

      vec3 lit = baseCol * (uAmbient + uSunColor * diff * uSunStr);
      lit += uSunColor * spec;
      lit += uRim * fr * 0.18;

      gl_FragColor = vec4(lit, uOpacity);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  mat.userData.isWaterShader = true;
  return mat;
}

/**
 * Expanded additive pond rings pooled for swimmer / predator / rival wakes.
 */
export class SurfaceWakePool {
  /**
   * @param {THREE.Scene} scene
   * @param {number} capacity
   */
  constructor(scene, capacity = 64) {
    this.scene = scene;
    /** @type {THREE.Mesh[]} */
    this.ringMeshes = [];
    /** @type {number[]} */
    this.ttl = [];

    /** Narrow radial band reduces “bull’s-eye” target look when many overlap. */


    const geom = new THREE.RingGeometry(0.5, 0.575, 32, 1);
    for (let i = 0; i < capacity; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb8eaff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geom, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.036;
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.ringMeshes.push(m);
      this.ttl.push(-1);
    }
    this.ringGeomShared = geom;
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {{ strength?: number; color?: number; wakeJitter?: number }} [opts]
   */
  spawn(x, z, opts) {
    const strength = THREE.MathUtils.clamp(Number(opts?.strength ?? 1) || 1, 0.15, 2.8);
    const j = typeof opts?.wakeJitter === "number" && Number.isFinite(opts.wakeJitter) ? opts.wakeJitter : 0.5;

    const colorHex =
      typeof opts?.color === "number" && Number.isFinite(opts.color) ? opts.color >>> 0 : 0xb8eaff;

    let ix = -1;
    let bestTtl = Infinity;
    for (let i = 0; i < this.ringMeshes.length; i += 1) {
      if (this.ttl[i] < 0) {
        ix = i;
        break;
      }
      if (this.ttl[i] < bestTtl) {
        bestTtl = this.ttl[i];
        ix = i;
      }
    }
    if (ix < 0) return;

    const m = this.ringMeshes[ix];
    const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
    mat.color.setHex(colorHex);

    mat.opacity =
      THREE.MathUtils.lerp(0.07, 0.2, THREE.MathUtils.clamp(strength / 2.25, 0, 1)) * 0.88;
    m.position.x = x + (Math.random() - 0.5) * j;
    m.position.z = z + (Math.random() - 0.5) * j;
    m.rotation.z = Math.random() * Math.PI * 2;
    /** World radius proxy (avoid `scale *= (1+g*dt)` compounding → “insane” concentric stacks). */


    const r0 = THREE.MathUtils.lerp(0.74, 1.52, THREE.MathUtils.clamp(strength / 2.6, 0, 1));
    m.userData.radScalar = r0;
    m.scale.setScalar(r0);
    m.visible = true;
    this.ttl[ix] = 0;
    /** Metres-ish ring expansion rate per second. */
    m.userData.expandRate = THREE.MathUtils.lerp(8.8, 19.8, THREE.MathUtils.clamp(strength / 2.6, 0, 1));
    /** Opacity fades as the ring overtakes glare (no lingering bull’s-eyes). */
    m.userData.wakeDecay = THREE.MathUtils.lerp(7.25, 3.58, THREE.MathUtils.clamp(strength / 2.6, 0, 1));
    /** Recycle shortly after skim passes so pool doesn’t force-steal young rings mid-read. */


    m.userData.maxLife = THREE.MathUtils.lerp(0.68, 0.95, THREE.MathUtils.clamp(strength / 2.6, 0, 1));
    m.userData.maxRadius = THREE.MathUtils.lerp(40, 74, THREE.MathUtils.clamp(strength / 2.6, 0, 1));
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    if (dt <= 0) return;
    for (let i = 0; i < this.ringMeshes.length; i += 1) {
      if (this.ttl[i] < 0) continue;
      const m = this.ringMeshes[i];
      const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
      this.ttl[i] += dt;
      const life = /** @type {number} */ (m.userData.maxLife ?? 0.76);
      const maxR = /** @type {number} */ (m.userData.maxRadius ?? 72);
      let r = typeof m.userData.radScalar === "number" ? m.userData.radScalar : m.scale.x;
      const spd = typeof m.userData.expandRate === "number" ? m.userData.expandRate : 12;
      r += spd * dt;
      m.userData.radScalar = r;
      m.scale.setScalar(r);

      const dec = typeof m.userData.wakeDecay === "number" ? m.userData.wakeDecay : 5.2;
      mat.opacity *= Math.exp(-dt * dec);

      const tooOld = this.ttl[i] > life || r >= maxR;
      const tooFade = mat.opacity < 0.026;
      if (tooFade || tooOld) {
        mat.opacity = 0;
        m.visible = false;
        this.ttl[i] = -1;
        m.scale.setScalar(1);
        delete m.userData.radScalar;
        delete m.userData.expandRate;
        delete m.userData.wakeDecay;
        delete m.userData.maxLife;
        delete m.userData.maxRadius;
      }
    }
  }

  dispose() {
    const g = this.ringGeomShared;
    for (let i = 0; i < this.ringMeshes.length; i += 1) {
      const m = this.ringMeshes[i];
      this.scene.remove(m);
      /** @type {THREE.MeshBasicMaterial} */ (m.material).dispose();
    }
    g.dispose();
  }
}
