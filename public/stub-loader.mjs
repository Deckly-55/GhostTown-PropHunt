// Node ESM loader hooks for the jsdom smoke test:
//  - 'three'          → real three, but WebGLRenderer is replaced by a no-op stub
//                       (no GL in headless Node; client.js only needs construct/size/render)
//  - 'three/addons/*' → stubbed PointerLockControls / GLTFLoader / SkeletonUtils so
//                       start()'s model prefetch resolves instantly and never fetches .glb files.
import fs from 'node:fs';

const threeReal = 'file://' + fs.realpathSync(new URL('./node_modules/three/build/three.module.js', import.meta.url).pathname);

const threeStubSource = `
export * from ${JSON.stringify(threeReal)};
export class WebGLRenderer {
  constructor(params) {
    this.domElement = document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0, autoUpdate: true };
    this.capabilities = { isWebGL2: false, maxTextureSize: 4096 };
    this.info = { render: { triangles: 0, calls: 0 } };
    this.outputColorSpace = '';
    this.toneMapping = 0;
    this.localClippingEnabled = false;
  }
  setPixelRatio() {}
  setSize() {}
  setClearColor() {}
  setAnimationLoop() {}
  render() {}
  compile() {}
  dispose() {}
  getContext() { return this.domElement.getContext('2d'); }
}
`;

const addonsStubSource = `
import * as THREE from ${JSON.stringify(threeReal)};
class ControlsStub {
  constructor() { this.isLocked = false; this.pointerSpeed = 1; }
  addEventListener() {} removeEventListener() {} connect() {} disconnect() {}
  lock() {} unlock() {} dispose() {}
}
class GLTFLoaderStub {
  load(url, onLoad, onProgress, onError) {
    const scene = new THREE.Group();
    scene.name = 'stub-model';
    setTimeout(() => onLoad && onLoad({ scene, animations: [] }), 0);
  }
  parse(data, path, onLoad) {
    const scene = new THREE.Group();
    setTimeout(() => onLoad && onLoad({ scene, animations: [] }), 0);
  }
}
const SkeletonUtils = {
  clone(obj) { return obj && obj.clone ? obj.clone() : new THREE.Group(); },
  merge() { return new THREE.Group(); },
  retarget(clip) { return clip; }
};
export { ControlsStub as PointerLockControls, GLTFLoaderStub as GLTFLoader, SkeletonUtils };
export default { PointerLockControls: ControlsStub, GLTFLoader: GLTFLoaderStub, SkeletonUtils };
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: 'stub-three:main', format: 'module', shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: 'stub-addons:' + specifier, format: 'module', shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'stub-three:main') return { format: 'module', source: threeStubSource, shortCircuit: true };
  if (url.startsWith('stub-addons:')) return { format: 'module', source: addonsStubSource, shortCircuit: true };
  return nextLoad(url, context);
}
