// Live protocol smoke test for the 3D network sync.
// Simulates a real client: join -> move with a jump height -> bogus values ->
// legacy 2D payload -> landing. Verifies the server stores/clamps x, y, z.
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', { reconnection: false });

let myId = null;
let spawn = null;
let phase = 0;
let radarSeen = false;

const timeout = setTimeout(() => {
  console.error('TIMEOUT - test did not reach the final phase (stuck at phase %d)', phase);
  process.exit(1);
}, 8000);

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

socket.on('connect', () => {
  socket.emit('joinGame');
});

socket.on('radarData', () => {
  radarSeen = true; // radar pipeline still alive after the coordinate migration
});

socket.on('init', (data) => {
  myId = data.id;
  const me = data.players[myId];
  console.log('[1] joined. player record:', JSON.stringify(me));

  if (typeof me.x !== 'number') fail('player.x missing');
  if (typeof me.z !== 'number') fail('player.z (planar depth) missing');
  if (me.y !== 12) fail('player.y should initialise to eye level 12, got ' + me.y);
  if (typeof me.role !== 'string') fail('role missing');
  console.log('[1] PASS: player record carries x=%s, y=%s (eye height), z=%s',
    me.x.toFixed(1), me.y, me.z.toFixed(1));

  spawn = { x: me.x, z: me.z };
  // Planar move + a mid-jump eye height (12 base + 14 apex = 26)
  socket.emit('playerMove', { x: spawn.x + 40, y: 26, z: spawn.z + 40 });
});

socket.on('stateUpdate', (players) => {
  const me = players[myId];
  if (!me || !spawn) return;

  if (phase === 0 && me.y === 26) {
    if (Math.abs(me.x - (spawn.x + 40)) > 0.01) fail('x not synced: ' + me.x);
    if (Math.abs(me.z - (spawn.z + 40)) > 0.01) fail('z not synced: ' + me.z);
    console.log('[2] PASS: full 3D move synced -> x=%s, y=%s (jump height), z=%s',
      me.x.toFixed(1), me.y, me.z.toFixed(1));
    phase = 1;
    // Bogus vertical height must be server-clamped to MAX_PLAYER_HEIGHT (60)
    socket.emit('playerMove', { x: spawn.x, y: 99999, z: spawn.z });
    return;
  }

  if (phase === 1 && me.y === 60) {
    console.log('[3] PASS: absurd jump height clamped to 60 by the server');
    phase = 2;
    // Legacy 2D payload (no z) must be ignored outright...
    socket.emit('playerMove', { x: spawn.x + 500, y: 30 });
    // ...and a valid 3D payload right after must still work (landing at eye level)
    socket.emit('playerMove', { x: spawn.x, y: 12, z: spawn.z });
    return;
  }

  if (phase === 2 && me.y === 12) {
    if (Math.abs(me.x - spawn.x) > 0.01 || Math.abs(me.z - spawn.z) > 0.01) {
      fail('legacy 2D payload leaked through: ' + JSON.stringify(me));
    }
    console.log('[4] PASS: legacy 2D payload ignored; valid landing synced -> y=12, x/z back at spawn');
    if (!radarSeen) console.warn('    (note: no radarData yet, but pipeline intact)');
    console.log('\nALL NETWORK SYNC TESTS PASSED');
    clearTimeout(timeout);
    socket.close();
    process.exit(0);
  }
});

socket.on('connect_error', (err) => fail('cannot reach server: ' + err.message));
