import * as THREE from "three";

/**
 * Glowing spline tube that threads through checkpoints (closed loop).
 * @param {Array<{ position: number[] }>} cps normalized checkpoints from track loader
 */
export function buildCourseRibbon(cps, yElev = 0.16) {
  if (!cps || cps.length < 2) return null;

  const pts = cps.map((c) => new THREE.Vector3(c.position[0], yElev, c.position[2]));
  const closed = pts.length >= 3;

  const curve = closed
    ? new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.08)
    : new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.2);

  const len = curve.getLength();
  const tubular = Math.min(540, Math.max(80, Math.floor(len * 3.8)));

  const geo = new THREE.TubeGeometry(curve, tubular, 0.2, 5, closed);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x62d9ff,
    emissive: 0x2288aa,
    emissiveIntensity: 0.32,
    metalness: 0.06,
    roughness: 0.38,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  return { mesh, curve, material: mat };
}

/**
 * “Buoys” marking each checkpoint: flat ring gate + slender pole so direction reads from chase cam.
 * @returns {Array<{ group:THREE.Group; ring: THREE.Mesh; ringMat:THREE.MeshStandardMaterial }>}
 */
export function buildCheckpointMarkers(cps) {
  /** @type {Array<{ group:THREE.Group; ring: THREE.Mesh; ringMat:THREE.MeshStandardMaterial }>} */
  const markers = [];

  for (let i = 0; i < (cps?.length ?? 0); i++) {
    const cp = cps[i];
    const r = Math.max(cp.radius ?? 8, 1.5);

    const group = new THREE.Group();
    group.position.set(cp.position[0], 0.04, cp.position[2]);

    const inner = Math.max(r * 0.82, r - 1.05);
    const ringGeo = new THREE.RingGeometry(inner, r + 0.18, Math.min(144, Math.max(48, r * 5)));
    ringGeo.rotateX(-Math.PI / 2);

    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x3ec9ff,
      emissive: 0x123748,
      emissiveIntensity: 0.08,
      metalness: 0.06,
      roughness: 0.45,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.12, Math.min(2.1, r * 1.85), 8, 1),
      new THREE.MeshStandardMaterial({
        color: 0xfff4dd,
        emissive: 0x553311,
        emissiveIntensity: 0.04,
        roughness: 0.55,
      })
    );
    pole.position.y = pole.geometry.parameters.height * 0.48;
    pole.castShadow = true;
    group.add(pole);

    const buoy = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xff4455,
        emissive: 0x883322,
        emissiveIntensity: 0.06,
        roughness: 0.42,
      })
    );
    buoy.position.y = pole.geometry.parameters.height - 0.05;
    buoy.castShadow = true;
    group.add(buoy);

    markers.push({ group, ring, ringMat, index: i });
  }

  return markers;
}
