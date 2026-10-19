path = '/home/user/game/client.js'
src = open(path, 'r').read()

# ------------------------------------------------------------------
# 1) Swap the client-side bullet radius constant for tracer tuning
# ------------------------------------------------------------------
old = """const DISGUISE_RADIUS = 50;
const BULLET_RADIUS_3D = 3;
const GRID_SIZE = 100; // kept for reference"""
new = """const DISGUISE_RADIUS = 50;
// Phase 1 — Hitscan tracers. Simulated bullet meshes are gone for good;
// the server now tells us where every shot started and where it landed via
// a single 'fireTracer' packet, and we draw a glowing laser bolt between
// those two points that fades out over TRACER_LIFETIME_MS.
const TRACER_LIFETIME_MS = 150;
const TRACER_RADIUS = 1.6;   // visual thickness of the laser bolt
const GRID_SIZE = 100; // kept for reference"""
assert src.count(old) == 1, "const block"
src = src.replace(old, new)

# ------------------------------------------------------------------
# 2) Remove the client-side bullets array
# ------------------------------------------------------------------
old = """let props = [];
let bullets = [];
let map = [];"""
new = """let props = [];
let map = [];"""
assert src.count(old) == 1, "bullets var"
src = src.replace(old, new)

# ------------------------------------------------------------------
# 3) Scene graph group: bulletGroup -> tracerGroup
# ------------------------------------------------------------------
old = "let mapGroup, propGroup, playerGroup, bulletGroup;"
new = "let mapGroup, propGroup, playerGroup, tracerGroup;"
assert src.count(old) == 1, "group decl"
src = src.replace(old, new)

old = """  mapGroup = new THREE.Group();
  propGroup = new THREE.Group();
  playerGroup = new THREE.Group();
  bulletGroup = new THREE.Group();
  scene.add(mapGroup);
  scene.add(propGroup);
  scene.add(playerGroup);
  scene.add(bulletGroup);"""
new = """  mapGroup = new THREE.Group();
  propGroup = new THREE.Group();
  playerGroup = new THREE.Group();
  tracerGroup = new THREE.Group();
  scene.add(mapGroup);
  scene.add(propGroup);
  scene.add(playerGroup);
  scene.add(tracerGroup);"""
assert src.count(old) == 1, "initThree groups"
src = src.replace(old, new)

# ------------------------------------------------------------------
# 4) Mesh caches: bulletMeshes -> live tracer registry
# ------------------------------------------------------------------
old = """const playerMeshes = {};
const bulletMeshes = {};"""
new = """const playerMeshes = {};
// Active hitscan tracers: { mesh, geometry, material, bornAt } entries that
// updateTracers() fades and disposes inside the requestAnimationFrame loop.
const tracers = [];"""
assert src.count(old) == 1, "mesh caches"
src = src.replace(old, new)

# ------------------------------------------------------------------
# 5) Replace updateBulletMeshes() with the tracer system
# ------------------------------------------------------------------
start = src.index("function updateBulletMeshes() {")
end = src.index("function showMainMenuRoot() {")

new_tracers = """// ===========================================================================
// Phase 1 — Hitscan tracers (replaces the old simulated bullet meshes)
// ===========================================================================
// 'fireTracer' arrives with the exact world coordinates the server used for
// its invisible ray: { start, end, kind, hitType }. We stretch a slim,
// additive-blended cylinder between those points — one bright laser bolt that
// reads instantly and costs a single draw call.
function spawnTracer(data) {
  if (!data || !tracerGroup) return;
  const s = data.start;
  const e = data.end;
  if (!s || !e) return;

  const start = new THREE.Vector3(s.x, s.y, s.z);
  const end = new THREE.Vector3(e.x, e.y, e.z);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (!Number.isFinite(length) || length < 0.001) return;

  const isKnife = data.kind === 'knife';
  const isHit = data.hitType === 'player' || data.hitType === 'npc';
  let color = 0xffe27a; // rifle — warm amber
  if (isHit) color = 0xff9d45; // connected on a target — hot orange
  if (isKnife) color = 0x9fd8ff; // thrown knife — cold steel-blue

  const thickness = TRACER_RADIUS * (data.weaponType === 'secondary' ? 0.7 : 1);
  const geometry = new THREE.CylinderGeometry(thickness * 0.35, thickness, length, 6, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.renderOrder = 5;
  tracerGroup.add(mesh);

  tracers.push({ mesh, geometry, material, bornAt: performance.now() });
}

// Called from the requestAnimationFrame loop: fades every live tracer out
// over TRACER_LIFETIME_MS and properly disposes its GPU resources so repeated
// firefights never leak geometry/material memory.
function updateTracers() {
  if (tracers.length === 0) return;
  const now = performance.now();

  for (let i = tracers.length - 1; i >= 0; i--) {
    const tracer = tracers[i];
    const life = (now - tracer.bornAt) / TRACER_LIFETIME_MS;

    if (life >= 1) {
      tracerGroup.remove(tracer.mesh);
      tracer.geometry.dispose();
      tracer.material.dispose();
      tracers.splice(i, 1);
      continue;
    }

    tracer.material.opacity = 1 - life;
    const squash = 1 - life * 0.25; // thin out as it dies instead of popping
    tracer.mesh.scale.set(squash, 1, squash);
  }
}

function clearTracers() {
  if (!tracerGroup) return;
  for (const tracer of tracers) {
    tracerGroup.remove(tracer.mesh);
    tracer.geometry.dispose();
    tracer.material.dispose();
  }
  tracers.length = 0;
}

"""
src = src[:start] + new_tracers + src[end:]

# ------------------------------------------------------------------
# 6) matchStarted: clear tracers instead of rebuilding bullet meshes
# ------------------------------------------------------------------
old = """    updateNPCMeshes();
    updateBulletMeshes();

    resetCombatState();"""
new = """    updateNPCMeshes();
    clearTracers();

    resetCombatState();"""
assert src.count(old) == 1, "matchStarted"
src = src.replace(old, new)

# ------------------------------------------------------------------
# 7) Replace the bulletsUpdate listener with fireTracer
# ------------------------------------------------------------------
old = """  socket.on('bulletsUpdate', (serverBullets) => {
    bullets = serverBullets;
    updateBulletMeshes();
  });"""
new = """  // Phase 1 — one-shot hitscan visual. The server already applied damage in
  // the same millisecond as this packet; we just draw the beam.
  socket.on('fireTracer', (tracer) => {
    spawnTracer(tracer);
  });"""
assert src.count(old) == 1, "bulletsUpdate listener"
src = src.replace(old, new)

# ------------------------------------------------------------------
# 8) RAF loop: drive the fade/dispose every frame
# ------------------------------------------------------------------
old = """  updateDamageFlash();
  updateDisguiseNotification();
  updateMeleeIndicator();"""
new = """  updateDamageFlash();
  updateDisguiseNotification();
  updateMeleeIndicator();

  // Hitscan tracers live for a fraction of a second; tick their fade and
  // dispose them here so nothing piles up in memory.
  updateTracers();"""
assert src.count(old) == 1, "animate loop"
src = src.replace(old, new)

open(path, 'w').write(src)
print("client.js edited OK; new line count:", src.count('\n') + 1)
