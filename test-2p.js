// Two-client regression test:
//  [A] joins, re-rolling until they are a hunter
//  [B] joins as anyone and OBSERVES A over stateUpdate (the data path that
//      drives the remote placeholder cylinders in updatePlayerMeshes)
// Verifies:
//  1. Planar collision/boundary logic still constrains movement (A)
//  2. A remote client receives A's jump height (y) + depth (z) (B)
//  3. Bullets still spawn on the planar X/Z plane after the y/z migration
const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
const A = io(URL, { reconnection: false });
const B = io(URL, { reconnection: false });

let aId = null, bId = null;
let aPos = null;
let collisionPass = false, replicatePass = false, bulletPass = false;

const timeout = setTimeout(() => {
  console.error('TIMEOUT. collisionPass=%s replicatePass=%s bulletPass=%s',
    collisionPass, replicatePass, bulletPass);
  process.exit(1);
}, 12000);

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

function maybeFinish() {
  if (collisionPass && replicatePass && bulletPass) {
    console.log('\nALL TWO-CLIENT TESTS PASSED');
    clearTimeout(timeout);
    A.close(); B.close();
    process.exit(0);
  }
}

// ---- Client A: hunter (re-roll via leave+join until hunter) ----------------
let attempts = 0;
A.on('connect', () => A.emit('joinGame'));
A.on('init', (data) => {
  aId = data.id;
  const me = data.players[aId];
  if (me.role !== 'hunter' && attempts < 20) {
    attempts++;
    A.emit('leaveGame');
    setTimeout(() => A.emit('joinGame'), 30);
    return;
  }
  if (me.role !== 'hunter') fail('could not roll a hunter');
  console.log('[A] hunter ready after %d re-roll(s) at x=%s z=%s',
    attempts, me.x.toFixed(1), me.z.toFixed(1));
  // B joins now, then the test sequence starts
  B.emit('joinGame');
});

// A checks its own constraining after the sequence kicks off (started by B)
function startSequence() {
  // 1. Deliberately out-of-bounds move -> must be clamped by collision/bounds
  A.emit('playerMove', { x: -500, y: 12, z: -500 });
}

A.on('stateUpdate', (players) => {
  const me = players[aId];
  if (!me || aPos === 'done') return;

  if (!collisionPass) {
    if (me.x >= 15 && me.z >= 15) {
      aPos = { x: me.x, z: me.z };
      collisionPass = true;
      console.log('[A] PASS: out-of-bounds 3D move constrained to x=%s z=%s (wall/boundary logic intact)',
        me.x.toFixed(1), me.z.toFixed(1));
      // 2. Jump: keep planar spot, raise eye height to a mid-air value
      A.emit('playerMove', { x: aPos.x, y: 24.75, z: aPos.z });
      // 3. Fire: bullet must spawn at the shooter's PLANAR position (z)
      setTimeout(() => A.emit('shoot', { dx: 100, dy: 0 }), 50);
      maybeFinish();
    }
    return;
  }
});

// ---- Client B: pure observer of A's replicated 3D state --------------------
B.on('init', (data) => {
  bId = data.id;
  console.log('[B] observer joined as %s', data.players[bId].role);
  startSequence();
});

B.on('stateUpdate', (players) => {
  const other = players[aId];
  if (!other || !collisionPass) return;
  if (!replicatePass && other.y === 24.75 && aPos &&
      Math.abs(other.x - aPos.x) < 0.01 && Math.abs(other.z - aPos.z) < 0.01) {
    replicatePass = true;
    console.log('[B] PASS: remote client sees A mid-jump -> y=%s at x/z unchanged (cylinders will lift on Y axis)',
      other.y);
    maybeFinish();
  }
});

// ---- Bullet replication (both clients get bulletsUpdate) -------------------
A.on('bulletsUpdate', (bullets) => {
  if (bulletPass || !aPos) return;
  const b = bullets.find((bl) => bl.ownerId === aId);
  if (b && Math.abs(b.y - aPos.z) < 0.5 && Math.abs(b.x - aPos.x) < 40) {
    bulletPass = true;
    console.log('[A] PASS: bullet spawned on planar plane at x=%s (depth)z->bullet.y=%s',
      b.x.toFixed(1), b.y.toFixed(1));
    maybeFinish();
  }
});
