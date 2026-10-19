// Extracts the EXACT shipped engine block from game/server.js and exercises it.
const fs = require('fs');
const src = fs.readFileSync('/home/user/game/server.js', 'utf8');
const start = src.indexOf('// Phase 1 — Hitscan "Teleport" Shooting Engine (replaces tickBullets())');
const end = src.indexOf('function tickNPCs() {');
if (start < 0 || end < 0 || end <= start) throw new Error('anchors not found');
// back up to the '=====' line preceding the header comment
const block = src.slice(src.lastIndexOf('// ==========', start), end);

// ---- stubs matching server.js globals used by the block ----
let map = [];
let npcs = {};
let players = {};
let propsByZoneData = [];
const emitLog = [];
const ioStub = {
  to(room) {
    return {
      emit(event, data) { emitLog.push({ room, event, data }); }
    };
  },
  sockets: { sockets: { get: () => undefined } }
};
let dbPlayers = null;
const calls = { radar: 0, leaderboard: [], state: [], win: [], npcKilled: [], npcHitCount: 0 };
const getPropsForZone = () => propsByZoneData;
const zoneForRoomName = () => ({ id: 'oldCityCenter', minX: 0, maxX: 3000, minZ: 0, maxZ: 3000 });
const buildStateUpdatePayload = (r) => ({ players: {}, npcs: {}, lootDrops: {}, _room: r });
const sendRadarAfterStateChange = () => { calls.radar++; };
const broadcastLeaderboard = (r) => { calls.leaderboard.push(r); };
const checkWinConditions = (r) => { calls.win.push(r); };
const syncWalletFromPlayer = () => {};
const emitWallet = () => {};
const registerNPCHit = (npc) => { npc.hitsTaken++; calls.npcHitCount++; return npc.hitsTaken >= npc.maxHits; };
const killNPC = (npcId, npc, room, killer) => { calls.npcKilled.push(npcId); };
const io = ioStub;

const PLAYER_RADIUS = 15, BULLET_RADIUS = 8, WALL_HEIGHT = 40, GLASS_HEIGHT = 40, PROP_HEIGHT = 16;
const HITSCAN_MIN_Y = -10, HITSCAN_MAX_Y = 200, GHOUL_HITBOX_RADIUS = 25, GHOUL_HITBOX_HEIGHT = 45;
const MUZZLE_FORWARD_OFFSET = 10;
const HITSCAN_STEP = 4;
const HITSCAN_RANGE_BULLET = 6000;
const HITSCAN_RANGE_KNIFE = 1200;
const PLAYER_EYE_LEVEL = 12;
const PROP_MAX_HEALTH = 100, HUNTER_MAX_HEALTH = 100;
const HUNTER_KILL_SCORE = 100, HUNTER_KILL_COINS = 50;
const KNIFE_DAMAGE = 50;
const BULLET_DAMAGE = 35;
const WEAPON_PROFILES = { primary: { damage: 25 }, secondary: { damage: 12.5 } };
const getBulletDamage = (w) => (WEAPON_PROFILES[w] && WEAPON_PROFILES[w].damage) || BULLET_DAMAGE;

eval(block);

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const close = (a, b, eps = 0.0001) => Math.abs(a - b) <= eps;

// 1) normalizeAimVector: 3D payload, 2D legacy payload, NaN fallback
{
  const d = normalizeAimVector({ dx: 0, dy: 0, dz: 5 });
  t('aim: +z unit vector', close(d.x,0) && close(d.y,0) && close(d.z,1), d);
  const d2 = normalizeAimVector({ dx: 3, dy: 4 }); // legacy: dy maps to z
  t('aim: legacy 2D mapping', close(d2.x,0.6) && close(d2.y,0) && close(d2.z,0.8), d2);
  const d3 = normalizeAimVector({ dx: NaN, dy: NaN });
  t('aim: NaN falls back to safe +x', d3.x === 1 && d3.y === 0 && d3.z === 0, d3);
  const d4 = normalizeAimVector({ dx: 0, dy: 0, dz: 0 });
  t('aim: zero-length falls back', d4.x === 1 && d4.y === 0, d4);
}

// 2) clean miss into sky / range fade
{
  const dir = normalizeAimVector({ dx: 0, dy: 1, dz: 0 });
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, dir, 'global_oldCityCenter', 'prop', false);
  t('miss: straight up escapes as out', hit.type === 'out', hit);
  const flat = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: -1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('miss: ray ends at zone edge wall-less path', flat.type === 'out' || flat.type === 'faded', flat);
  t('miss: impact point inside zone bounds', flat.point.x >= 0 - 8, flat.point);
}

// 3) hit an enemy prop-player standing downrange
{
  players = {
    shooterA: { roomName: 'global_oldCityCenter', role: 'hunter', alive: true, x: 1500, y: 12, z: 1500 },
    victimB:  { roomName: 'global_oldCityCenter', role: 'prop',  alive: true, x: 1700, y: 12, z: 1500, health: 100, isProp: true, propId: 'prop9', disguiseBrokenAt: 0 }
  };
  const dir = normalizeAimVector({ dx: 1, dy: 0, dz: 0 });
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, dir, 'global_oldCityCenter', 'prop', false);
  t('hit: victim player found', hit.type === 'player' && hit.victimId === 'victimB', hit);
  t('hit: impact near victim centre (within one step + radius)', hit.point.x > 1677 && hit.point.x < 1700, hit.point);

  emitLog.length = 0;
  applyHitscanHit(hit, { ownerId: 'shooterA', roomName: 'global_oldCityCenter', damage: 25, isKnife: false });
  t('dmg: health 100 -> 75', players.victimB.health === 75, players.victimB.health);
  t('dmg: disguise broken', players.victimB.isProp === false && players.victimB.propId === null && players.victimB.disguiseBrokenAt > 0);
  const evts = emitLog.map(e => e.event);
  t('dmg: emits disguiseBroken + hit + stateUpdate', evts.includes('disguiseBroken') && evts.includes('hit') && evts.includes('stateUpdate'), evts);
  const hitEvt = emitLog.find(e => e.event === 'hit');
  t('dmg: hit payload carries health + disguiseBroken', hitEvt && hitEvt.data.health === 75 && hitEvt.data.disguiseBroken === true, hitEvt && hitEvt.data);
  t('dmg: hit routed to victim socket room', hitEvt && hitEvt.room === 'victimB', hitEvt && hitEvt.room);
}

// 4) lethal shot -> died, score/coins, leaderboard, win check
{
  emitLog.length = 0; calls.leaderboard.length = 0; calls.win.length = 0;
  players.shooterA.score = 0; players.shooterA.coins = 0;
  players.victimB.health = 20; players.victimB.isProp = false;
  const dir = normalizeAimVector({ dx: 1, dy: 0, dz: 0 });
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, dir, 'global_oldCityCenter', 'prop', false);
  applyHitscanHit(hit, { ownerId: 'shooterA', roomName: 'global_oldCityCenter', damage: 25, isKnife: false });
  t('kill: victim dead with 0 health', players.victimB.alive === false && players.victimB.health === 0);
  t('kill: shooter rewarded', players.shooterA.score === 100 && players.shooterA.coins === 50, [players.shooterA.score, players.shooterA.coins]);
  const evts = emitLog.map(e => e.event);
  t('kill: died emitted to victim', evts.includes('died') && emitLog.find(e => e.event === 'died').room === 'victimB', evts);
  t('kill: leaderboard + win conditions fired', calls.leaderboard.includes('global_oldCityCenter') && calls.win.includes('global_oldCityCenter'));
}

// 5) wall blocks a shot that would otherwise hit (priority along the ray)
{
  players = {
    shooterA: { roomName: 'global_oldCityCenter', role: 'hunter', alive: true, x: 1500, y: 12, z: 1500 },
    victimB:  { roomName: 'global_oldCityCenter', role: 'prop',  alive: true, x: 1700, y: 12, z: 1500, health: 100, isProp: false }
  };
  map = [{ x: 1620, y: 1480, width: 20, height: 40, type: 'wall' }]; // wall between (server layout: obj.y is depth/z)
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('block: wall wins over player behind it', hit.type === 'wall' && !hit.victimId, hit);
  t('block: impact stops on last clean step before wall', close(hit.point.x, 1616, 4.001), hit.point);
  map = [];
}

// 6) elevated shot clears a 40-high wall (y above obstacle height)
{
  map = [{ x: 1620, y: 1480, width: 20, height: 40, type: 'wall' }];
  const hit = castHitscanRay('shooterA', { x: 1500, y: 60, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('height: shot above WALL_HEIGHT is not blocked by the wall', hit.type !== 'wall' && hit.type !== 'prop', hit);
  const lowHit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('height: same wall blocks an eye-level shot at the same target', lowHit.type === 'wall', lowHit);
  map = [];
}

// 7) ghoul cylinder hitbox + knife-only target filtering
{
  npcs = { merchant1: { id: 'merchant1', x: 1600, y: 0, z: 1560, hitsTaken: 0, maxHits: 8, health: 100 } };
  players = { shooterA: { roomName: 'global_oldCityCenter', role: 'hunter', alive: true, x: 1500, y: 12, z: 1500 } };
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  // npc is 60 units to the side: outside the 25-unit cylinder -> must miss
  t('ghoul: off-axis shot misses the 25-unit cylinder', hit.type !== 'npc', hit);
  npcs = { merchant1: { id: 'merchant1', x: 1600, y: 0, z: 1520, hitsTaken: 0, maxHits: 8, health: 100 } };
  const nearHit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('ghoul: 20-unit lateral offset still inside the fat hitbox', nearHit.type === 'npc', nearHit);
  npcs = { merchant1: { id: 'merchant1', x: 1600, y: 0, z: 1500, hitsTaken: 0, maxHits: 8, health: 100 } };
  npcs = { merchant1: { id: 'merchant1', x: 1600, y: 0, z: 1500, hitsTaken: 0, maxHits: 8, health: 100 } };
  const hit2 = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('ghoul: straight-on shot hits cylinder', hit2.type === 'npc' && hit2.npcId === 'merchant1', hit2);
  emitLog.length = 0; calls.npcHitCount = 0;
  applyHitscanHit(hit2, { ownerId: 'shooterA', roomName: 'global_oldCityCenter', damage: 25, isKnife: false });
  t('ghoul: npcHit emitted with counts', emitLog.some(e => e.event === 'npcHit' && e.data.hitsTaken === 1 && e.data.maxHits === 8));
  // knife must NOT hit ghouls? old code let knives hit npcs too; keep parity: it hits.
  t('ghoul: health decremented via registerNPCHit', npcs.merchant1.hitsTaken === 1);

  // filtering: hunter's bullet only targets 'prop' role
  players = {
    shooterA: { roomName: 'global_oldCityCenter', role: 'hunter', alive: true, x: 1500, y: 12, z: 1500 },
    hunterPal:{ roomName: 'global_oldCityCenter', role: 'hunter', alive: true, x: 1700, y: 12, z: 1500, health: 100 }
  };
  npcs = {};
  const friendly = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('team: hunter bullet passes through fellow hunter', friendly.type !== 'player', friendly);
  players = { propX: { roomName: 'global_oldCityCenter', role: 'prop', alive: true, x: 1500, y: 12, z: 1500 }, hunterPal: players.hunterPal };
  const knife = castHitscanRay('propX', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'hunter', true);
  t('team: knife hits hunters', knife.type === 'player' && knife.victimId === 'hunterPal', knife);
  emitLog.length = 0; calls.win.length = 0;
  applyHitscanHit(knife, { ownerId: 'propX', roomName: 'global_oldCityCenter', damage: KNIFE_DAMAGE, isKnife: true });
  t('knife: 100 -> 50 hp', players.hunterPal.health === 50);
  applyHitscanHit({ type: 'player', victimId: 'hunterPal', point: { x: 1700, y: 12, z: 1500 } }, { ownerId: 'propX', roomName: 'global_oldCityCenter', damage: KNIFE_DAMAGE, isKnife: true });
  t('knife: lethal kill -> died + rewards', players.hunterPal.alive === false && emitLog.some(e => e.event === 'died') && calls.win.length === 1);
}

// 8) props as blockers
{
  propsByZoneData = [{ id: 'prop1', x: 1560, y: 1480, width: 40, height: 40 }];
  players = { shooterA: { roomName: 'global_oldCityCenter', role: 'hunter', alive: true, x: 1500, y: 12, z: 1500 } };
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'global_oldCityCenter', 'prop', false);
  t('prop: low shot blocked by prop box', hit.type === 'prop', hit);
  propsByZoneData = [];
}

// 9) anti-tunneling: grazing shot at radius-23 edge still connects; step 4 << diameter 46
{
  players = {
    shooterA: { roomName: 'g', role: 'hunter', alive: true, x: 1500, y: 12, z: 1500 },
    victimB:  { roomName: 'g', role: 'prop', alive: true, x: 1700, y: 12, z: 1515, health: 100 } // 15 lateral offset
  };
  const dir = normalizeAimVector({ dx: 1, dy: 0, dz: 0.05 });
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, dir, 'g', 'prop', false);
  t('edge: offset body still hit (no tunneling)', hit.type === 'player', hit);
}

// 10) dead victim guard + out-of-room guard
{
  players = {
    shooterA: { roomName: 'g', role: 'hunter', alive: true, x: 1500, y: 12, z: 1500 },
    deadGuy:  { roomName: 'g', role: 'prop', alive: false, x: 1510, y: 12, z: 1500, health: 0 },
    otherRoom:{ roomName: 'other', role: 'prop', alive: true, x: 1700, y: 12, z: 1500, health: 100 }
  };
  const hit = castHitscanRay('shooterA', { x: 1500, y: 12, z: 1500 }, normalizeAimVector({ dx: 1, dy: 0, dz: 0 }), 'g', 'prop', false);
  t('guard: skips dead + other-room players', hit.type === 'faded' || hit.type === 'out' || hit.type === 'wall', hit);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
