/**
 * Integration test for the Lobby UI / Socket.io Room System.
 * Spins up 7 simulated clients and verifies:
 *   1. Private match creation -> 4-char room code + chosen zone
 *   2. Joining a private match with a code -> same room, zone fetched from room
 *   3. Joining with a bad code -> joinError
 *   4. Global match -> deterministic room per zone, roomCode null
 *   5. stateUpdate / radar / leaderboard isolation (no cross-room bleed)
 *   6. bulletsUpdate isolation
 *   7. playerJoined / playerLeft scoped to the room
 *   8. Room code freed when the last player leaves
 *   9. Spawn position lies inside the room's district bounding box
 *  10. Bullet boundary enforcement uses the district bounding box
 */
const { io } = require('socket.io-client');

const URL = 'http://localhost:3999';
let failures = 0;

function assert(cond, label, extra) {
  if (cond) {
    console.log(`  ✔ ${label}`);
  } else {
    failures++;
    console.log(`  ✘ FAIL: ${label}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`);
  }
}

function connect(name) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    s.on('connect', () => { console.log(`[${name}] connected ${s.id}`); resolve(s); });
    s.on('connect_error', reject);
  });
}

function waitEvent(s, ev, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for '${ev}'`)), timeout);
    s.once(ev, (data) => { clearTimeout(t); resolve(data); });
  });
}

// Collect every occurrence of `ev` on `s` for `ms` ms, then resolve with the list.
function collectEvents(s, ev, ms) {
  return new Promise((resolve) => {
    const got = [];
    const onEv = (data) => got.push(data);
    s.on(ev, onEv);
    setTimeout(() => { s.off(ev, onEv); resolve(got); }, ms);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const A = await connect('A'); // private host
  const B = await connect('B'); // joins A's private room
  const C = await connect('C'); // global player (different room)
  const D = await connect('D'); // tries a bad code, later global player
  const E = await connect('E'); // joins A's room later, then leaves
  const F = await connect('F'); // tries the freed code after everyone leaves

  // ---------- 1. A creates a private match on miningForgeHub ----------
  A.emit('joinGame', { matchType: 'private', zone: 'miningForgeHub' });
  const initA = await waitEvent(A, 'init');
  console.log('\n=== 1. Private creation ===');
  assert(initA.roomCode && /^[A-Z0-9]{4}$/.test(initA.roomCode), 'host receives a 4-char alphanumeric room code', initA.roomCode);
  assert(initA.roomName === `private_${initA.roomCode}`, 'room name is private_<CODE>', initA.roomName);
  assert(initA.zone.id === 'miningForgeHub', 'zone is the one the host picked');
  assert(Object.keys(initA.players).length === 1, 'init players only contains the host');
  assert(initA.props.length > 0, 'init props are the district props');
  const meA = initA.players[initA.id];
  assert(meA && meA.x >= 6000 && meA.x <= 9000 && meA.z >= 0 && meA.z <= 7000, 'spawn is inside miningForgeHub bounding box', { x: meA.x, z: meA.z });

  // ---------- 2. B joins with the code (no zone provided) ----------
  const joinedNotifP = waitEvent(A, 'playerJoined'); // register before the join
  B.emit('joinGame', { matchType: 'private', roomCode: initA.roomCode });
  const initB = await waitEvent(B, 'init');
  console.log('\n=== 2. Private join by code ===');
  assert(initB.roomCode === initA.roomCode, 'joiner gets the same room code');
  assert(initB.roomName === initA.roomName, 'joiner is in the same room', initB.roomName);
  assert(initB.zone.id === 'miningForgeHub', 'joiner receives the zone fetched from the room');
  assert(Object.keys(initB.players).length === 2, 'joiner sees exactly 2 players (host + self)');
  const joinedNotif = await joinedNotifP;
  assert(joinedNotif.id === B.id, 'host gets playerJoined for the joiner');

  // ---------- 3. D tries a bogus code ----------
  const errDP = waitEvent(D, 'joinError');
  D.emit('joinGame', { matchType: 'private', roomCode: 'ZZZZ' });
  const errD = await errDP;
  console.log('\n=== 3. Bad code rejected ===');
  assert(Boolean(errD && errD.message), 'joiner with bad code receives joinError', errD && errD.message);
  assert(D.connected, 'rejected socket stays connected (can retry)');

  // ---------- 4. C joins a global match on oldCityCenter ----------
  const initCP = waitEvent(C, 'init');
  C.emit('joinGame', { matchType: 'global', zone: 'oldCityCenter' });
  const initC = await initCP;
  console.log('\n=== 4. Global match ===');
  assert(initC.roomCode === null, 'global room has no code (Public Match)', initC.roomCode);
  assert(initC.roomName === 'global_oldCityCenter', 'global room name is global_<zone>', initC.roomName);
  assert(initC.zone.id === 'oldCityCenter', 'global zone is the chosen district');
  assert(Object.keys(initC.players).length === 1, 'global init sees only its own room players');

  // ---------- 5. stateUpdate / radar isolation ----------
  console.log('\n=== 5. Cross-room isolation ===');
  const stateBP = waitEvent(B, 'stateUpdate');      // register before the move
  const leakCP = collectEvents(C, 'stateUpdate', 1500);
  const radarAP = waitEvent(A, 'radarData');
  A.emit('playerMove', { x: meA.x + 5, y: 12, z: meA.z + 5 }); // A moves
  const stateB = await stateBP;
  const leakC = await leakCP;
  const bIds = Object.keys(stateB);
  assert(bIds.length === 2 && bIds.includes(A.id) && bIds.includes(B.id), 'B stateUpdate contains only A+B', bIds);
  assert(leakC.length === 0, 'global player C receives ZERO stateUpdates while A moves (no bleed)');

  const radarA = await radarAP;
  const radarIds = new Set((radarA.realtime || []).map((c) => c.id));
  assert(!radarIds.has(C.id), 'A radar never shows the global player C', [...radarIds]);

  // ---------- 6. Bullet isolation ----------
  console.log('\n=== 6. Bullet isolation ===');
  const roleA = initA.players[initA.id].role;
  const roleB = initB.players[initB.id].role;
  const hunterSock = roleA === 'hunter' ? A : (roleB === 'hunter' ? B : null);
  const witnessSock = hunterSock === A ? B : A;
  const outsiderSock = C;
  if (hunterSock) {
    const bulletsWP = waitEvent(witnessSock, 'bulletsUpdate', 3000); // register before the shot
    const leakBulletsP = collectEvents(outsiderSock, 'bulletsUpdate', 1500);
    hunterSock.emit('shoot', { dx: 1, dy: 0, dz: 0 });
    const bulletsW = await bulletsWP;
    assert(Array.isArray(bulletsW) && bulletsW.some((b) => b.ownerId === hunterSock.id), 'roommate receives the shot bullet');
    const leakBullets = await leakBulletsP;
    assert(leakBullets.length === 0, 'global player C receives ZERO bulletsUpdates from the private room', leakBullets.length);
  } else {
    console.log('  (skip: no hunter in private room this run)');
  }

  // ---------- 7. playerLeft scoped + leaderboard scoped ----------
  console.log('\n=== 7. Leave notifications ===');
  const lbEP = waitEvent(E, 'leaderboardUpdate'); // register before E joins
  const leftBP = waitEvent(A, 'playerLeft');      // register before B leaves
  const leakLeftCP = collectEvents(C, 'playerLeft', 800);
  E.emit('joinGame', { matchType: 'private', roomCode: initA.roomCode });
  const initE = await waitEvent(E, 'init');
  assert(Object.keys(initE.players).length === 3, 'E joins the private room (3 players)');
  B.emit('leaveGame');
  const leftB = await leftBP;
  assert(leftB === B.id, 'A is notified that B left');
  const leakLeftC = await leakLeftCP;
  assert(leakLeftC.length === 0, 'global player C gets no playerLeft from A/B room');

  // Leaderboard: E's join triggers a broadcast; check C never sees A/E ids.
  const lbE = await lbEP;
  const lbIdsE = new Set(lbE.map((e) => e.id));
  assert(lbIdsE.has(A.id) && lbIdsE.has(E.id) && !lbIdsE.has(C.id), 'E leaderboard only contains roommates', [...lbIdsE]);

  // ---------- 8. Code freed when room empties ----------
  console.log('\n=== 8. Room code lifecycle ===');
  E.emit('leaveGame');
  await sleep(300);
  A.emit('leaveGame');
  await sleep(300);
  const errFP = waitEvent(F, 'joinError'); // register before the join attempt
  F.emit('joinGame', { matchType: 'private', roomCode: initA.roomCode });
  const errF = await errFP;
  assert(Boolean(errF && errF.message), 'freed code is rejected after room empties', errF && errF.message);

  // ---------- 9. Global rejoin = same room ----------
  console.log('\n=== 9. Global rooms are shared ===');
  const initA2P = waitEvent(A, 'init');
  A.emit('joinGame', { matchType: 'global', zone: 'miningForgeHub' });
  const initA2 = await initA2P;
  assert(initA2.roomName === 'global_miningForgeHub' && initA2.roomCode === null, 'A rejoins global_miningForgeHub');
  const initDP = waitEvent(D, 'init');
  D.emit('joinGame', { matchType: 'global', zone: 'miningForgeHub' });
  const initD = await initDP;
  assert(initD.roomName === 'global_miningForgeHub' && Object.keys(initD.players).length === 2,
    'second global player lands in the same room (2 players)');

  // ---------- 10. Bullet boundary = district box ----------
  console.log('\n=== 10. Bullet boundary uses district box ===');
  // Find a clear firing lane. Then move a HUNTER to (6050, z) and fire WEST
  // (dx=-1). District box west edge is x = 6000 (world west edge is x = 0).
  const PATH_X_MIN = 5985, PATH_X_MAX = 6055;
  let laneZ = null;
  for (const z of [500, 1500, 2500, 3500, 4500, 5500, 6500]) {
    const blocked = initD.map.some((o) =>
      o.x < PATH_X_MAX && o.x + o.width > PATH_X_MIN &&
      o.y < z + 12 && o.y + o.height > z - 12
    );
    if (!blocked) { laneZ = z; break; }
  }
  assert(laneZ !== null, 'found a clear west-firing lane', laneZ);

  // Roles are random 50/50 — keep connecting until we land a hunter.
  let hunter = null;
  for (let i = 0; i < 12 && !hunter; i++) {
    const s = await connect(`H${i}`);
    const initP = waitEvent(s, 'init');
    s.emit('joinGame', { matchType: 'global', zone: 'miningForgeHub' });
    const init = await initP;
    if (init.players[init.id].role === 'hunter') hunter = s; else s.close();
  }
  assert(hunter !== null, 'found a hunter in global_miningForgeHub');

  const updatesP = collectEvents(hunter, 'bulletsUpdate', 2500); // register before the shot
  hunter.emit('playerMove', { x: 6050, y: 12, z: laneZ });
  await sleep(200); // let the move settle
  hunter.emit('shoot', { dx: -1, dy: 0, dz: 0 });
  const updates = await updatesP;
  const seenXs = [];
  for (const u of updates) for (const b of u) if (b.ownerId === hunter.id) seenXs.push(b.x);
  assert(seenXs.length > 0, 'hunter observed his own bullet in flight', seenXs.length);
  const minX = Math.min(...seenXs);
  assert(minX >= 5985, `bullet stopped at the DISTRICT west edge (x≈6000) — min observed ${minX}`);
  assert(minX > 4500, 'bullet never approached the world west edge (x=0)');

  console.log(failures === 0 ? '\n✅ ALL TESTS PASSED' : `\n❌ ${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Test crashed:', err.message);
  process.exit(2);
});
