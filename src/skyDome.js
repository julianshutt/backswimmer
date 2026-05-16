import * as THREE from "three";

/**
 * Huge inward-facing sky sphere with procedural gradient + soft drifting clouds (no fog).
 * @returns {{ mesh: THREE.Mesh; uniforms: { uTime: THREE.IUniform }}} 
 */
export function createPondSkyDome() {
  const uniforms = {
    uTime: { value: 0 },
  };

  const vert = `
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  const frag = `
    precision mediump float;
    varying vec3 vWorldPos;
    uniform float uTime;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float layeredCloud(vec3 dir, float t) {
      vec2 uvH = vec2(atan(dir.x, dir.z) * 2.681, dir.y * 4.85 + dir.x * 0.92);
      float c = 0.0;
      c += sin(uvH.x * 1.72 + uvH.y * 1.91 + t * 0.22) * 0.52;
      c += sin(uvH.x * -2.83 + uvH.y * 2.62 - t * 0.168) * 0.41;
      c += sin(uvH.x * 4.91 + uvH.y * 1.06 + t * 0.14) * 0.28;
      c += sin(uvH.x * 0.71 + uvH.y * 7.82 - t * 0.11) * 0.19;
      c = smoothstep(0.12, 0.95, (c + 2.08) * 0.52);
      return c * c * (3.02 - 2.0 * c);
    }

    void main() {
      vec3 o = vec3(0.0, 268.0, 0.0);
      vec3 d = normalize(vWorldPos - o);
      float h = clamp(d.y * 0.58 + 0.46, 0.0, 1.0);
      vec3 zen = vec3(0.32, 0.66, 0.98);
      vec3 horizon = vec3(0.68, 0.82, 0.94);
      vec3 skyCol = mix(horizon, zen, smoothstep(-0.04, 0.58, d.y));

      float t = uTime;
      vec3 dn = normalize(d + vec3(0.0, 0.22, 0.0));
      float cl = layeredCloud(dn, t);

      vec3 sunlight = vec3(1.0, 0.98, 0.92);
      vec3 shade = vec3(0.55, 0.72, 0.93);
      float cloudMix = clamp((cl - 0.52) * 2.95, 0.0, 1.0) * smoothstep(0.06, 0.66, dn.y);

      skyCol = mix(skyCol, mix(shade * 0.88, sunlight * 0.93, clamp(cl * 0.95 + 0.06, 0.0, 1.0)), cloudMix);

      vec3 rim = zen * smoothstep(-0.12, 0.45, dn.y + 0.05) * (0.12 + cloudMix * 0.055);
      skyCol += rim;

      gl_FragColor = vec4(skyCol, 1.0);
    }
  `;

  const geom = new THREE.SphereGeometry(540, 40, 30);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
  });
  mat.userData.isPondSky = true;

  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -50;
  mesh.name = "pondSky";

  return { mesh, uniforms };
}
