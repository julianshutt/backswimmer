import * as THREE from "three";

/**
 * One shared PBR set for all reed blades (AmbientCG Grass005 1K JPG). Same maps on every stem — cheap.
 *
 * @typedef {{ map: string; normalMap: string; roughnessMap: string; ambientOcclusionMap?: string }} ReedGrassPaths
 */

export const REED_GRASS_PATHS = {
  map: "./textures/Grass005_1K-JPG_Color.jpg",
  normalMap: "./textures/Grass005_1K-JPG_NormalGL.jpg",
  roughnessMap: "./textures/Grass005_1K-JPG_Roughness.jpg",
  ambientOcclusionMap: "./textures/Grass005_1K-JPG_AmbientOcclusion.jpg",
};

/**
 * @param {ReedGrassPaths} paths
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {{ repeatU?: number; repeatV?: number }} [opts] — tall thin blades need more repeat on V
 */
export async function loadReedGrassMaterial(paths, renderer, opts = {}) {
  const loader = new THREE.TextureLoader();
  const ru = typeof opts.repeatU === "number" && Number.isFinite(opts.repeatU) ? opts.repeatU : 36;
  const rv = typeof opts.repeatV === "number" && Number.isFinite(opts.repeatV) ? opts.repeatV : 96;

  /** @type {(url: string) => Promise<THREE.Texture>} */
  const loadFile = (url) =>
    new Promise((resolve, reject) =>
      loader.load(url, resolve, undefined, reject)
    );

  /** @type {(t: THREE.Texture, repeatU: number, repeatV: number, srgb?: boolean) => void} */
  const configureMap = (t, repeatU, repeatV, srgb) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatU, repeatV);
    t.colorSpace = srgb === true ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    const cap = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    t.anisotropy = THREE.MathUtils.clamp(Math.floor(cap), 2, 16);
  };

  const loadList = [paths.map, paths.normalMap, paths.roughnessMap];
  if (paths.ambientOcclusionMap) loadList.push(paths.ambientOcclusionMap);

  const loaded = await Promise.all(loadList.map((url) => loadFile(url)));
  let i = 0;
  const map = loaded[i++];
  const normalMap = loaded[i++];
  const roughnessMap = loaded[i++];
  let ao = /** @type {THREE.Texture | undefined} */ (undefined);
  if (paths.ambientOcclusionMap) ao = loaded[i++];

  configureMap(map, ru, rv, true);
  configureMap(normalMap, ru, rv);
  configureMap(roughnessMap, ru, rv);
  if (ao) configureMap(ao, ru, rv);

  /** @type {THREE.MeshStandardMaterialParameters} */
  const params = {
    map,
    normalMap,
    roughnessMap,
    metalness: 0.03,
    roughness: 0.88,
    flatShading: false,
    side: THREE.DoubleSide,
  };
  if (ao) {
    params.aoMap = ao;
    params.aoMapIntensity = 0.85;
  }

  const mat = new THREE.MeshStandardMaterial(params);
  mat.name = "reedGrassShared";
  /** Slight modulation so blades don’t look plastic vs water. */
  mat.color.setHex(0xb6d4a8);
  return mat;
}

/**
 * Reeds use steep texture repeat (~36×96). Lathes / lily UVs wrap ~once across the leaf, so extreme repeat
 * looks like mushy solid green. Clone textures with gentler tiling (same JPG data, new {@link THREE.Texture}s).
 *
 * @param {THREE.MeshStandardMaterial} reedMat Loaded grass from {@link loadReedGrassMaterial}
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {{ repeatU?: number; repeatV?: number }} [opts]
 */
export function cloneGrassMaterialForBroadLeaves(reedMat, renderer, opts = {}) {
  const ru = typeof opts.repeatU === "number" ? opts.repeatU : 4.25;
  const rv = typeof opts.repeatV === "number" ? opts.repeatV : 4.25;

  const cap = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
  const ani = THREE.MathUtils.clamp(Math.floor(cap), 2, 16);

  /** @param {THREE.Texture} t */
  const dup = (t) => {
    const c = t.clone();
    c.wrapS = THREE.RepeatWrapping;
    c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(ru, rv);
    c.needsUpdate = true;
    c.anisotropy = ani;
    return c;
  };

  /** @type {THREE.MeshStandardMaterialParameters} */
  const params = {
    metalness: reedMat.metalness,
    roughness: reedMat.roughness,
    flatShading: reedMat.flatShading,
    side: THREE.DoubleSide,
  };
  if (reedMat.map) params.map = dup(reedMat.map);
  if (reedMat.normalMap) params.normalMap = dup(reedMat.normalMap);
  if (reedMat.roughnessMap) params.roughnessMap = dup(reedMat.roughnessMap);
  if (reedMat.aoMap) {
    params.aoMap = dup(reedMat.aoMap);
    params.aoMapIntensity = reedMat.aoMapIntensity;
  }

  const m = new THREE.MeshStandardMaterial(params);
  m.name = "lilyPadGrassShared";
  if (reedMat.color) m.color.copy(reedMat.color);
  if (reedMat.normalMap && reedMat.normalScale) m.normalScale.copy(reedMat.normalScale);
  return m;
}
