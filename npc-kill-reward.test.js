/*
 * Verification harness for the NPC-kill reward block added to server.js.
 *
 * Runs the REAL server.js in-process (node_modules/{express,socket.io,mongodb}
 * are local stubs, so no network, DB or port is touched). The module exposes
 * test hooks (module.exports) purely so this harness can drive the actual
 * tickBullets() function — no logic is copied or reimplemented here.
 *
 *   node test/npc-kill-reward.test.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

/*
 * Usage:
 *   node test/make-stubs.js                                  # one-off stubs
 *   node test/npc-kill-reward.test.js --with-hooks           # keeps server.js untouched
 *
 * --with-hooks runs the harness against a temp copy of server.js with three
 * lines of test hooks appended, so your shipped file needs no module.exports.
 */
const WITH_HOOKS = process.argv.includes('--with-hooks');

// Never bind a real port while booting the game server under test.
http.Server.prototype.listen = function (...args) {
  const cb = [...args].pop();
  if (typeof cb === 'function') setImmediate(cb);
  return this;
};

// Freeze the continuous gameplay loops (they would otherwise keep the process
// alive and re-run ticks on their own); respawn setTimeout stays live.
setInterval = () => ({ _unref() {} });

const ROOT = path.join(__dirname, '..');
const mongoStub = require(path.join(ROOT, 'node_modules/mongodb'));
const sioStub = require(path.join(ROOT, 'node_modules/socket.io'));
const SERVER_FILE = path.join(ROOT, 'server.js');

// Refuse to run while the harness stubs are shadowing real packages: that state
// would break a production boot, so surface it loudly instead of hiding it.
for (const pkg of ['express', 'socket.io', 'mongodb']) {
  const pj = path.join(ROOT, 'node_modules', pkg, 'package.json');
  if (fs.existsSync(pj) && /harness-stub/.test(fs.readFileSync(pj, 'utf8')) && !WITH_HOOKS) {
    console.error(`\n${pkg} in node_modules is a harness stub. Either run with --with-hooks,`
      + ` or delete node_modules/{express,socket.io,mongodb} before booting the real server.\n`);
    process.exit(3);
  }
}

let target = SERVER_FILE;
if (WITH_HOOKS) {
  // Byte-identical copy of server.js + the 3 hook lines the harness needs.
  // Must live under the project root so server.js's own require() still
  // resolves the local node_modules stubs.
  const tmp = fs.mkdtempSync(path.join(ROOT, '.verify-'));
  target = path.join(tmp, 'server.js');
  process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });
  fs.writeFileSync(target, fs.readFileSync(SERVER_FILE, 'utf8')
    + '/* TEST HOOKS (harness only) */\n'
    + 'module.exports = { tickBullets, npcs, players, wallets, io, getRoomState, getOrCreateRoomState, roomStates,\n'
    + '  setBullets: (b) => { bullets = b; }, getBullets: () => bullets };\n');
}
const app = require(target);

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? '  ->  ' + detail : ''}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  check('server.js booted (no throw)', !!app && typeof app.tickBullets === 'function');

  // Let server.js's async boot (MongoDB connect -> dbPlayers) settle before
  // driving the tick, exactly as it does in production before the first shot.
  await wait(300);

  const ROOM = 'test_room';
  app.getOrCreateRoomState(ROOM, {
    id: 'oldCityCenter', name: 'Test District', minX: 0, maxX: 9000, minZ: 0, maxZ: 9000
  }, 600, 'sock-1');
  // Put the room into the 'playing' state (tickBullets bails out otherwise).
  app.getRoomState(ROOM).state = 'playing';
  console.log(`  info  room state: ${JSON.stringify(app.getRoomState(ROOM).state)}`);

  const sock = sioStub.__instances[0].addSocket('sock-1');

  app.players['sock-1'] = {
    id: 'sock-1', playerId: 'pid-1', name: 'Tester', roomName: ROOM,
    x: 100, y: 12, z: 100, vx: 0, vy: 0, vz: 0,
    health: 100, alive: true, score: 0, coins: 100,
    role: 'hunter', isProp: false, propId: null,
    inventory: ['default'], equippedSkin: 'default'
  };

  app.npcs.testnpc = {
    id: 'testnpc', x: 200, y: 12, z: 200, health: 40, speed: 6,
    waypoints: [{ x: 200, z: 200 }, { x: 260, z: 200 }], currentWaypoint: 1
  };

  const fire = (over) => app.setBullets([{
    id: 1000 + Math.floor(Math.random() * 1e6), ownerId: 'sock-1', roomName: ROOM,
    x: 190, y: 12, z: 200, vx: 5, vy: 0, vz: 0,
    damage: 100, type: 'bullet', weaponType: 'rifle',
    createdAt: Date.now(), life: 100000, ...over
  }]);

  // ---------------------------------------------------------------- kill ----
  fire({ damage: 100 });
  app.tickBullets();

  const p = app.players['sock-1'];
  check('shooter.score += 50  (0 -> 50)', p.score === 50, 'score=' + p.score);
  check('shooter.coins += 25  (100 -> 125)', p.coins === 125, 'coins=' + p.coins);
  check('wallets[socketId] synced (125)', app.wallets['sock-1'] && app.wallets['sock-1'].coins === 125,
    JSON.stringify(app.wallets['sock-1'] || null));

  await wait(80);
  const inc = mongoStub.__calls.filter((c) => c[0] === 'updateOne' && /"coins":25/.test(c[2] || ''));
  check('Mongo updateOne({_id:"pid-1"},{$inc:{coins:25}}) fired exactly once',
    inc.length === 1, 'matched=' + JSON.stringify(inc) + ' all=' + JSON.stringify(mongoStub.__calls));

  const walletEvents = sock.emitted.filter((e) => e.event === 'walletUpdate');
  check('walletUpdate emitted once to shooter socket with coins:125',
    walletEvents.length === 1 && walletEvents[0].payload.coins === 125,
    JSON.stringify(sock.emitted.map((e) => e.event)));
  check('NPC removed from npcs map on death', !app.npcs.testnpc, JSON.stringify(app.npcs.testnpc));

  // ------------------------------------------------- 10s respawn timer ----
  const t0 = Date.now();
  let respawned = null;
  while (Date.now() - t0 < 13000) {
    if (app.npcs.testnpc) { respawned = app.npcs.testnpc; break; }
    await wait(100);
  }
  const elapsed = Date.now() - t0;
  check('NPC respawned at first waypoint with health 100',
    !!respawned && respawned.health === 100 && respawned.x === 200 && respawned.z === 200 && respawned.currentWaypoint === 1,
    `payload=${JSON.stringify(respawned)}`);
  check('respawn delay still ~10s', elapsed >= 9500 && elapsed <= 13000, `elapsed=${elapsed}ms`);
  check('no second payout when the NPC respawns', p.coins === 125 && p.score === 50,
    `coins=${p.coins} score=${p.score}`);

  // ---------------------------------------------- safety / regressions ------
  const clearNpcs = () => { for (const k of Object.keys(app.npcs)) delete app.npcs[k]; };
  clearNpcs();
  app.npcs.orphan = {
    id: 'orphan', x: 200, y: 12, z: 200, health: 1, speed: 6,
    waypoints: [{ x: 200, z: 200 }, { x: 260, z: 200 }], currentWaypoint: 1
  };
  fire({ ownerId: 'ghost-socket', damage: 100 });
  let crashed = null;
  try { app.tickBullets(); } catch (e) { crashed = e; }
  check('orphan bullet (shooter gone): NPC still dies, no crash, no payout',
    !crashed && !app.npcs.orphan && p.coins === 125 && p.score === 50,
    crashed ? crashed.message : `coins=${p.coins}`);

  clearNpcs();
  app.npcs.survivor = {
    id: 'survivor', x: 200, y: 12, z: 200, health: 100, speed: 6,
    waypoints: [{ x: 200, z: 200 }, { x: 260, z: 200 }], currentWaypoint: 1
  };
  fire({ damage: 30 });
  app.tickBullets();
  const s = app.npcs.survivor;
  check('non-lethal hit: NPC survives at health 70, no payout',
    !!s && s.health === 70 && p.coins === 125 && p.score === 50,
    s ? `health=${s.health} coins=${p.coins}` : 'NPC removed');
  check('non-lethal hit: no extra walletUpdate',
    sock.emitted.filter((e) => e.event === 'walletUpdate').length === 1,
    JSON.stringify(sock.emitted.filter((e) => e.event === 'walletUpdate')));

  clearNpcs();
  app.players['sock-2'] = {
    id: 'sock-2', playerId: 'pid-2', name: 'Victim', roomName: ROOM,
    x: 400, y: 12, z: 400, vx: 0, vy: 0, vz: 0,
    health: 100, alive: true, score: 0, coins: 0, role: 'prop', isProp: false, propId: null
  };
  fire({ x: 390, z: 400, damage: 35 });
  app.tickBullets();
  const v = app.players['sock-2'];
  check('player-damage path intact: victim 100 -> 65', v.health === 65, 'health=' + v.health);

  // Knife vs NPC still uses the 50-damage knife rule and now pays out too.
  clearNpcs();
  app.npcs.knifetarget = {
    id: 'knifetarget', x: 200, y: 12, z: 200, health: 50, speed: 6,
    waypoints: [{ x: 200, z: 200 }, { x: 260, z: 200 }], currentWaypoint: 1
  };
  const before = { coins: p.coins, score: p.score };
  fire({ type: 'knife', damage: undefined, x: 190 });
  app.tickBullets();
  check('lethal knife on NPC: kills it and pays 25c/50p once',
    !app.npcs.knifetarget && p.coins === before.coins + 25 && p.score === before.score + 50,
    `coins=${p.coins} score=${p.score}`);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('HARNESS ERROR:', err && err.stack ? err.stack : err);
  process.exit(2);
});
