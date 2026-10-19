import io

path = '/home/user/game/server.js'
src = open(path, 'r').read()

def find_once(s, needle, start=0):
    i = s.find(needle, start)
    assert i != -1, f"anchor not found: {needle[:60]!r}"
    assert s.find(needle, i + 1) == -1 or needle.count('socket.on') > 0, f"anchor not unique: {needle[:60]!r}"
    return i

# ------------------------------------------------------------------
# 1) Constants block: remove BULLET_SPEED / KNIFE_SPEED, add hitscan tuning
# ------------------------------------------------------------------
old = """const BULLET_SPEED = 35;
const KNIFE_SPEED = 18;
const KNIFE_DAMAGE = 50;
const BULLET_RADIUS = 8;
"""
new = """// Phase 1 — Hitscan "Teleport" Shooting System.
// Bullets are no longer simulated as travelling projectiles. The moment a
// shot arrives, the server marches an invisible ray along the aim vector in
// HITSCAN_STEP increments and resolves the first thing it touches on that
// exact same packet. BULLET_RADIUS is kept as the player-hitbox padding.
const HITSCAN_STEP = 4;              // world units advanced per ray-march step
const HITSCAN_RANGE_BULLET = 6000;   // max travel distance for a fired round
const HITSCAN_RANGE_KNIFE = 1200;    // thrown knives give up sooner
const MUZZLE_FORWARD_OFFSET = 10;    // ray origin pushed just ahead of the barrel
const HITSCAN_MIN_Y = -10;           // below this the round escapes under the map
const HITSCAN_MAX_Y = 200;           // above this it has flown over every rooftop
const GHOUL_HITBOX_RADIUS = 25;      // large cylinder hitbox around the 12x skeleton ghoul
const GHOUL_HITBOX_HEIGHT = 45;      // measured upward from its feet
const KNIFE_DAMAGE = 50;
const BULLET_RADIUS = 8;
"""
assert src.count(old) == 1
src = src.replace(old, new)

# ------------------------------------------------------------------
# 2) startRoom: remove the in-flight bullet sweep
# ------------------------------------------------------------------
old = """  bullets = bullets.filter(bullet => bullet.roomName !== roomName);
  rs.timeLeft = rs.timeLimit;"""
new = """  // Phase 1: hitscan shots resolve instantly, so there are no in-flight
  // bullets left to purge when a match starts.
  rs.timeLeft = rs.timeLimit;"""
assert src.count(old) == 1
src = src.replace(old, new)

# ------------------------------------------------------------------
# 3) Remove the global bullet store
# ------------------------------------------------------------------
old = """const players = {};
const wallets = {}; 
let bullets = [];
let bulletIdCounter = 0;
let lootDrops = {};"""
new = """const players = {};
const wallets = {}; 
let lootDrops = {};"""
assert src.count(old) == 1
src = src.replace(old, new)

# ------------------------------------------------------------------
# 4) Replace shoot + throwKnife listeners (everything between
#    socket.on('shoot' and socket.on('meleeAttack') )
# ------------------------------------------------------------------
start = src.index("  socket.on('shoot', (aim) => {")
end = src.index("  socket.on('meleeAttack', () => {")

new_listeners = """  socket.on('shoot', (aim) => {
    const player = players[socket.id];
    const roomState = player ? getRoomState(player.roomName) : null;
    if (!player || !roomState || roomState.state !== 'playing' || !player.alive || player.role !== 'hunter') return;
    if (!aim || typeof aim.dx !== 'number' || typeof aim.dy !== 'number') {
      return;
    }

    // Phase 1 — Hitscan "Teleport" Shooting.
    // No bullet entity is ever created. The server instantly marches an
    // invisible mathematical ray from the gun's barrel, finds the first thing
    // it touches (wall, prop, ghoul, enemy), applies the damage on this same
    // packet, and only then broadcasts what the shot looked like.
    const dir = normalizeAimVector(aim);
    const weaponType =
      aim.weaponType === 'primary' || aim.weaponType === 'secondary'
        ? aim.weaponType
        : 'primary';

    const eyeY = typeof player.y === 'number' ? player.y : PLAYER_EYE_LEVEL;
    const muzzle = {
      x: player.x + dir.x * MUZZLE_FORWARD_OFFSET,
      y: eyeY + dir.y * MUZZLE_FORWARD_OFFSET,
      z: player.z + dir.z * MUZZLE_FORWARD_OFFSET
    };

    const hit = castHitscanRay(socket.id, muzzle, dir, player.roomName, 'prop', false);

    io.to(player.roomName).emit('fireTracer', {
      ownerId: socket.id,
      kind: 'bullet',
      weaponType,
      hitType: hit.type,
      targetId: hit.victimId || hit.npcId || null,
      start: muzzle,
      end: hit.point
    });

    applyHitscanHit(hit, {
      ownerId: socket.id,
      roomName: player.roomName,
      damage: getBulletDamage(weaponType),
      isKnife: false
    });
  });

  socket.on('throwKnife', (aim) => {
    const player = players[socket.id];
    const roomState = player ? getRoomState(player.roomName) : null;
    if (!player || !roomState || roomState.state !== 'playing' || !player.alive || player.role !== 'prop') return;
    if (!aim || typeof aim.dx !== 'number' || typeof aim.dy !== 'number') return;

    const now = Date.now();
    if (player.lastKnifeThrowTime && now - player.lastKnifeThrowTime < 1500) return;
    player.lastKnifeThrowTime = now;

    // Phase 1 — the thrown knife rides the same instant hitscan ray as the
    // guns: shorter range, heavier damage, and it only ever targets hunters.
    const dir = normalizeAimVector(aim);
    const eyeY = typeof player.y === 'number' ? player.y : PLAYER_EYE_LEVEL;
    const origin = {
      x: player.x + dir.x * MUZZLE_FORWARD_OFFSET,
      y: eyeY + dir.y * MUZZLE_FORWARD_OFFSET,
      z: player.z + dir.z * MUZZLE_FORWARD_OFFSET
    };

    const hit = castHitscanRay(socket.id, origin, dir, player.roomName, 'hunter', true);

    io.to(player.roomName).emit('fireTracer', {
      ownerId: socket.id,
      kind: 'knife',
      weaponType: null,
      hitType: hit.type,
      targetId: hit.victimId || hit.npcId || null,
      start: origin,
      end: hit.point
    });

    applyHitscanHit(hit, {
      ownerId: socket.id,
      roomName: player.roomName,
      damage: KNIFE_DAMAGE,
      isKnife: true
    });
  });

"""
src = src[:start] + new_listeners + src[end:]

# ------------------------------------------------------------------
# 5) Replace tickBullets() wholesale with the hitscan engine
# ------------------------------------------------------------------
start = src.index("function tickBullets() {")
end = src.index("function tickNPCs() {")

new_engine = """// ===========================================================================
// Phase 1 — Hitscan "Teleport" Shooting Engine (replaces tickBullets())
// ===========================================================================

function normalizeAimVector(aim) {
  let dirX, dirY, dirZ;
  if (typeof aim.dz === 'number' && Number.isFinite(aim.dz)) {
    dirX = aim.dx;
    dirY = aim.dy;
    dirZ = aim.dz;
  } else {
    dirX = aim.dx;
    dirY = 0;
    dirZ = aim.dy;
  }

  const length = Math.hypot(dirX, dirY, dirZ);
  if (!Number.isFinite(length) || length < 0.000001) return { x: 1, y: 0, z: 0 };
  return {
    x: dirX / length,
    y: dirY / length,
    z: dirZ / length
  };
}

// Returns 'out' when the point escapes the playable zone, 'wall' when a map
// wall/building box blocks the shot, 'prop' for a loose world prop, else null.
function hitscanBlockedByGeometry(x, y, z, zone, zoneId) {
  if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) return 'out';
  if (y < HITSCAN_MIN_Y || y > HITSCAN_MAX_Y) return 'out';

  for (const obj of map) {
    const withinXZ =
      x >= obj.x && x <= obj.x + obj.width &&
      z >= obj.y && z <= obj.y + obj.height;
    if (!withinXZ) continue;
    const obstacleHeight = obj.type === 'glass' ? GLASS_HEIGHT : WALL_HEIGHT;
    if (y <= obstacleHeight) return 'wall';
  }

  for (const prop of getPropsForZone(zoneId)) {
    if (
      x >= prop.x && x <= prop.x + prop.width &&
      z >= prop.y && z <= prop.y + prop.height &&
      y <= PROP_HEIGHT
    ) {
      return 'prop';
    }
  }
  return null;
}

// Big cylinder hitbox for the 12x scaled skeleton ghoul: 25 units wide,
// 45 units tall from its feet (with 5 units of slop below).
function hitscanGhoulHit(x, y, z) {
  for (const [npcId, npc] of Object.entries(npcs)) {
    if (!npc) continue;
    const horizDist = Math.hypot(x - npc.x, z - npc.z);
    const npcBaseY = typeof npc.y === 'number' ? npc.y : 0;
    if (horizDist <= GHOUL_HITBOX_RADIUS && y >= npcBaseY - 5 && y <= npcBaseY + GHOUL_HITBOX_HEIGHT) {
      return { npcId, npc };
    }
  }
  return null;
}

// Player hitbox: sphere/capsule around the body centre (eye height - 4),
// same volume the old bullet simulation used so nothing feels like it used to
// hit that now doesn't.
function hitscanPlayerHit(x, y, z, shooterId, roomName, victimRole) {
  for (const [id, target] of Object.entries(players)) {
    if (id === shooterId || !target.alive) continue;
    if (target.roomName !== roomName) continue;
    if (target.role !== victimRole) continue;

    const playerY = typeof target.y === 'number' ? target.y : PLAYER_EYE_LEVEL;
    const bodyY = playerY - 4;
    const dx = x - target.x;
    const dy = y - bodyY;
    const dz = z - target.z;
    const dist3D = Math.hypot(dx, dy, dz);
    const horizDist = Math.hypot(dx, dz);
    if (dist3D <= PLAYER_RADIUS + BULLET_RADIUS || (horizDist <= PLAYER_RADIUS + BULLET_RADIUS && Math.abs(dy) <= 12)) {
      return id;
    }
  }
  return null;
}

// The heart of Phase 1: step along the invisible ray one HITSCAN_STEP at a
// time, instantly, and stop at whatever is touched first.
function castHitscanRay(shooterId, origin, dir, roomName, victimRole, isKnife) {
  const zone = zoneForRoomName(roomName);
  const maxRange = isKnife ? HITSCAN_RANGE_KNIFE : HITSCAN_RANGE_BULLET;
  const steps = Math.ceil(maxRange / HITSCAN_STEP);

  let x = origin.x;
  let y = origin.y;
  let z = origin.z;
  let prevX = x;
  let prevY = y;
  let prevZ = z;

  for (let i = 0; i < steps; i++) {
    prevX = x; prevY = y; prevZ = z;
    x += dir.x * HITSCAN_STEP;
    y += dir.y * HITSCAN_STEP;
    z += dir.z * HITSCAN_STEP;

    const blocked = hitscanBlockedByGeometry(x, y, z, zone, zone.id);
    if (blocked) {
      // Stop the impact point on the last clean step so the tracer does not
      // burrow inside the wall/prop it just smacked.
      return { type: blocked, point: { x: prevX, y: prevY, z: prevZ } };
    }

    const ghoul = hitscanGhoulHit(x, y, z);
    if (ghoul) {
      return { type: 'npc', npcId: ghoul.npcId, npc: ghoul.npc, point: { x, y, z } };
    }

    const victimId = hitscanPlayerHit(x, y, z, shooterId, roomName, victimRole);
    if (victimId) {
      return { type: 'player', victimId, point: { x, y, z } };
    }
  }

  // Reached max travel distance without touching anything.
  return { type: 'faded', point: { x, y, z } };
}

// Damage resolution happens synchronously inside the same socket packet that
// carried the shot — "teleport" in the truest sense.
function applyHitscanHit(hit, ctx) {
  if (!hit) return;
  if (hit.type === 'wall' || hit.type === 'prop' || hit.type === 'out' || hit.type === 'faded') return;

  const killer = players[ctx.ownerId];

  if (hit.type === 'npc') {
    const npc = hit.npc;
    const killed = registerNPCHit(npc);

    io.to(ctx.roomName).emit('npcHit', {
      npcId: npc.id,
      hitsTaken: npc.hitsTaken,
      maxHits: npc.maxHits,
      health: npc.health,
      isKnife: ctx.isKnife
    });

    if (killed) killNPC(hit.npcId, npc, ctx.roomName, ctx.ownerId);

    io.to(ctx.roomName).emit('stateUpdate', buildStateUpdatePayload(ctx.roomName));
    sendRadarAfterStateChange();
    if (killed) broadcastLeaderboard(ctx.roomName);
    return;
  }

  if (hit.type !== 'player') return;

  const victim = players[hit.victimId];
  if (!victim || !victim.alive) return;

  if (typeof victim.health !== 'number') {
    victim.health = victim.role === 'hunter' ? HUNTER_MAX_HEALTH : PROP_MAX_HEALTH;
  }
  victim.health -= ctx.damage;

  if (ctx.isKnife) {
    io.to(hit.victimId).emit('hit', { health: Math.max(0, victim.health) });

    if (victim.health <= 0) {
      victim.health = 0;
      victim.alive = false;
      victim.isProp = false;
      victim.propId = null;

      if (killer) {
        killer.score = (killer.score || 0) + HUNTER_KILL_SCORE;
        killer.coins = (killer.coins || 0) + HUNTER_KILL_COINS;
        syncWalletFromPlayer(killer, ctx.ownerId);
        if (dbPlayers && killer.playerId) {
          dbPlayers.updateOne({ _id: killer.playerId }, { $inc: { coins: HUNTER_KILL_COINS } }).catch(() => {});
        }
        emitWallet(io.sockets.sockets.get(ctx.ownerId), killer);
      }

      io.to(hit.victimId).emit('died');
      broadcastLeaderboard(victim.roomName);
      checkWinConditions(victim.roomName);
    }

    io.to(victim.roomName).emit('stateUpdate', buildStateUpdatePayload(victim.roomName));
    sendRadarAfterStateChange();
    return;
  }

  const wasDisguised = victim.isProp;

  if (wasDisguised) {
    victim.isProp = false;
    victim.propId = null;
    victim.disguiseBrokenAt = Date.now();

    io.to(hit.victimId).emit('disguiseBroken', { health: victim.health });
  }

  if (victim.health <= 0) {
    victim.alive = false;
    victim.isProp = false;
    victim.propId = null;
    victim.health = 0;

    if (killer) {
      killer.score = (killer.score || 0) + HUNTER_KILL_SCORE;
      killer.coins = (killer.coins || 0) + HUNTER_KILL_COINS;
      syncWalletFromPlayer(killer, ctx.ownerId);
      if (dbPlayers && killer.playerId) {
        dbPlayers.updateOne({ _id: killer.playerId }, { $inc: { coins: HUNTER_KILL_COINS } }).catch(() => {});
      }
      emitWallet(io.sockets.sockets.get(ctx.ownerId), killer);
    }

    io.to(hit.victimId).emit('died');
    broadcastLeaderboard(victim.roomName);
    checkWinConditions(victim.roomName);
  } else {
    io.to(hit.victimId).emit('hit', {
      health: victim.health,
      disguiseBroken: wasDisguised
    });
  }

  io.to(victim.roomName).emit('stateUpdate', buildStateUpdatePayload(victim.roomName));
  sendRadarAfterStateChange();
}

"""
src = src[:start] + new_engine + src[end:]

# ------------------------------------------------------------------
# 6) Ticker: drop tickBullets()
# ------------------------------------------------------------------
old = """setInterval(() => {
  tickBullets();
  tickNPCs();"""
new = """setInterval(() => {
  tickNPCs();"""
assert src.count(old) == 1
src = src.replace(old, new)

open(path, 'w').write(src)
print("server.js edited OK; new line count:", src.count('\n') + 1)
