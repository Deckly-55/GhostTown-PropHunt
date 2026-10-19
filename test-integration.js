// Integration smoke test for Group 3 combat mechanics:
//  - lobby join (private room), host start, role assignment
//  - shoot with weaponType -> bullet carries correct damage profile
//  - per-weapon damage actually applied to props (primary 50 / secondary 15)
//  - requestHeal -> health restored to 100 + stateUpdate emitted
//  - requestHeal rejected in lobby (state gate) and when dead (alive gate)
const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';
const results = [];
function check(name, ok, extra) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

function waitForEvent(socket, event, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for '${event}'`));
    }, timeout);
    function handler(data) {
      if (predicate && !predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }
    socket.on(event, handler);
  });
}

function waitForBullet(socket, predicate, timeout = 4000) {
  return waitForEvent(socket, 'bulletsUpdate', (list) =>
    Array.isArray(list) && list.some(predicate), timeout
  ).then((list) => list.find(predicate));
}

async function main() {
  const host = await connect();
  const joiner = await connect();
  let hostInit = null, joinerInit = null;
  host.on('init', (d) => (hostInit = d));
  joiner.on('init', (d) => (joinerInit = d));

  // --- Lobby gate: requestHeal must be rejected while state is 'waiting' ---
  const lobbyStateUpdates = [];
  joiner.on('stateUpdate', () => lobbyStateUpdates.push(Date.now()));
  host.emit('joinGame', { matchType: 'private', zone: 'oldCityCenter', timeLimit: 300, roomCode: null });
  await sleep(500);
  const code = hostInit.roomCode;
  check('host init received + private code', !!hostInit && typeof code === 'string' && code.length === 4, code);

  joiner.emit('joinGame', { matchType: 'private', zone: null, roomCode: code });
  await sleep(500);
  check('joiner init received', !!joinerInit && joinerInit.roomCode === code);

  const lobbyUpdatesBefore = lobbyStateUpdates.length;
  joiner.emit('requestHeal'); // lobby heal attempt — must be ignored
  await sleep(500);
  check('requestHeal rejected in lobby (no stateUpdate)', lobbyStateUpdates.length === lobbyUpdatesBefore);

  // --- Start match ---
  const matchStartedP = waitForEvent(host, 'matchStarted');
  host.emit('startMatch');
  const matchStarted = await matchStartedP;
  check('matchStarted emitted, state=playing', matchStarted.state === 'playing');
  check('timer intact (timeLeft == timeLimit)', matchStarted.timeLeft === matchStarted.timeLimit, `${matchStarted.timeLeft}s`);

  const playersData = matchStarted.players;
  const hostMe = playersData[host.id];
  const joinerMe = playersData[joiner.id];
  check('roles assigned (1 hunter / 1 prop)', hostMe.role !== joinerMe.role, `host=${hostMe.role}, joiner=${joinerMe.role}`);

  const hunterId = hostMe.role === 'hunter' ? host.id : joiner.id;
  const propId = hostMe.role === 'prop' ? host.id : joiner.id;
  const hunter = hostMe.role === 'hunter' ? host : joiner;
  const prop = hostMe.role === 'prop' ? host : joiner;

  // --- Position players for deterministic bullet/melee tests ---
  // 300 units apart along -Z with a clear line of sight in oldCityCenter,
  // so each test bullet stays in flight for ~0.6s (visible in bulletsUpdate)
  // before connecting with the prop.
  hunter.emit('playerMove', { x: 2700, y: 12, z: 1500 });
  prop.emit('playerMove', { x: 2700, y: 12, z: 1200 });
  await sleep(300);

  // --- Primary bullet: damage profile 50 + applied damage ---
  const primaryBulletP = waitForBullet(hunter, (b) => b.weaponType === 'primary');
  const propHitPrimary = waitForEvent(prop, 'hit', (d) => d.health === 50);
  hunter.emit('shoot', { dx: 0, dy: 0, dz: -1, weaponType: 'primary' });
  const [pBullet, pHit] = await Promise.all([primaryBulletP, propHitPrimary]);
  check('primary bullet carries damage 50', pBullet.damage === 50, `damage=${pBullet.damage}`);
  check('primary applies 50 damage to prop', pHit && pHit.health === 50, `health=${pHit.health}`);

  // --- Secondary bullet: damage profile 15 + applied damage ---
  const secondaryBulletP = waitForBullet(hunter, (b) => b.weaponType === 'secondary');
  const propHitSecondary = waitForEvent(prop, 'hit', (d) => d.health === 35);
  hunter.emit('shoot', { dx: 0, dy: 0, dz: -1, weaponType: 'secondary' });
  const [sBullet, sHit] = await Promise.all([secondaryBulletP, propHitSecondary]);
  check('secondary bullet carries damage 15', sBullet.damage === 15, `damage=${sBullet.damage}`);
  check('secondary applies 15 damage (35 total)', sHit && sHit.health === 35, `health=${sHit.health}`);

  // --- Invalid weaponType falls back to primary profile (bullet payload only) ---
  const fallbackBulletP = waitForBullet(hunter, (b) => b.weaponType === 'primary' && b.damage === 50);
  hunter.emit('shoot', { dx: 1, dy: 0, dz: 0, weaponType: 'rocket' }); // fires away from prop
  const fallback = await fallbackBulletP;
  check('invalid weaponType falls back to primary (50)', !!fallback, fallback && `damage=${fallback.damage}`);

  // --- requestHeal: 35 -> 100 with stateUpdate ---
  const healStateUpdate = waitForEvent(host, 'stateUpdate', (d) => d[propId] && d[propId].health === 100);
  const healStateUpdate2 = waitForEvent(joiner, 'stateUpdate', (d) => d[propId] && d[propId].health === 100);
  prop.emit('requestHeal');
  const [hs1, hs2] = await Promise.all([healStateUpdate, healStateUpdate2]);
  check('requestHeal restores health to 100 (both clients see stateUpdate)', hs1[propId].health === 100 && hs2[propId].health === 100);

  // --- Alive gate: dead hunter must NOT be healed ---
  // Prop walks up to the hunter (within MELEE_RANGE = 50) for the kill.
  prop.emit('playerMove', { x: 2700, y: 12, z: 1460 });
  await sleep(300);
  const hunterDied = waitForEvent(hunter, 'died');
  const kill1 = waitForEvent(prop, 'meleeHit');
  prop.emit('meleeAttack');
  await Promise.all([kill1]);
  await sleep(200);
  prop.emit('meleeAttack'); // second slash kills (100 -> 50 -> 0)
  await hunterDied;
  check('prop killed hunter via melee (2 hits)', true);

  const deadUpdates = [];
  hunter.on('stateUpdate', (d) => deadUpdates.push(d));
  hunter.emit('requestHeal'); // dead player's heal request — must be ignored
  await sleep(500);
  const healedWhileDead = deadUpdates.some((d) => d[hunterId] && d[hunterId].health === 100);
  check('requestHeal rejected for dead player', !healedWhileDead);

  host.close();
  joiner.close();
  await sleep(200);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('TEST ERROR:', e.message); process.exit(1); });
