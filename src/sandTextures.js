import * as THREE from "three";

/**
 * Pond bottom / below-water sand (AmbientCG Ground104 style). Paths relative to site root.
 *
 * @typedef {{ map: string; normalMap: string; roughnessMap: string; ambientOcclusionMap?: string; metalnessMap?: string }} SandTexturePaths
 */

/** Unpack the matching `Ground104_1K-JPG_*.jpg` files into `./textures/`. */
export const SAND_TEXTURE_PATHS = {
  map: "./textures/Ground104_1K-JPG_Color.jpg",
  normalMap: "./textures/Ground104_1K-JPG_NormalGL.jpg",
  roughnessMap: "./textures/Ground104_1K-JPG_Roughness.jpg",
  ambientOcclusionMap: "./textures/Ground104_1K-JPG_AmbientOcclusion.jpg",
  // Ground104 has no Metalness in many packs — add if yours includes `…_Metalness.jpg`:
  // metalnessMap: "./textures/Ground104_1K-JPG_Metalness.jpg",
};

/**
 * @param {SandTexturePaths} paths
 * @param {THREE.WebGLRenderer | null | undefined} renderer
 * @param {{ uvRepeat?: number }} [opts]
 */
export async function loadSandFloorMaterial(paths, renderer, opts = {}) {
  const loader = new THREE.TextureLoader();

  /** @type {(url: string) => Promise<THREE.Texture>} */
  const loadFile = (url) =>
    new Promise((resolve, reject) =>
      loader.load(url, resolve, undefined, reject)
    );

  const uvRepeat = typeof opts.uvRepeat === "number" && Number.isFinite(opts.uvRepeat) ? opts.uvRepeat : 36;

  /** @type {(t: THREE.Texture, opts: { repeat: number; srgb?: boolean }) => void} */
  const configureMap = (t, { repeat, srgb }) => {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = srgb === true ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    const cap = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    t.anisotropy = THREE.MathUtils.clamp(Math.floor(cap), 2, 16);
  };

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

  configureMap(map, { repeat: uvRepeat, srgb: true });
  configureMap(normalMap, { repeat: uvRepeat });
  configureMap(roughnessMap, { repeat: uvRepeat });
  if (ao) configureMap(ao, { repeat: uvRepeat });
  if (metalnessMap) configureMap(metalnessMap, { repeat: uvRepeat });

  /** @type {THREE.MeshStandardMaterialParameters} */
  const params = {
    map,
    normalMap,
    roughnessMap,
    metalness: metalnessMap ? 1 : 0.02,
    roughness: 1,
    envMapIntensity: 0.45,
    vertexColors: false,
  };
  if (metalnessMap) params.metalnessMap = metalnessMap;
  if (ao) {
    params.aoMap = ao;
    params.aoMapIntensity = 0.92;
  }

  const mat = new THREE.MeshStandardMaterial(params);
  mat.name = "pondSandFloor";
  return mat;
}
