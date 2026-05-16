import * as THREE from "three";

/**
 * Paths to your unpacked AmbientCG “2K-JPG” (or 1K) set, **relative to the site root**
 * (same folder as index.html — works with `python3 -m http.server`).
 *
 * AmbientCG usually ships:
 * - `…_Color.jpg` — albedo (`map`). Use **`colorSpace = SRGBColorSpace`** on this one only.
 * - `…_NormalGL.jpg` — use **NormalGL** for Three.js (`normalMap`).
 * - `…_Roughness.jpg` (`roughnessMap`).
 * Optional: `…_AmbientOcclusion.jpg` (`aoMap`).
 * Optional: `…_Metalness.jpg` (multiply with `metalness`; usually dark for stone).
 *
 * @typedef {{ map: string; normalMap: string; roughnessMap: string; ambientOcclusionMap?: string; metalnessMap?: string }} RockTexturePaths
 */

/** @type {RockTexturePaths | null} Set filenames to match your download, or `null` to skip loading. */
export const ROCK_TEXTURE_PATHS = {
  map: "./textures/Rock051_1K-JPG_Color.jpg",
  normalMap: "./textures/Rock051_1K-JPG_NormalGL.jpg",
  roughnessMap: "./textures/Rock051_1K-JPG_Roughness.jpg",
  ambientOcclusionMap: "./textures/Rock051_1K-JPG_AmbientOcclusion.jpg",
  metalnessMap: "./textures/Rock051_1K-JPG_Metalness.jpg",
};

/**
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {RockTexturePaths} paths
 * @returns {Promise<THREE.MeshStandardMaterial>}
 */
export async function loadRockMaterialFromAmbientCG(paths, renderer) {
  const loader = new THREE.TextureLoader();

  /** @type {(url: string) => Promise<THREE.Texture>} */
  const loadFile = (url) =>
    new Promise((resolve, reject) =>
      loader.load(url, resolve, undefined, reject)
    );

  const configureMap = /** @type {(t: THREE.Texture, opts: { repeat: number; srgb?: boolean }) => void} */ (
    t,
    { repeat, srgb }
  ) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = srgb === true ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    const cap = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    t.anisotropy = THREE.MathUtils.clamp(Math.floor(cap), 2, 16);
  };

  const repeat = 2.2;

  const loadList = [paths.map, paths.normalMap, paths.roughnessMap];
  if (paths.ambientOcclusionMap) loadList.push(paths.ambientOcclusionMap);
  if (paths.metalnessMap) loadList.push(paths.metalnessMap);

  const loaded = await Promise.all(loadList.map((url) => loadFile(url)));
  let i = 0;
  const map = loaded[i++];
  const normalMap = loaded[i++];
  const roughnessMap = loaded[i++];
  let ao = /** @type {THREE.Texture | undefined} */ (undefined);
  let metalnessMap = /** @type {THREE.Texture | undefined} */ (undefined);
  if (paths.ambientOcclusionMap) ao = loaded[i++];
  if (paths.metalnessMap) metalnessMap = loaded[i++];

  configureMap(map, { repeat, srgb: true });
  configureMap(normalMap, { repeat });
  configureMap(roughnessMap, { repeat });
  if (ao) configureMap(ao, { repeat });
  if (metalnessMap) configureMap(metalnessMap, { repeat });

  /** @type {THREE.MeshStandardMaterialParameters} */
  const params = {
    map,
    normalMap,
    roughnessMap,
    metalness: 1,
    roughness: 1,
    vertexColors: false,
  };

  if (metalnessMap) params.metalnessMap = metalnessMap;
  if (ao) {
    params.aoMap = ao;
    params.aoMapIntensity = 1;
  }

  return new THREE.MeshStandardMaterial(params);
}
