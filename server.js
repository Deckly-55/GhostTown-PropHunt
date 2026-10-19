const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { MongoClient } = require('mongodb');

// Group 5 — Persistent Database Storage
const MONGO_URI = "mongodb+srv://pasanbandara4_db_user:Pramuditha5002@cluster0.uifezcq.mongodb.net/?appName=Cluster0";
let dbPlayers;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

const WORLD_WIDTH = 9000;
const WORLD_HEIGHT = 9000;
const MAP_SCALE = 2.25;

const DISGUISE_RADIUS = 50;
const PLAYER_RADIUS = 15;
const PLAYER_EYE_LEVEL = 12;  
const MAX_PLAYER_HEIGHT = 400;

// Phase 1 — Hitscan "Teleport" Shooting System.
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
const WALL_HEIGHT = 40;
const GLASS_HEIGHT = 40;
const PROP_HEIGHT = 16;
const TICK_RATE = 33;

const HUNTER_KILL_SCORE = 100;
const PROP_SURVIVAL_SCORE = 10;
const PROP_SURVIVAL_INTERVAL = 10000;
const HUNTER_KILL_COINS = 50;
const PROP_SURVIVAL_COINS = 10;

// Phase 3 — The Persistent Loadout System + Character Skin System
// STORE_ITEMS is now the single source of truth for every item in the game.
// Each entry declares:
//   type    : store category ('skin' | 'primaryGun' | 'secondaryGun' | 'primaryKnife' | 'secondaryKnife')
//   slot    : the loadout slot the item equips into
//   cost    : coin price (0 = default item every account owns permanently)
//   file    : GLB model file for skins (client uses this to load the model)
//   profile : weapon behaviour profile used by damage rules
//             ('primary' | 'secondary' | 'melee' | 'thrown', null for skins)
//   tracer  : hex colour used for the hitscan beam of equipped guns/knives

// --- Character Skin System: Starter definitions ---
const MALE_STARTER_ID = 'Casual_Character';
const FEMALE_STARTER_ID = 'Casual_w';
const STARTER_SKIN_IDS = [MALE_STARTER_ID, FEMALE_STARTER_ID];
const FREE_WEAPON_IDS = ['standardRifle', 'sidearmPistol', 'fieldBlade', 'throwingKnife'];

const STORE_ITEMS = {
  // — Default Starter Skins (free) —
  Casual_Character: { id: 'Casual_Character', name: 'Casual Character', file: 'Casual_Character.glb', cost: 0, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Casual_w:         { id: 'Casual_w',         name: 'Casual Female',    file: 'Casual_w.glb',         cost: 0, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },

  // — Store Catalog: 19 skins ordered by price (ascending) —
  Beach_Character:    { id: 'Beach_Character',    name: 'Beach Character',       file: 'Beach_Character.glb',    cost: 500,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Casual_w2:          { id: 'Casual_w2',          name: 'Casual Female 2',       file: 'Casual_w2.glb',          cost: 500,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Farmer:             { id: 'Farmer',             name: 'Farmer',                file: 'Farmer.glb',             cost: 600,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Hoodie_Character:   { id: 'Hoodie_Character',   name: 'Hoodie Character',      file: 'Hoodie_Character.glb',   cost: 600,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Worker:             { id: 'Worker',             name: 'Worker',                file: 'Worker.glb',             cost: 600,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Worker_w:           { id: 'Worker_w',           name: 'Worker Female',         file: 'Worker_w.glb',           cost: 600,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Adventurer:         { id: 'Adventurer',         name: 'Adventurer',            file: 'Adventurer.glb',         cost: 650,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Business_Man:       { id: 'Business_Man',       name: 'Business Man',          file: 'Business_Man.glb',       cost: 700,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Adventurer_w:       { id: 'Adventurer_w',       name: 'Adventurer Female',     file: 'Adventurer_w.glb',       cost: 750,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Punk:               { id: 'Punk',               name: 'Punk',                  file: 'Punk.glb',               cost: 800,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Suit_w:             { id: 'Suit_w',             name: 'Suit Female',           file: 'Suit_w.glb',             cost: 800,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Medieval_w:         { id: 'Medieval_w',         name: 'Medieval Female',       file: 'Medieval_w.glb',         cost: 850,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Soldier_w:          { id: 'Soldier_w',          name: 'Soldier Female',        file: 'Soldier_w.glb',          cost: 850,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Punk_w:             { id: 'Punk_w',             name: 'Punk Female',           file: 'Punk_w.glb',             cost: 900,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Swat:               { id: 'Swat',               name: 'SWAT',                  file: 'Swat.glb',               cost: 950,  type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  King:               { id: 'King',               name: 'King',                  file: 'King.glb',               cost: 1500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Witch_w:            { id: 'Witch_w',            name: 'Witch Female',          file: 'Witch_w.glb',            cost: 1500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Sci_Fi_Character_w: { id: 'Sci_Fi_Character_w', name: 'Sci-Fi Character Female', file: 'Sci_Fi_Character_w.glb', cost: 2500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Astronaut:          { id: 'Astronaut',          name: 'Astronaut',             file: 'Astronaut.glb',          cost: 3000, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },

  // — Legacy compatibility (old accounts) —
  default:       { id: 'default',       name: 'Standard Uniform',   file: 'Casual_Character.glb', cost: 0,   type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  shadowHunter:  { id: 'shadowHunter',  name: 'Shadow Hunter Skin', file: 'Casual_Character.glb', cost: 500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  steelProp:     { id: 'steelProp',     name: 'Steel Prop Crate',   file: 'Casual_w.glb',         cost: 500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },

  // — Hunter primary weapons (Key 1) —
  standardRifle: { id: 'standardRifle', name: 'Assault Rifle',     cost: 0,    type: 'primaryGun',     slot: 'primaryGun',      profile: 'primary',   tracer: 0xffe27a },
  shotgun:       { id: 'shotgun',       name: 'Combat Shotgun',     cost: 700,  type: 'primaryGun',     slot: 'primaryGun',      profile: 'primary',   tracer: 0xffd08a },
  vulcanRifle:   { id: 'vulcanRifle',   name: 'VK-47 Vulcan',       cost: 800,  type: 'primaryGun',     slot: 'primaryGun',      profile: 'primary',   tracer: 0xff8c42 },
  longshotMk2:   { id: 'longshotMk2',   name: 'Longshot Mk II',     cost: 1200, type: 'primaryGun',     slot: 'primaryGun',      profile: 'primary',   tracer: 0x9fd8ff },

  // — Hunter secondary weapons (Key 2) —
  sidearmPistol: { id: 'sidearmPistol', name: 'Pistol',             cost: 0,    type: 'secondaryGun',   slot: 'secondaryGun',    profile: 'secondary', tracer: 0xffe27a },
  revolver:      { id: 'revolver',      name: 'Revolver',            cost: 700,  type: 'secondaryGun',   slot: 'secondaryGun',    profile: 'secondary', tracer: 0xffc27a },
  viperSMG:      { id: 'viperSMG',      name: 'Viper SMG',          cost: 600,  type: 'secondaryGun',   slot: 'secondaryGun',    profile: 'secondary', tracer: 0xa2ff9f },

  // — Prop knife variants —
  fieldBlade:    { id: 'fieldBlade',    name: 'Field Blade',        cost: 0,    type: 'primaryKnife',   slot: 'primaryKnife',    profile: 'melee',     tracer: null },
  carbonCleaver: { id: 'carbonCleaver', name: 'Carbon Cleaver',     cost: 400,  type: 'primaryKnife',   slot: 'primaryKnife',    profile: 'melee',     tracer: null },
  throwingKnife: { id: 'throwingKnife', name: 'Throwing Knife',     cost: 0,    type: 'secondaryKnife', slot: 'secondaryKnife',  profile: 'thrown',    tracer: 0x9fd8ff },
  phantomDagger: { id: 'phantomDagger', name: 'Phantom Dagger',     cost: 650,  type: 'secondaryKnife', slot: 'secondaryKnife',  profile: 'thrown',    tracer: 0xd8a2ff }
};

// The five persistent loadout slots stored on every player document.
const LOADOUT_SLOTS = ['equippedSkin', 'primaryGun', 'secondaryGun', 'primaryKnife', 'secondaryKnife'];

// The free kit every account starts with (also used to migrate legacy docs).
// Male starter is the fallback default; female starter is also free.
const DEFAULT_LOADOUT = {
  equippedSkin: MALE_STARTER_ID,
  primaryGun: 'standardRifle',
  secondaryGun: 'sidearmPistol',
  primaryKnife: 'fieldBlade',
  secondaryKnife: 'throwingKnife'
};

// The free weapon kit every account owns permanently (see FREE_WEAPON_IDS above).
// The starter skin is NOT included here: it is granted as EXACTLY ONE item
// (based on the player's first-launch gender choice) so a female starter never
// receives the male uniform and vice-versa. See buildDefaultPlayerDoc() and
// normalizeInventory().
const DEFAULT_INVENTORY = FREE_WEAPON_IDS.slice();

// --- Character Skin System helpers ---

function resolveStarterId(input) {
  if (!input) return null;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (STARTER_SKIN_IDS.includes(trimmed)) return trimmed;
    const noExt = trimmed.replace(/\.glb$/i, '');
    if (STARTER_SKIN_IDS.includes(noExt)) return noExt;
    const lower = trimmed.toLowerCase();
    if (lower === 'female' || lower === 'f' || lower === 'woman' || lower === 'w' || lower === 'girl' || lower === 'female_starter') return FEMALE_STARTER_ID;
    if (lower === 'male' || lower === 'm' || lower === 'man' || lower === 'boy' || lower === 'male_starter') return MALE_STARTER_ID;
    if (lower === 'casual_character.glb' || lower === 'casual_character') return MALE_STARTER_ID;
    if (lower === 'casual_w.glb' || lower === 'casual_w' || lower === 'casual_female') return FEMALE_STARTER_ID;
    // If input is a free skin id, treat as starter choice
    if (STORE_ITEMS[trimmed] && STORE_ITEMS[trimmed].type === 'skin' && STORE_ITEMS[trimmed].cost === 0) {
      if (STARTER_SKIN_IDS.includes(STORE_ITEMS[trimmed].id)) return STORE_ITEMS[trimmed].id;
    }
    if (STORE_ITEMS[noExt] && STORE_ITEMS[noExt].type === 'skin' && STORE_ITEMS[noExt].cost === 0) {
      if (STARTER_SKIN_IDS.includes(STORE_ITEMS[noExt].id)) return STORE_ITEMS[noExt].id;
    }
    // Heuristic fallback
    if (lower.includes('female') && !lower.includes('male')) return FEMALE_STARTER_ID;
    if (lower === 'male' || lower.includes('male_starter')) return MALE_STARTER_ID;
    return null;
  }
  if (typeof input === 'object') {
    const candidates = [
      input.starterSkin,
      input.chosenStarter,
      input.starter,
      input.equippedSkin,
      input.skin,
      input.gender,
      input.sex,
      input.characterGender,
      input.playerGender,
      input.chosenGender,
      input.playerGenderChoice,
      input.skinChoice
    ];
    for (const c of candidates) {
      if (c == null) continue;
      const resolved = resolveStarterId(c);
      if (resolved) return resolved;
    }
    return null;
  }
  return null;
}

function getChosenStarterFromData(data) {
  const resolved = resolveStarterId(data);
  return resolved || MALE_STARTER_ID;
}

function itemForId(itemId) {
  return STORE_ITEMS[itemId] || null;
}

// Normalizes an inventory: keeps known item ids, drops junk/dupes and
// guarantees the free weapon kit is present. `source` may be a plain array OR
// a wallet/player/doc object; when it is an object we read the account's chosen
// starter (from loadout.equippedSkin or the top-level equippedSkin mirror) so
// that ONLY that starter is kept and the opposite uniform is stripped — the
// starter is exclusive, never both. `preferredStarter` overrides the lookup.
function normalizeInventory(source, preferredStarter) {
  const arr = Array.isArray(source) ? source : (source && Array.isArray(source.inventory) ? source.inventory : null);
  const set = new Set();
  if (arr) {
    for (const id of arr) {
      if (typeof id !== 'string') continue;
      if (id === 'default') {
        set.add(MALE_STARTER_ID);
        continue;
      }
      if (STORE_ITEMS[id]) set.add(id);
    }
  }
  for (const id of DEFAULT_INVENTORY) set.add(id); // free weapon kit, no starters

  // Resolve the single starter this account owns.
  let keep = preferredStarter;
  if (!keep && source && typeof source === 'object' && !Array.isArray(source)) {
    const eq = (source.loadout && source.loadout.equippedSkin) || source.equippedSkin;
    if (typeof eq === 'string' && STARTER_SKIN_IDS.includes(eq)) keep = eq;
  }
  if (keep && STARTER_SKIN_IDS.includes(keep)) {
    for (const id of STARTER_SKIN_IDS) if (id !== keep) set.delete(id);
    set.add(keep);
  } else if (source && typeof source === 'object' && !Array.isArray(source)) {
    // No explicit starter yet: default to the male starter, stripping female.
    for (const id of STARTER_SKIN_IDS) if (id !== MALE_STARTER_ID) set.delete(id);
    set.add(MALE_STARTER_ID);
  }
  return Array.from(set);
}

// Normalizes a loadout object: every slot must reference an OWNED item or it
// falls back to that slot's default. Legacy docs stored the skin at the top
// level (`equippedSkin`) — `legacyEquippedSkin` migrates it forward.
function normalizeLoadout(loadout, inventory, legacyEquippedSkin) {
  const owned = new Set(inventory || DEFAULT_INVENTORY);
  const source = (loadout && typeof loadout === 'object') ? loadout : {};
  if (!source.equippedSkin && typeof legacyEquippedSkin === 'string') {
    source.equippedSkin = legacyEquippedSkin;
  }
  // Migrate legacy 'default' id
  if (source.equippedSkin === 'default') source.equippedSkin = MALE_STARTER_ID;
  // Default for a slot, falling back to the owned starter for equippedSkin so a
  // player never equips a starter they do not own.
  const fallbackFor = (slot) => {
    if (slot === 'equippedSkin') {
      const ownedStarter = STARTER_SKIN_IDS.find((id) => owned.has(id));
      return ownedStarter || DEFAULT_LOADOUT.equippedSkin;
    }
    return DEFAULT_LOADOUT[slot];
  };
  const normalized = {};
  for (const slot of LOADOUT_SLOTS) {
    const wanted = typeof source[slot] === 'string' ? source[slot] : fallbackFor(slot);
    const finalWanted = wanted === 'default' ? MALE_STARTER_ID : wanted;
    normalized[slot] = (STORE_ITEMS[finalWanted] && owned.has(finalWanted)) ? finalWanted : fallbackFor(slot);
  }
  // Ensure equippedSkin always has a valid starter fallback
  if (!STORE_ITEMS[normalized.equippedSkin]) {
    normalized.equippedSkin = MALE_STARTER_ID;
  }
  return normalized;
}

// Parses a raw Mongo player document into the canonical wallet shape used
// everywhere else (in-memory wallet, live player object, socket payloads).
function parseWalletDoc(doc) {
  const inventory = normalizeInventory(doc); // doc object → derives the single owned starter
  const loadout = normalizeLoadout(doc && doc.loadout, inventory, doc && doc.equippedSkin);
  return {
    coins: (doc && typeof doc.coins === 'number') ? doc.coins : 0,
    inventory,
    loadout,
    // Top-level mirror kept in the document for older clients / tools:
    equippedSkin: loadout.equippedSkin,
    isRegistered: !!(doc && doc.isRegistered),
    username: (doc && doc.username) || null
  };
}

// The document shape created for brand-new accounts.
// chosenStarterInput can be gender string, skin id, or object containing gender.
function buildDefaultPlayerDoc(playerId, chosenStarterInput) {
  const chosenId = resolveStarterId(chosenStarterInput) || MALE_STARTER_ID;
  const inventorySet = new Set([...DEFAULT_INVENTORY, chosenId]);
  // Ensure chosen starter is definitely included
  inventorySet.add(chosenId);
  const loadout = {
    equippedSkin: chosenId,
    primaryGun: DEFAULT_LOADOUT.primaryGun,
    secondaryGun: DEFAULT_LOADOUT.secondaryGun,
    primaryKnife: DEFAULT_LOADOUT.primaryKnife,
    secondaryKnife: DEFAULT_LOADOUT.secondaryKnife
  };
  return {
    _id: playerId,
    coins: 0,
    inventory: Array.from(inventorySet),
    loadout,
    equippedSkin: chosenId,
    isRegistered: false,
    username: null
  };
}

// Ensures the player document exists before an atomic wallet update runs
// (the conditional updates below deliberately do NOT upsert, so a missing
// document would otherwise silently fail the purchase).
async function ensurePlayerDoc(playerId, chosenStarterInput) {
  if (!dbPlayers || !playerId) return;
  const chosenId = resolveStarterId(chosenStarterInput) || MALE_STARTER_ID;
  const defaultDoc = buildDefaultPlayerDoc(playerId, chosenId);
  await dbPlayers.updateOne(
    { _id: playerId },
    { $setOnInsert: defaultDoc },
    { upsert: true }
  );
}

// Writes a normalized wallet back to the database (lazy schema migration).
function persistNormalizedWallet(playerId, parsed) {
  if (!dbPlayers || !playerId || !parsed) return Promise.resolve();
  return dbPlayers.updateOne(
    { _id: playerId },
    {
      $set: {
        coins: parsed.coins,
        inventory: parsed.inventory,
        loadout: parsed.loadout,
        equippedSkin: parsed.equippedSkin
      }
    },
    { upsert: true }
  );
}

function guestDisplayName(playerId) {
  const id = String(playerId || '????');
  return 'Guest_' + id.slice(-4);
}

function accountDisplayName(docOrPlayer, playerId) {
  if (docOrPlayer && docOrPlayer.isRegistered && docOrPlayer.username) {
    return String(docOrPlayer.username);
  }
  return guestDisplayName(playerId || (docOrPlayer && docOrPlayer.playerId) || '');
}

function emitWallet(socket, player) {
  if (!socket || !player) return;
  const inventory = normalizeInventory(player); // player object → keeps a single starter
  const loadout = normalizeLoadout(player.loadout, inventory, player.equippedSkin);
  socket.emit('walletUpdate', {
    coins: player.coins || 0,
    inventory,
    loadout,
    // Mirror of loadout.equippedSkin for legacy client logic:
    equippedSkin: loadout.equippedSkin,
    isRegistered: !!player.isRegistered,
    username: player.username || null,
    displayName: player.displayName || accountDisplayName(player, player.playerId)
  });
}
const LEADERBOARD_SIZE = 10;
const RADAR_RANGE = 2100;

const ZONE_DEFINITIONS = {
  oldCityCenter: { id: 'oldCityCenter', name: 'The Old City Center', minX: 0, maxX: 3000, minZ: 0, maxZ: 3000 },
  historicRuralEdge: { id: 'historicRuralEdge', name: 'The Historic & Rural Edge', minX: 0, maxX: 3000, minZ: 3000, maxZ: 7000 },
  industrialWorkingDistrict: { id: 'industrialWorkingDistrict', name: 'The Industrial Working District', minX: 3000, maxX: 6000, minZ: 0, maxZ: 3000 },
  miningForgeHub: { id: 'miningForgeHub', name: 'The Mining & Forge Hub', minX: 6000, maxX: 9000, minZ: 0, maxZ: 7000 },
  massiveTransitCorridor: { id: 'massiveTransitCorridor', name: 'The Massive Transit Corridor', minX: 3000, maxX: 6000, minZ: 3000, maxZ: 7000 },
  giantSouthernBorder: { id: 'giantSouthernBorder', name: 'The Giant Southern Border', minX: 0, maxX: 9000, minZ: 7000, maxZ: 9000 }
};
const ZONES = Object.values(ZONE_DEFINITIONS);
function zoneForPoint(x, z) { return ZONES.find(zone => x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) || ZONE_DEFINITIONS.oldCityCenter; }

const privateRooms = new Map(); 
const roomStates = new Map(); 

const LOBBY_AREA = { id: 'stagingLobby', name: 'Staging Ground', minX: 49800, maxX: 50200, minZ: 49800, maxZ: 50200 };
const GLOBAL_LOBBY_SECONDS = 15;
const INTERMISSION_SECONDS = 10;
const PRIVATE_TIME_LIMIT_OPTIONS = [180, 300, 600, 1200]; 
const GLOBAL_TIME_LIMIT_OPTIONS = [300, 600, 1200];       
const DEFAULT_PRIVATE_TIME_LIMIT = 300;

function getRoomState(roomName) {
  return roomStates.get(roomName) || null;
}

function randomGlobalTimeLimit() {
  return GLOBAL_TIME_LIMIT_OPTIONS[Math.floor(Math.random() * GLOBAL_TIME_LIMIT_OPTIONS.length)];
}

function getOrCreateRoomState(roomName, zone, requestedTimeLimit, hostId) {
  if (roomStates.has(roomName)) return roomStates.get(roomName);

  const isPrivate = roomName.startsWith('private_');
  const durationSec = isPrivate
    ? (PRIVATE_TIME_LIMIT_OPTIONS.includes(requestedTimeLimit)
      ? requestedTimeLimit
      : DEFAULT_PRIVATE_TIME_LIMIT)
    : randomGlobalTimeLimit();

  const rs = {
    state: 'waiting',
    timeLeft: isPrivate ? durationSec : GLOBAL_LOBBY_SECONDS,
    timeLimit: durationSec,
    originalDuration: durationSec,
    zoneId: zone.id,
    hostId: isPrivate ? hostId : null,
    resetTimeout: null,
    intermissionSeconds: INTERMISSION_SECONDS
  };
  roomStates.set(roomName, rs);
  return rs;
}

function roomPlayerCount(roomName) { return Object.values(players).filter(p => p.roomName === roomName).length; }
function lobbySpawn(index = 0) {
  const margin = 35;
  const spacing = 42;
  const columns = Math.max(1, Math.floor((LOBBY_AREA.maxX - LOBBY_AREA.minX - margin * 2) / spacing) + 1);
  const rows = Math.max(1, Math.floor((LOBBY_AREA.maxZ - LOBBY_AREA.minZ - margin * 2) / spacing) + 1);
  const slot = index % (columns * rows);
  return {
    x: LOBBY_AREA.minX + margin + (slot % columns) * spacing,
    z: LOBBY_AREA.minZ + margin + Math.floor(slot / columns) * spacing
  };
}
function movePlayerToLobby(player, index) {
  const spawn = lobbySpawn(index); player.x = spawn.x; player.z = spawn.z; player.y = PLAYER_EYE_LEVEL;
  player.role = 'waiting'; player.alive = true; player.isProp = false; player.propId = null;
  player.health = PROP_MAX_HEALTH; player.npcStrikes = 0; player.disguiseBrokenAt = 0;
}

function shufflePlayers(roomPlayers) {
  const shuffled = roomPlayers.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRequiredHunterCount(playerCount) {
  if (playerCount <= 0) return 0;
  return Math.ceil(playerCount / 4);
}

function startRoom(roomName) {
  const rs = roomStates.get(roomName);
  if (!rs || rs.state !== 'waiting') return;

  const roomPlayers = Object.values(players).filter(player => player.roomName === roomName);
  if (roomName.startsWith('global_') && roomPlayers.length < 2) return;
  if (roomPlayers.length === 0) return;

  const zone = ZONE_DEFINITIONS[rs.zoneId] || ZONE_DEFINITIONS.oldCityCenter;
  const shuffled = shufflePlayers(roomPlayers);
  const hunterCount = getRequiredHunterCount(shuffled.length);
  const occupiedSpawns = [];

  shuffled.forEach((player, index) => {
    player.role = index < hunterCount ? 'hunter' : 'prop';
    player.alive = true;
    player.isProp = false;
    player.propId = null;
    player.health = player.role === 'hunter' ? HUNTER_MAX_HEALTH : PROP_MAX_HEALTH;
    player.npcStrikes = 0;
    player.disguiseBrokenAt = 0;

    const spawn = randomSpawnPoint(zone, occupiedSpawns);
    occupiedSpawns.push(spawn);
    player.x = spawn.x;
    player.z = spawn.z;
    player.y = PLAYER_EYE_LEVEL;
  });

  // Phase 1: hitscan shots resolve instantly, so there are no in-flight
  // bullets left to purge when a match starts.
  rs.timeLeft = rs.timeLimit;
  rs.originalDuration = rs.timeLimit;
  rs.state = 'playing';

  io.to(roomName).emit('matchStarted', {
    players: getRoomPlayers(roomName),
    zone,
    timeLeft: rs.timeLeft,
    timeLimit: rs.timeLimit,
    originalDuration: rs.originalDuration,
    state: rs.state
  });
  io.to(roomName).emit('stateUpdate', buildStateUpdatePayload(roomName)); broadcastLeaderboard(roomName); broadcastTimeUpdate(roomName); sendRadarAfterStateChange();
}

function broadcastTimeUpdate(roomName) {
  const rs = roomStates.get(roomName);
  if (!rs) return;
  io.to(roomName).emit('timeUpdate', {
    timeLeft: rs.timeLeft,
    timeLimit: rs.timeLimit,
    originalDuration: rs.originalDuration,
    state: rs.state,
    intermissionSeconds: rs.intermissionSeconds || INTERMISSION_SECONDS
  });
}

function handleMatchEnd(roomName, winningTeam) {
  const rs = roomStates.get(roomName);
  if (!rs || rs.state === 'ended') return;
  rs.state = 'ended';
  
  if (rs.resetTimeout) { clearTimeout(rs.resetTimeout); rs.resetTimeout = null; }
  const leaderboard = getLeaderboard(roomName);
  io.to(roomName).emit('matchOver', { winner: winningTeam, leaderboard, intermissionSeconds: INTERMISSION_SECONDS });

  rs.resetTimeout = setTimeout(() => {
    resetRoom(roomName);
  }, INTERMISSION_SECONDS * 1000);
}

function checkWinConditions(roomName) {
  const rs = roomStates.get(roomName);
  if (!rs || rs.state !== 'playing') return;
  const roomPlayers = Object.values(players).filter(pl => pl.roomName === roomName);
  const aliveProps = roomPlayers.filter(pl => pl.role === 'prop' && pl.alive);
  const totalProps = roomPlayers.filter(pl => pl.role === 'prop');
  if (totalProps.length > 0 && aliveProps.length === 0) {
    handleMatchEnd(roomName, 'HUNTERS');
    return;
  }
}

function resetRoom(roomName) {
  const rs = roomStates.get(roomName);
  if (!rs) return;
  const zone = ZONE_DEFINITIONS[rs.zoneId] || ZONE_DEFINITIONS.oldCityCenter;
  let lobbyIndex = 0;
  for (const player of Object.values(players)) {
    if (player.roomName === roomName) movePlayerToLobby(player, lobbyIndex++);
  }
  if (roomName.startsWith('global_')) {
    rs.timeLimit = randomGlobalTimeLimit();
    rs.originalDuration = rs.timeLimit;
  }
  rs.timeLeft = roomName.startsWith('private_') ? rs.timeLimit : GLOBAL_LOBBY_SECONDS;
  rs.state = 'waiting';
  rs.resetTimeout = null;
  rs.intermissionSeconds = INTERMISSION_SECONDS;

  io.to(roomName).emit('matchStarted', {
    players: getRoomPlayers(roomName),
    zone,
    timeLeft: rs.timeLeft,
    timeLimit: rs.timeLimit,
    originalDuration: rs.originalDuration,
    state: rs.state
  });
  io.to(roomName).emit('stateUpdate', buildStateUpdatePayload(roomName));
  broadcastLeaderboard(roomName);
  broadcastTimeUpdate(roomName);
  sendRadarAfterStateChange();
}

setInterval(function tickRoomTimers() {
  for (const [roomName, rs] of roomStates.entries()) {
    if (rs.state === 'waiting') {
      if (roomName.startsWith('private_')) continue;
      if (roomPlayerCount(roomName) < 2) {
        broadcastTimeUpdate(roomName);
        continue;
      }
      rs.timeLeft = Math.max(0, rs.timeLeft - 1);
      broadcastTimeUpdate(roomName);
      if (rs.timeLeft === 0) startRoom(roomName);
      continue;
    }
    if (rs.state !== 'playing') continue;
    rs.timeLeft -= 1;
    if (rs.timeLeft <= 0) {
      rs.timeLeft = 0; broadcastTimeUpdate(roomName);
      const aliveProps = Object.values(players).filter(pl => pl.roomName === roomName && pl.role === 'prop' && pl.alive);
      handleMatchEnd(roomName, aliveProps.length ? 'PROPS' : 'HUNTERS');
    } else broadcastTimeUpdate(roomName);
  }
}, 1000);

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;

function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (privateRooms.has(code)); 
  return code;
}

// --- Network-safe player serialization ---
// Guarantees that EVERY player object sent over the socket carries a valid
// `equippedSkin` (and a `loadout` object whose `equippedSkin` is always a
// non-empty string). Older join paths / partially-initialized players could
// previously reach clients with `loadout` or `equippedSkin` missing, which
// crashed client code reading skin data (`.toLowerCase()` on undefined) and
// left the freshly joined player invisible.
const DEFAULT_SKIN_ID = (typeof DEFAULT_LOADOUT === 'object' && DEFAULT_LOADOUT && DEFAULT_LOADOUT.equippedSkin)
  ? DEFAULT_LOADOUT.equippedSkin
  : MALE_STARTER_ID;

function safeEquippedSkinId(player) {
  const fromLoadout = (player && player.loadout && typeof player.loadout === 'object')
    ? player.loadout.equippedSkin
    : undefined;
  const resolved = (typeof fromLoadout === 'string' && fromLoadout)
    ? fromLoadout
    : (typeof (player && player.equippedSkin) === 'string' && player.equippedSkin)
      ? player.equippedSkin
      : DEFAULT_SKIN_ID;
  return resolved;
}

function publicPlayerPayload(player) {
  if (!player) return player;
  // Shallow copy so mutating the wire packet never touches the live player.
  const packet = Object.assign({}, player);
  const equippedSkin = safeEquippedSkinId(player);
  packet.loadout = Object.assign(
    {},
    (player.loadout && typeof player.loadout === 'object') ? player.loadout : DEFAULT_LOADOUT,
    { equippedSkin }
  );
  // Top-level mirror so legacy client logic can always read it directly.
  packet.equippedSkin = equippedSkin;
  return packet;
}

function getRoomPlayers(roomName) {
  const roomPlayers = {};
  for (const [id, player] of Object.entries(players)) {
    if (player.roomName === roomName) roomPlayers[id] = publicPlayerPayload(player);
  }
  return roomPlayers;
}

function serializeNPC(npc) {
  if (!npc) return null;
  return {
    id: npc.id,
    x: npc.x,
    y: npc.y,
    z: npc.z,
    speed: npc.speed,
    state: npc.state,
    targetId: npc.targetId,
    currentWaypoint: npc.currentWaypoint,
    waypoints: Array.isArray(npc.waypoints) ? npc.waypoints.map(wp => ({ x: wp.x, z: wp.z })) : [],
    health: npc.health,
    hitsTaken: npc.hitsTaken,
    maxHits: npc.maxHits,
    isLeashing: npc.isLeashing,
    lastAttackAt: npc.lastAttackAt,
    roomName: npcRooms.get(npc.id) || null
  };
}

function serializeNPCs() {
  const snapshot = {};
  for (const [id, npc] of Object.entries(npcs)) {
    snapshot[id] = serializeNPC(npc);
  }
  return snapshot;
}

function buildStateUpdatePayload(roomName) {
  return { players: getRoomPlayers(roomName), npcs: serializeNPCs(), lootDrops };
}

function zoneForRoomName(roomName) {
  if (!roomName) return ZONE_DEFINITIONS.oldCityCenter;
  if (roomName.startsWith('global_')) {
    return ZONE_DEFINITIONS[roomName.slice('global_'.length)] || ZONE_DEFINITIONS.oldCityCenter;
  }
  const code = roomName.startsWith('private_') ? roomName.slice('private_'.length) : roomName;
  const room = privateRooms.get(code);
  return (room && ZONE_DEFINITIONS[room.zoneId]) || ZONE_DEFINITIONS.oldCityCenter;
}

function reassignHostIfNeeded(roomName, departingSocketId) {
  if (!roomName || !roomName.startsWith('private_')) return false;
  const rs = roomStates.get(roomName);
  if (!rs || rs.hostId !== departingSocketId) return false;

  const remaining = Object.keys(players).filter(id => players[id].roomName === roomName);
  if (remaining.length === 0) {
    rs.hostId = null;
    return false;
  }

  const newHostId = remaining[0];
  rs.hostId = newHostId;
  if (players[newHostId]) players[newHostId].isHost = true;
  io.to(roomName).emit('hostChanged', { hostId: newHostId });
  return true;
}

function cleanupEmptyRoom(roomName) {
  const adapterRoom = io.sockets.adapter.rooms.get(roomName);
  if (adapterRoom && adapterRoom.size > 0) return; 
  for (const [code, room] of privateRooms) {
    if (room.roomName === roomName) {
      privateRooms.delete(code);
      break;
    }
  }
  const rs = roomStates.get(roomName);
  if (rs) {
    if (rs.resetTimeout) clearTimeout(rs.resetTimeout);
    roomStates.delete(roomName);
  }
}

const PROP_MAX_HEALTH = 100;
const BULLET_DAMAGE = 35;
const HUNTER_MAX_HEALTH = 100;
const MELEE_RANGE = 50;
const MELEE_DAMAGE = 50;

const WEAPON_PROFILES = {
  primary:   { name: 'Primary',   damage: 25, ammo: 5,  fireRateMs: 800 },
  secondary: { name: 'Secondary', damage: 12.5, ammo: 12, fireRateMs: 150 }
};

function getBulletDamage(weaponType) {
  return (WEAPON_PROFILES[weaponType] && WEAPON_PROFILES[weaponType].damage) || BULLET_DAMAGE;
}

const NPC_MAX_HITS = 8;               
const NPC_MAX_STRIKES = 6;            
const NPC_STRIKE_DAMAGE = 17;         
const NPC_ATTACK_COOLDOWN_MS = 1000;  
const NPC_ATTACK_RANGE = PLAYER_RADIUS + 15;  
const NPC_AGGRO_RADIUS = 300;         
const NPC_AGGRO_DROP_RADIUS = 360;    
const NPC_LEASH_RADIUS = 400;         
const NPC_CHASE_SPEED_MULT = 1.5;     
const NPC_RESPAWN_MS = 10000;         
const NPC_LOOT_VALUE = 25;            
const NPC_KILL_SCORE = 50;            
const GHOUL_MELEE_RADIUS = 45;        // melee cylinder around the 12x scaled ghoul (horizontal)
const GHOUL_MELEE_HEIGHT = 60;        // melee cylinder around the 12x scaled ghoul (vertical)
const GHOUL_MELEE_KILL_COINS = 25;    // coins paid when a prop's melee finishes a ghoul (score: 0)

const NPC_DEFINITIONS = {
  merchant1: {
    id: 'merchant1',
    type: 'ghoul',
    speed: 6,
    waypoints: [{ x: 2645, z: 2537 }, { x: 2645, z: 2800 }],
    startWaypoint: 1
  }
};

function createNPC(def) {
  const speed = typeof def.speed === 'number' ? def.speed : 6;
  return {
    id: def.id,
    type: def.type || 'ghoul',
    x: def.waypoints[0].x,
    y: 0,
    z: def.waypoints[0].z,
    speed,
    waypoints: (def.waypoints || []).map(wp => ({ x: wp.x, z: wp.z })),
    currentWaypoint: typeof def.startWaypoint === 'number' ? def.startWaypoint : 1,
    maxHits: NPC_MAX_HITS,
    hitsTaken: 0,
    health: 100,
    state: 'patrolling',       
    targetId: null,            
    lastAttackAt: 0,           
    isLeashing: false          
  };
}

let npcs = {};
for (const def of Object.values(NPC_DEFINITIONS)) {
  npcs[def.id] = createNPC(def);
}

const npcRecoveryTimers = new Map();
const npcRooms = new Map();

function clearNPCRecoveryTimer(npcId) {
  if (npcRecoveryTimers.has(npcId)) {
    clearTimeout(npcRecoveryTimers.get(npcId));
    npcRecoveryTimers.delete(npcId);
  }
}

function scheduleNPCRecovery(npcId, fn, delayMs) {
  clearNPCRecoveryTimer(npcId);
  npcRecoveryTimers.set(npcId, setTimeout(() => {
    npcRecoveryTimers.delete(npcId);
    fn();
  }, delayMs));
}

const npcRespawnTimers = new Map();

function syncNPCHealthFromHits(npc) {
  const max = npc.maxHits || NPC_MAX_HITS;
  npc.health = Math.max(0, Math.round((1 - npc.hitsTaken / max) * 100));
}

function registerNPCHit(npc) {
  if (typeof npc.hitsTaken !== 'number') npc.hitsTaken = 0;
  if (typeof npc.maxHits !== 'number') npc.maxHits = NPC_MAX_HITS;
  npc.hitsTaken += 1;
  syncNPCHealthFromHits(npc);
  return npc.hitsTaken >= npc.maxHits;
}

function killNPC(npcId, npc, roomName, killerId, options = {}) {
  // options.scoreAward overrides the default NPC_KILL_SCORE payout: a prop's
  // melee kill on a ghoul pays 0 score (coins only), shots/knives still pay full.
  const scoreAward = typeof options.scoreAward === 'number' ? options.scoreAward : NPC_KILL_SCORE;
  const killer = killerId ? players[killerId] : null;
  if (killer && scoreAward > 0) {
    killer.score = (killer.score || 0) + scoreAward;
  }

  const engagedRoom = roomName || npcRooms.get(npcId) || null;
  const lId = 'loot_' + lootIdCounter++;
  lootDrops[lId] = { id: lId, x: npc.x, y: 12, z: npc.z, value: NPC_LOOT_VALUE, roomName: engagedRoom };

  if (engagedRoom) {
    io.to(engagedRoom).emit('npcDied', { npcId: npc.id, x: npc.x, z: npc.z, killerId: killerId || null });
  }

  delete npcs[npcId];
  clearNPCRecoveryTimer(npcId);
  npcRooms.delete(npcId);

  const def = NPC_DEFINITIONS[npcId] || { id: npcId, speed: npc.speed, waypoints: npc.waypoints, startWaypoint: 1 };
  if (npcRespawnTimers.has(npcId)) clearTimeout(npcRespawnTimers.get(npcId));
  npcRespawnTimers.set(npcId, setTimeout(() => {
    npcRespawnTimers.delete(npcId);
    npcs[npcId] = createNPC(def);
  }, NPC_RESPAWN_MS));
}

const players = {};
const wallets = {}; 
let lootDrops = {};
let lootIdCounter = 0;

function defaultWallet() {
  // Free weapon kit + the male starter fallback (exactly one starter).
  const inventory = normalizeInventory(null, MALE_STARTER_ID);
  return {
    coins: 0,
    inventory,
    loadout: Object.assign({}, DEFAULT_LOADOUT),
    equippedSkin: DEFAULT_LOADOUT.equippedSkin
  };
}

function getWallet(socketId) {
  if (!wallets[socketId]) wallets[socketId] = defaultWallet();
  return wallets[socketId];
}

function applyWalletToPlayer(player, socketId) {
  const w = getWallet(socketId);
  player.coins = w.coins;
  player.inventory = normalizeInventory(w); // wallet object → keeps a single starter
  // Phase 3: the full five-slot loadout travels with the player object, so
  // every spawn (join, match start, respawn) automatically materialises the
  // player's equipped skin + weapon models.
  player.loadout = normalizeLoadout(w.loadout, player.inventory);
  player.equippedSkin = player.loadout.equippedSkin; // legacy mirror for old client code
  player.isRegistered = w.isRegistered || false;
  player.username = w.username || null;
  player.displayName = player.isRegistered ? player.username : guestDisplayName(player.playerId);
}

function syncWalletFromPlayer(player, socketId) {
  const inventory = normalizeInventory(player); // player object → keeps a single starter
  const loadout = normalizeLoadout(player.loadout, inventory, player.equippedSkin);
  wallets[socketId] = {
    coins: player.coins || 0,
    inventory,
    loadout,
    equippedSkin: loadout.equippedSkin,
    isRegistered: player.isRegistered || false,
    username: player.username || null,
    displayName: player.displayName || guestDisplayName(player.playerId)
  };
}

// Snapshot of a wallet-ish object (live player OR in-memory wallet) in the
// shape the client expects for buyResult / equipResult payloads.
function walletPayloadFields(target) {
  const inventory = normalizeInventory(target); // target object → keeps a single starter
  const loadout = normalizeLoadout(target && target.loadout, inventory, target && target.equippedSkin);
  return {
    coins: (target && target.coins) || 0,
    inventory,
    loadout,
    equippedSkin: loadout.equippedSkin
  };
}

// Applies a freshly-read parsed wallet onto a live target (player or wallet).
function applyParsedWallet(target, parsed) {
  target.coins = parsed.coins;
  target.inventory = parsed.inventory.slice();
  target.loadout = Object.assign({}, parsed.loadout);
  target.equippedSkin = parsed.loadout.equippedSkin;
}

const PROP_COLORS = ['#8B5A2B', '#6b7280', '#a0522d', '#5b7553', '#7a5c3e'];
const PROP_COUNT = 0;
const PROP_MIN_SIZE = 30;
const PROP_MAX_SIZE = 60;
const PROP_EDGE_PADDING = 200;

function generateProps(zone = ZONE_DEFINITIONS.oldCityCenter) {
  const generated = [];
  for (let i = 0; i < PROP_COUNT; i++) {
    const width = PROP_MIN_SIZE + Math.random() * (PROP_MAX_SIZE - PROP_MIN_SIZE);
    const height = PROP_MIN_SIZE + Math.random() * (PROP_MAX_SIZE - PROP_MIN_SIZE);
    let x, y;
    let attempts = 0;
    const maxAttempts = 50;
    do {
      x = zone.minX + PROP_EDGE_PADDING + Math.random() * Math.max(1, zone.maxX - zone.minX - PROP_EDGE_PADDING * 2 - width);
      y = zone.minZ + PROP_EDGE_PADDING + Math.random() * Math.max(1, zone.maxZ - zone.minZ - PROP_EDGE_PADDING * 2 - height);
      attempts++;
    } while (attempts < maxAttempts && map.some(obj =>
      x < obj.x + obj.width + 20 &&
      x + width + 20 > obj.x &&
      y < obj.y + obj.height + 20 &&
      y + height + 20 > obj.y
    ));

    generated.push({
      id: `prop${i + 1}`,
      x,
      y,
      width,
      height,
      color: PROP_COLORS[Math.floor(Math.random() * PROP_COLORS.length)]
    });
  }
  return generated;
}

const BASE_LAYOUT = [
  { x: 1000, y: 1000, width: 1, height: 1, type: 'model', modelPath: 'oldCityCenterMap.glb' }
];

const map = [];
map.push(...BASE_LAYOUT.filter((obj) => obj.type !== 'model'));

function checkCollision(x, y, radius, objects) {
  for (const obj of objects) {
    const closestX = Math.max(obj.x, Math.min(x, obj.x + obj.width));
    const closestY = Math.max(obj.y, Math.min(y, obj.y + obj.height));
    const distanceX = x - closestX;
    const distanceY = y - closestY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;
    if (distanceSquared < radius * radius) {
      return true;
    }
  }
  return false;
}

function getValidSpawnPosition(zone = ZONE_DEFINITIONS.oldCityCenter, occupied = []) {
  const edgePadding = Math.min(150, Math.max(PLAYER_RADIUS + 5, (zone.maxX - zone.minX) / 4));
  const minX = zone.minX + edgePadding;
  const maxX = zone.maxX - edgePadding;
  const minZ = zone.minZ + edgePadding;
  const maxZ = zone.maxZ - edgePadding;
  const spawnRadius = PLAYER_RADIUS + 10;
  const minPlayerSeparation = PLAYER_RADIUS * 3;

  const isValid = (x, z, enforceSeparation = true) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (x < zone.minX + PLAYER_RADIUS || x > zone.maxX - PLAYER_RADIUS) return false;
    if (z < zone.minZ + PLAYER_RADIUS || z > zone.maxZ - PLAYER_RADIUS) return false;
    if (checkCollision(x, z, spawnRadius, map)) return false;
    if (enforceSeparation && occupied.some(point => Math.hypot(point.x - x, point.z - z) < minPlayerSeparation)) return false;
    return true;
  };

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = minX + Math.random() * Math.max(1, maxX - minX);
    const z = minZ + Math.random() * Math.max(1, maxZ - minZ);
    if (isValid(x, z)) return { x, z };
  }

  const step = Math.max(PLAYER_RADIUS * 2 + 10, 40);
  for (let z = zone.minZ + edgePadding; z <= zone.maxZ - edgePadding; z += step) {
    for (let x = zone.minX + edgePadding; x <= zone.maxX - edgePadding; x += step) {
      if (isValid(x, z)) return { x, z };
    }
  }

  for (let z = zone.minZ + PLAYER_RADIUS + 5; z <= zone.maxZ - PLAYER_RADIUS - 5; z += step) {
    for (let x = zone.minX + PLAYER_RADIUS + 5; x <= zone.maxX - PLAYER_RADIUS - 5; x += step) {
      if (isValid(x, z, false)) return { x, z };
    }
  }

  return {
    x: Math.max(zone.minX + PLAYER_RADIUS, Math.min(zone.maxX - PLAYER_RADIUS, (zone.minX + zone.maxX) / 2)),
    z: Math.max(zone.minZ + PLAYER_RADIUS, Math.min(zone.maxZ - PLAYER_RADIUS, (zone.minZ + zone.maxZ) / 2))
  };
}

function constrainPosition(x, z, objects, zone = ZONE_DEFINITIONS.oldCityCenter) {
  const minX = zone.minX + PLAYER_RADIUS;
  const maxX = zone.maxX - PLAYER_RADIUS;
  const minZ = zone.minZ + PLAYER_RADIUS;
  const maxZ = zone.maxZ - PLAYER_RADIUS;

  let newX = Math.max(minX, Math.min(maxX, x));
  let newZ = Math.max(minZ, Math.min(maxZ, z));

  for (const obj of objects) {
    const left = obj.x;
    const right = obj.x + obj.width;
    const top = obj.y;
    const bottom = obj.y + obj.height;

    if (newX > left && newX < right && newZ > top && newZ < bottom) {
      const distLeft = newX - left;
      const distRight = right - newX;
      const distTop = newZ - top;
      const distBottom = bottom - newZ;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      if (minDist === distLeft) newX = left - PLAYER_RADIUS;
      else if (minDist === distRight) newX = right + PLAYER_RADIUS;
      else if (minDist === distTop) newZ = top - PLAYER_RADIUS;
      else newZ = bottom + PLAYER_RADIUS;

      continue;
    }

    const closestX = Math.max(left, Math.min(newX, right));
    const closestZ = Math.max(top, Math.min(newZ, bottom));
    const distanceX = newX - closestX;
    const distanceZ = newZ - closestZ;
    const distanceSquared = distanceX * distanceX + distanceZ * distanceZ;

    if (distanceSquared < PLAYER_RADIUS * PLAYER_RADIUS) {
      const distance = Math.sqrt(distanceSquared) || 0.001;
      const overlap = PLAYER_RADIUS - distance;

      if (distance < PLAYER_RADIUS) {
        newX += (distanceX / distance) * overlap;
        newZ += (distanceZ / distance) * overlap;
      }
    }
  }

  newX = Math.max(minX, Math.min(maxX, newX));
  newZ = Math.max(minZ, Math.min(maxZ, newZ));

  return { x: newX, z: newZ };
}

const propsByZone = {};
function getPropsForZone(zoneId) {
  if (!propsByZone[zoneId]) {
    propsByZone[zoneId] = generateProps(ZONE_DEFINITIONS[zoneId]);
  }
  return propsByZone[zoneId];
}

function randomSpawnPoint(zone = ZONE_DEFINITIONS.oldCityCenter, occupied = []) {
  return getValidSpawnPosition(zone, occupied);
}

function getLeaderboard(roomName) {
  return Object.entries(players)
    .filter(([, player]) => player.roomName === roomName) 
    .map(([id, player]) => ({
      id,
      name: player.displayName || accountDisplayName(player, player.playerId),
      displayName: player.displayName || accountDisplayName(player, player.playerId),
      score: player.score || 0,
      role: player.role,
      alive: player.alive
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_SIZE);
}

function broadcastLeaderboard(roomName) {
  io.to(roomName).emit('leaderboardUpdate', getLeaderboard(roomName));
}

function isWithinRadarRange(observer, target) {
  return Boolean(
    observer &&
    target &&
    target.alive &&
    Math.hypot(observer.x - target.x, observer.z - target.z) <= RADAR_RANGE
  );
}

function buildRadarData(observerId) {
  const observer = players[observerId];
  if (!observer || !observer.alive) {
    return { realtime: [] };
  }

  const realtime = [];
  for (const [id, target] of Object.entries(players)) {
    if (id === observerId) continue;
    if (!target.alive) continue;
    if (target.roomName !== observer.roomName) continue;
    if (!isWithinRadarRange(observer, target)) continue;

    if (observer.role === 'hunter') {
      if (target.role === 'hunter') {
        realtime.push({ id, x: target.x, y: target.z, type: 'teammate' });
      }
      if (target.role === 'prop' && !target.isProp) {
        realtime.push({ id, x: target.x, y: target.z, type: 'enemy' });
      }
    }
    if (observer.role === 'prop') {
      if (target.role === 'hunter') {
        realtime.push({ id, x: target.x, y: target.z, type: 'enemy' });
      }
      if (target.role === 'prop') {
        realtime.push({ id, x: target.x, y: target.z, type: 'friendly' });
      }
    }
  }
  return { realtime };
}

function emitRadarData(socket) {
  if (!players[socket.id]) return;
  socket.emit('radarData', buildRadarData(socket.id));
}

function broadcastRealtimeRadar() {
  for (const socket of io.sockets.sockets.values()) {
    emitRadarData(socket);
  }
}

function sendRadarAfterStateChange() {
  broadcastRealtimeRadar();
}

function getLateJoinerRole(roomName) {
  const roomPlayers = Object.values(players).filter(p => p.roomName === roomName);
  const totalPlayers = roomPlayers.length + 1; 
  const requiredHunters = getRequiredHunterCount(totalPlayers);
  const currentAliveHunters = roomPlayers.filter(p => p.role === 'hunter' && p.alive).length;
  if (currentAliveHunters < requiredHunters) {
    return 'hunter';
  }
  return 'prop';
}

io.on('connection', (socket) => {
  emitWallet(socket, getWallet(socket.id));
  
  socket.on('requestWallet', async (playerId) => {
    if (!playerId) return;
    try {
      let walletData;
      if (dbPlayers) {
        let doc = await dbPlayers.findOne({ _id: playerId });
        if (!doc) {
          await dbPlayers.insertOne(buildDefaultPlayerDoc(playerId)).catch(() => {});
          doc = buildDefaultPlayerDoc(playerId);
        }
        walletData = parseWalletDoc(doc);
        // Lazy migration: legacy docs (coins + inventory + top-level
        // equippedSkin) are upgraded to the full loadout schema on first read.
        if (!doc.loadout || !Array.isArray(doc.inventory) || doc.inventory.length !== walletData.inventory.length) {
          await persistNormalizedWallet(playerId, walletData);
        }
      } else {
        walletData = defaultWallet();
      }
      wallets[socket.id] = walletData;
      wallets[socket.id].playerId = playerId;
      wallets[socket.id].displayName = accountDisplayName(walletData, playerId);
      // If this socket is already in a match, refresh the live player object
      // as well (keeps coins/loadout consistent across sessions/tabs).
      if (players[socket.id]) {
        players[socket.id].playerId = playerId;
        applyWalletToPlayer(players[socket.id], socket.id);
        emitWallet(socket, players[socket.id]);
        if (players[socket.id].roomName) {
          io.to(players[socket.id].roomName).emit('stateUpdate', buildStateUpdatePayload(players[socket.id].roomName));
        }
      } else {
        emitWallet(socket, wallets[socket.id]);
      }
    } catch (e) {
    }
  });

  socket.on('registerAccount', async (payload) => {
    const username = payload && typeof payload.username === 'string' ? payload.username.trim() : '';
    const password = payload && typeof payload.password === 'string' ? payload.password : '';
    const playerId = payload && typeof payload.playerId === 'string' && payload.playerId.trim()
      ? payload.playerId.trim()
      : (players[socket.id] && players[socket.id].playerId);

    if (!dbPlayers) {
      socket.emit('registerResult', { ok: false, message: 'Database unavailable.' });
      return;
    }
    if (!playerId) {
      socket.emit('registerResult', { ok: false, message: 'Missing player id.' });
      return;
    }
    if (!username || !password) {
      socket.emit('registerResult', { ok: false, message: 'Username and password are required.' });
      return;
    }

    try {
      const taken = await dbPlayers.findOne({
        username: { $regex: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
      });
      if (taken) {
        socket.emit('registerResult', { ok: false, message: 'Username already taken.' });
        return;
      }

      const chosenStarterForRegister = getChosenStarterFromData(payload);
      await dbPlayers.updateOne(
        { _id: playerId },
        {
          $set: { username, password, isRegistered: true },
          $setOnInsert: {
            coins: 0,
            inventory: Array.from(new Set([...DEFAULT_INVENTORY, chosenStarterForRegister])),
            loadout: {
              equippedSkin: chosenStarterForRegister,
              primaryGun: DEFAULT_LOADOUT.primaryGun,
              secondaryGun: DEFAULT_LOADOUT.secondaryGun,
              primaryKnife: DEFAULT_LOADOUT.primaryKnife,
              secondaryKnife: DEFAULT_LOADOUT.secondaryKnife
            },
            equippedSkin: chosenStarterForRegister
          }
        },
        { upsert: true }
      );
      // Ensure the chosen starter is in inventory and equipped even if account already existed
      await dbPlayers.updateOne(
        { _id: playerId },
        {
          $addToSet: { inventory: chosenStarterForRegister }
        }
      ).catch(() => {});

      if (players[socket.id]) {
        players[socket.id].username = username;
        players[socket.id].isRegistered = true;
        players[socket.id].displayName = username;
        if (players[socket.id].roomName) {
          io.to(players[socket.id].roomName).emit('stateUpdate', buildStateUpdatePayload(players[socket.id].roomName));
          broadcastLeaderboard(players[socket.id].roomName);
        }
      }
      if (wallets[socket.id]) {
        wallets[socket.id].username = username;
        wallets[socket.id].isRegistered = true;
        wallets[socket.id].displayName = username;
      }

      socket.emit('registerResult', {
        ok: true,
        username,
        isRegistered: true,
        displayName: username,
        playerId
      });
    } catch (e) {
      socket.emit('registerResult', { ok: false, message: 'Registration failed.' });
    }
  });

  socket.on('loginAccount', async (payload) => {
    const username = payload && typeof payload.username === 'string' ? payload.username.trim() : '';
    const password = payload && typeof payload.password === 'string' ? payload.password : '';

    if (!dbPlayers) {
      socket.emit('loginResult', { ok: false, message: 'Database unavailable.' });
      return;
    }
    if (!username || !password) {
      socket.emit('loginResult', { ok: false, message: 'Username and password are required.' });
      return;
    }

    try {
      const account = await dbPlayers.findOne({
        username: { $regex: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
      });
      if (!account || account.password !== password) {
        socket.emit('loginResult', { ok: false, message: 'Invalid username or password.' });
        return;
      }

      socket.emit('loginResult', {
        ok: true,
        playerId: account._id,
        username: account.username,
        isRegistered: true
      });
    } catch (e) {
      socket.emit('loginResult', { ok: false, message: 'Login failed.' });
    }
  });

  socket.on('joinGame', async (data) => {
    if (players[socket.id]) return;
    data = data || {};

    const playerId = (typeof data.playerId === 'string' && data.playerId.trim())
      ? data.playerId.trim()
      : 'player_' + Math.random().toString(36).substring(2, 11);

    // --- Character Skin System: resolve chosen starter from client payload ---
    const chosenStarterId = getChosenStarterFromData(data);

    let walletData = null;
    if (dbPlayers) {
      try {
        const existing = await dbPlayers.findOne({ _id: playerId });
        if (existing) {
          walletData = parseWalletDoc(existing);
          // The player's chosen starter is authoritative at join time: it is the
          // ONE owned starter, it is equipped, and the opposite starter uniform
          // is stripped (exclusive ownership — a female starter never inherits
          // the male uniform and vice-versa).
          const currentStarter = (walletData.loadout && walletData.loadout.equippedSkin) || walletData.equippedSkin;
          const needsMigration = !existing.loadout || !Array.isArray(existing.inventory) ||
            !walletData.inventory.includes(chosenStarterId) ||
            currentStarter !== chosenStarterId;
          if (needsMigration) {
            walletData.inventory = normalizeInventory(walletData.inventory, chosenStarterId);
            walletData.loadout.equippedSkin = chosenStarterId;
            walletData.equippedSkin = chosenStarterId;
            await persistNormalizedWallet(playerId, walletData);
          }
        } else {
          const newDoc = buildDefaultPlayerDoc(playerId, chosenStarterId);
          await dbPlayers.insertOne(newDoc);
          walletData = parseWalletDoc(newDoc);
        }
      } catch (dbErr) {
        walletData = null;
      }
    }

    const matchType = data.matchType === 'private' ? 'private' : 'global';
    const fallbackZone = ZONE_DEFINITIONS[data.zone] || ZONE_DEFINITIONS.oldCityCenter;

    let roomName;
    let roomCode = null;
    let zone;

    if (matchType === 'private') {
      if (data.roomCode) {
        const code = String(data.roomCode).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
        const room = privateRooms.get(code);
        if (!room) {
          socket.emit('joinError', { message: `Room code "${code}" not found. Double-check the code with the host.` });
          return;
        }
        roomName = room.roomName;
        zone = ZONE_DEFINITIONS[room.zoneId] || fallbackZone;
        roomCode = code;
      } else {
        roomCode = generateRoomCode();
        zone = fallbackZone;
        roomName = `private_${roomCode}`;
        privateRooms.set(roomCode, { roomName, zoneId: zone.id });
      }
    } else {
      zone = fallbackZone;
      roomName = `global_${zone.id}`;
    }

    let requestedTimeLimit = null;
    if (data.timeLimit != null) {
      const parsedSeconds = Number.parseInt(data.timeLimit, 10);
      if (PRIVATE_TIME_LIMIT_OPTIONS.includes(parsedSeconds)) {
        requestedTimeLimit = parsedSeconds;
      }
    }

    if (requestedTimeLimit == null && data.matchLength != null) {
      const parsedMinutes = Number.parseInt(data.matchLength, 10);
      const seconds = parsedMinutes * 60;
      if (PRIVATE_TIME_LIMIT_OPTIONS.includes(seconds)) requestedTimeLimit = seconds;
    }
    if (requestedTimeLimit == null && data.matchDuration != null) {
      const parsedMinutes = Number.parseInt(data.matchDuration, 10);
      const seconds = parsedMinutes * 60;
      if (PRIVATE_TIME_LIMIT_OPTIONS.includes(seconds)) requestedTimeLimit = seconds;
    }

    const roomState = getOrCreateRoomState(roomName, zone, requestedTimeLimit, socket.id);
    const isLateJoiner = roomState.state === 'playing';
    const isHost = (matchType === 'private' && !data.roomCode);

    let spawnX, spawnZ, playerRole, playerHealth;
    if (isLateJoiner) {
      const spawn = randomSpawnPoint(zone);
      spawnX = spawn.x;
      spawnZ = spawn.z;
      playerRole = getLateJoinerRole(roomName);
      playerHealth = playerRole === 'hunter' ? HUNTER_MAX_HEALTH : PROP_MAX_HEALTH;
    } else {
      const spawn = lobbySpawn(roomPlayerCount(roomName));
      spawnX = spawn.x;
      spawnZ = spawn.z;
      playerRole = 'waiting';
      playerHealth = PROP_MAX_HEALTH;
    }

    players[socket.id] = {
      x: spawnX,
      y: PLAYER_EYE_LEVEL, 
      z: spawnZ,           
      zoneId: zone.id,     
      zone,                
      roomName,            
      matchType,           
      roomCode,            
      role: playerRole,
      isProp: false,
      propId: null,
      alive: true,
      score: 0,
      health: playerHealth,
      npcStrikes: 0,       
      disguiseBrokenAt: 0,
      isHost,             
      playerId,
      coins: 0,
      inventory: DEFAULT_INVENTORY.slice(),
      loadout: Object.assign({}, DEFAULT_LOADOUT),
      equippedSkin: DEFAULT_LOADOUT.equippedSkin
    };

    if (walletData) wallets[socket.id] = walletData;
    applyWalletToPlayer(players[socket.id], socket.id);

    socket.join(roomName);

    socket.emit('init', {
      id: socket.id,
      players: getRoomPlayers(roomName), 
      npcs: serializeNPCs(),            
      lootDrops,                         
      props: getPropsForZone(zone.id),   
      map,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, zones: ZONES },
      zone,
      roomName,
      roomCode,
      matchType,
      hostId: roomState.hostId,
      isHost,                            
      // Phase 3: the spawning player's persistent loadout (skin + weapon
      // models) loaded straight from the database.
      loadout: players[socket.id].loadout,
      timeLeft: roomState.timeLeft,
      timeLimit: roomState.timeLimit,
      originalDuration: roomState.originalDuration,
      matchState: roomState.state
    });

    socket.emit('timeUpdate', {
      timeLeft: roomState.timeLeft,
      timeLimit: roomState.timeLimit,
      originalDuration: roomState.originalDuration,
      state: roomState.state,
      intermissionSeconds: roomState.intermissionSeconds || INTERMISSION_SECONDS
    });

    emitRadarData(socket);
    emitWallet(socket, players[socket.id]);

    socket.broadcast.to(roomName).emit('playerJoined', {
      id: socket.id,
      // Serialized player: equippedSkin + loadout are ALWAYS present on the
      // packet, so existing clients can render the new player immediately.
      player: publicPlayerPayload(players[socket.id])
    });

    broadcastLeaderboard(roomName);
    sendRadarAfterStateChange();
  });

  socket.on('playerMove', (data) => {
    const player = players[socket.id];
    if (!player || !player.alive || player.isProp) return;
    if (!data || typeof data.x !== 'number' || typeof data.z !== 'number') {
      return;
    }

    const rs = getRoomState(player.roomName);
    const isLobbySpectator = player.role === 'waiting' || !rs || rs.state === 'waiting';
    const zone = isLobbySpectator ? LOBBY_AREA : (ZONE_DEFINITIONS[player.zoneId] || ZONE_DEFINITIONS.oldCityCenter);
    const constrained = constrainPosition(data.x, data.z, isLobbySpectator ? [] : map, zone);

    player.x = constrained.x;
    player.z = constrained.z;

    if (typeof data.y === 'number' && Number.isFinite(data.y)) {
      player.y = Math.max(0, Math.min(MAX_PLAYER_HEIGHT, data.y));
    }
    io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    sendRadarAfterStateChange();
  });

  socket.on('disguise', (propId) => {
    const player = players[socket.id];
    if (!player || !player.alive || player.role !== 'prop' || getRoomState(player.roomName)?.state !== 'playing') return;

    if (player.isProp) {
      player.isProp = false;
      player.propId = null;
    } else {
      const prop = getPropsForZone(player.zoneId).find((item) => item.id === propId);
      if (!prop) return;
      const distance = Math.hypot(
        player.x - (prop.x + prop.width / 2),
        player.z - (prop.y + prop.height / 2)
      );
      if (distance <= DISGUISE_RADIUS) {
        player.isProp = true;
        player.propId = propId;
        player.disguiseBrokenAt = 0;
      }
    }
    io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    sendRadarAfterStateChange();
  });

  socket.on('shoot', (aim) => {
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

    // Phase 3: resolve the shooter's equipped weapon model for this slot so
    // every client renders the tracer with the correct skin/colour.
    const weaponSlot = weaponType === 'secondary' ? 'secondaryGun' : 'primaryGun';
    const equippedGunId = (player.loadout && player.loadout[weaponSlot]) || DEFAULT_LOADOUT[weaponSlot];

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
      weaponId: equippedGunId,
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

    // Phase 3: the prop's equipped secondary knife model rides the packet.
    const equippedKnifeId = (player.loadout && player.loadout.secondaryKnife) || DEFAULT_LOADOUT.secondaryKnife;

    io.to(player.roomName).emit('fireTracer', {
      ownerId: socket.id,
      kind: 'knife',
      weaponType: null,
      weaponId: equippedKnifeId,
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

  socket.on('meleeAttack', () => {
    const attacker = players[socket.id];
    const roomState = attacker ? getRoomState(attacker.roomName) : null;
    if (!attacker || !roomState || roomState.state !== 'playing' || !attacker.alive) return;
    if (attacker.role !== 'prop' && attacker.role !== 'hunter') return;

    // One swing, one pass: a hunter can only carve up props, a prop can only
    // carve up hunters (and, below, ghouls). The victim role is decided once
    // and the player table is walked once - no duplicated player loops.
    const victimRole = attacker.role === 'prop' ? 'hunter' : 'prop';
    const attackerY = typeof attacker.y === 'number' ? attacker.y : PLAYER_EYE_LEVEL;

    let hitAny = false;
    let killedSomething = false;

    // ---- Players: hunters melee props / props melee hunters ---------------
    for (const id in players) {
      if (id === socket.id) continue;
      const target = players[id];
      if (!target || !target.alive) continue;
      if (target.roomName !== attacker.roomName) continue;
      if (target.role !== victimRole) continue;

      const targetY = typeof target.y === 'number' ? target.y : PLAYER_EYE_LEVEL;
      const dx = attacker.x - target.x;
      const dz = attacker.z - target.z;
      const dy = attackerY - targetY;
      const planarDistance = Math.hypot(dx, dz);
      const distance = Math.hypot(planarDistance, dy);

      const inRange = distance <= MELEE_RANGE || (planarDistance <= MELEE_RANGE && Math.abs(dy) <= 20);
      if (!inRange) continue;

      if (typeof target.health !== 'number') {
        target.health = target.role === 'hunter' ? HUNTER_MAX_HEALTH : PROP_MAX_HEALTH;
      }

      const wasDisguised = !!target.isProp;
      target.health -= MELEE_DAMAGE;
      hitAny = true;

      if (target.health <= 0) {
        target.health = 0;
        target.alive = false;
        target.isProp = false;
        target.propId = null;
        killedSomething = true;

        attacker.score = (attacker.score || 0) + HUNTER_KILL_SCORE;
        attacker.coins = (attacker.coins || 0) + HUNTER_KILL_COINS;
        syncWalletFromPlayer(attacker, socket.id);
        if (dbPlayers && attacker.playerId) {
          dbPlayers.updateOne({ _id: attacker.playerId }, { $inc: { coins: HUNTER_KILL_COINS } }).catch(() => {});
        }
        emitWallet(socket, attacker);

        io.to(id).emit('died');
        io.to(id).emit('hit', { health: 0, wasMelee: true });
      } else {
        // A hunter's blade also rips a hiding prop out of its disguise.
        if (wasDisguised && attacker.role === 'hunter') {
          target.isProp = false;
          target.propId = null;
          target.disguiseBrokenAt = Date.now();
          io.to(id).emit('disguiseBroken', { health: target.health });
        }
        io.to(id).emit('hit', { health: target.health, wasMelee: true, disguiseBroken: wasDisguised && attacker.role === 'hunter' });
        io.to(id).emit('meleeDamaged');
      }
    }

    // ---- Ghouls (NPCs): props only ----------------------------------------
    // The skeleton ghoul is drawn at 12x on the client, so its melee volume is
    // a fat cylinder: 45 units of horizontal reach and 60 units of vertical
    // slack measured from its base.
    if (attacker.role === 'prop') {
      for (const npcId in npcs) {
        const npc = npcs[npcId];
        if (!npc) continue;

        const npcBaseY = typeof npc.y === 'number' ? npc.y : 0;
        const horizDist = Math.hypot(attacker.x - npc.x, attacker.z - npc.z);
        const vertDist = Math.abs(attackerY - npcBaseY);
        if (horizDist > GHOUL_MELEE_RADIUS || vertDist > GHOUL_MELEE_HEIGHT) continue;

        hitAny = true;
        const killed = registerNPCHit(npc);

        io.to(attacker.roomName).emit('npcHit', {
          npcId: npc.id,
          hitsTaken: npc.hitsTaken,
          maxHits: npc.maxHits,
          health: npc.health,
          isKnife: false,
          isMelee: true
        });

        if (killed) {
          killedSomething = true;
          // A melee ghoul kill pays coins only: 25 coins and 0 score, so the
          // default NPC_KILL_SCORE credit inside killNPC is overridden to 0.
          // killNPC still handles npcDied, the loot drop and the respawn timer.
          killNPC(npcId, npc, attacker.roomName, socket.id, { scoreAward: 0 });

          attacker.coins = (attacker.coins || 0) + GHOUL_MELEE_KILL_COINS;
          syncWalletFromPlayer(attacker, socket.id);
          if (dbPlayers && attacker.playerId) {
            dbPlayers.updateOne(
              { _id: attacker.playerId },
              { $inc: { coins: GHOUL_MELEE_KILL_COINS } }
            ).catch(() => {});
          }
          emitWallet(socket, attacker);
        }

        break; // one ghoul per swing
      }
    }

    if (hitAny) {
      io.to(socket.id).emit('meleeHit', { success: true });
      io.to(attacker.roomName).emit('stateUpdate', buildStateUpdatePayload(attacker.roomName));
      broadcastLeaderboard(attacker.roomName);
      sendRadarAfterStateChange();
      if (killedSomething) checkWinConditions(attacker.roomName);
    } else {
      io.to(socket.id).emit('meleeMiss');
    }
  });

  socket.on('requestHeal', () => {
    const player = players[socket.id];
    const roomState = player ? getRoomState(player.roomName) : null;
    if (!player || !roomState || roomState.state !== 'playing' || !player.alive) return;

    player.health = HUNTER_MAX_HEALTH; 
    player.npcStrikes = 0;             
    io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    sendRadarAfterStateChange();
  });

  socket.on('respawn', () => {
    const player = players[socket.id];
    if (!player) return;

    const rs = getRoomState(player.roomName);
    const zone = ZONE_DEFINITIONS[player.zoneId] || ZONE_DEFINITIONS.oldCityCenter;
    const staysInLobby = player.role === 'waiting' || !rs || rs.state !== 'playing';
    const spawn = staysInLobby ? lobbySpawn(0) : randomSpawnPoint(zone);

    player.x = spawn.x;
    player.z = spawn.z;
    player.y = PLAYER_EYE_LEVEL; 
    player.alive = true;
    player.isProp = false;
    player.propId = null;
    player.health = PROP_MAX_HEALTH;
    player.npcStrikes = 0;
    player.disguiseBrokenAt = 0;

    io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    sendRadarAfterStateChange();
    broadcastLeaderboard(player.roomName);
  });

  socket.on('startMatch', () => {
    const player = players[socket.id]; const rs = player && getRoomState(player.roomName);
    if (!player || !rs || rs.state !== 'waiting' || !player.roomName.startsWith('private_') || rs.hostId !== socket.id) return;
    startRoom(player.roomName);
  });

  socket.on('updateRoomSettings', (data) => {
    const player = players[socket.id];
    if (!player) return;
    const roomName = player.roomName;
    const rs = getRoomState(roomName);
    if (!rs || !roomName.startsWith('private_') || rs.hostId !== socket.id) {
      return;
    }

    data = data || {};
    const zone = ZONE_DEFINITIONS[data.zoneId] || ZONE_DEFINITIONS[rs.zoneId];
    const parsedTime = Number.parseInt(data.timeLimit, 10);
    const timeLimit = PRIVATE_TIME_LIMIT_OPTIONS.includes(parsedTime) ? parsedTime : rs.timeLimit;

    rs.zoneId = zone.id;
    rs.timeLimit = timeLimit;
    rs.timeLeft = timeLimit;
    rs.originalDuration = timeLimit;

    const code = roomName.slice('private_'.length);
    const privateRoom = privateRooms.get(code);
    if (privateRoom) privateRoom.zoneId = zone.id;

    for (const [id, pl] of Object.entries(players)) {
      if (pl.roomName === roomName) {
        pl.zoneId = zone.id;
        pl.zone = zone;
      }
    }

    io.to(roomName).emit('roomSettingsChanged', {
      zoneId: zone.id,
      zone,
      timeLimit,
      timeLeft: rs.timeLeft
    });
    broadcastTimeUpdate(roomName);
  });

  socket.on('buyItem', async (itemId) => {
    // Works both in-game (live player object) and from the main-menu store
    // (in-memory wallet), so purchases never depend on match state.
    const player = players[socket.id];
    const target = player || wallets[socket.id];
    if (!target) return;

    const item = itemForId(itemId);
    if (!item || item.cost <= 0) {
      socket.emit('buyResult', Object.assign({
        ok: false,
        message: item ? 'Default items are permanently owned — equip them instead.' : 'Unknown item.'
      }, walletPayloadFields(target)));
      return;
    }
    if (!Array.isArray(target.inventory)) target.inventory = DEFAULT_INVENTORY.slice();

    const ownedAlready = normalizeInventory(target).includes(item.id);
    if (ownedAlready) {
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Already owned.' }, walletPayloadFields(target)));
      return;
    }
    const coins = target.coins || 0;
    if (coins < item.cost) {
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Not enough coins.' }, walletPayloadFields(target)));
      return;
    }

    const playerId = target.playerId || (player && player.playerId) || null;

    // ---- Database-backed purchase: ONE atomic conditional update. -----------
    // The filter itself enforces affordability ($gte) and non-ownership
    // ($ne), so two rapid clicks (or two browser tabs) can never double-spend:
    // once the first update lands, the second matches zero documents.
    if (dbPlayers && playerId) {
      try {
        await ensurePlayerDoc(playerId);
        const result = await dbPlayers.updateOne(
          { _id: playerId, coins: { $gte: item.cost }, inventory: { $ne: item.id } },
          { $inc: { coins: -item.cost }, $addToSet: { inventory: item.id } }
        );
        if (result.modifiedCount !== 1) {
          // Lost the race (or state drifted): re-read the source of truth and
          // report exactly why the purchase could not go through.
          const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
          applyParsedWallet(target, fresh);
          if (player) syncWalletFromPlayer(player, socket.id);
          const reason = fresh.inventory.includes(item.id) ? 'Already owned.' : 'Not enough coins.';
          socket.emit('buyResult', Object.assign({ ok: false, message: reason }, walletPayloadFields(target)));
          emitWallet(socket, target);
          return;
        }
        const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
        applyParsedWallet(target, fresh);
      } catch (dbErr) {
        socket.emit('buyResult', Object.assign({ ok: false, message: 'Store unavailable, try again.' }, walletPayloadFields(target)));
        return;
      }
    } else {
      // In-memory fallback (database offline): plain local mutation.
      target.coins = coins - item.cost;
      target.inventory = normalizeInventory(target);
      target.inventory.push(item.id);
      target.loadout = normalizeLoadout(target.loadout, target.inventory);
      target.equippedSkin = target.loadout.equippedSkin;
    }

    if (player) syncWalletFromPlayer(player, socket.id);

    socket.emit('buyResult', Object.assign({
      ok: true,
      itemId: item.id
    }, walletPayloadFields(target)));
    emitWallet(socket, target);
  });

  socket.on('equipItem', async (itemId) => {
    const player = players[socket.id];
    const target = player || wallets[socket.id];
    if (!target) return;

    const item = itemForId(itemId);
    if (!item) {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Unknown item.' }, walletPayloadFields(target)));
      return;
    }
    const slot = item.slot;
    if (!LOADOUT_SLOTS.includes(slot)) {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Item cannot be equipped.' }, walletPayloadFields(target)));
      return;
    }
    if (!Array.isArray(target.inventory)) target.inventory = DEFAULT_INVENTORY.slice();

    // Ownership gate: the item must already be in the inventory.
    if (!normalizeInventory(target).includes(item.id)) {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Item not owned.' }, walletPayloadFields(target)));
      return;
    }

    const playerId = target.playerId || (player && player.playerId) || null;

    // ---- Database-backed equip: ownership is enforced ATOMICALLY in the ----
    // query filter (`inventory: item.id`), so an item that is not in the
    // stored inventory can never be written into a loadout slot.
    if (dbPlayers && playerId) {
      try {
        await ensurePlayerDoc(playerId);
        const update = { [`loadout.${slot}`]: item.id };
        if (slot === 'equippedSkin') update.equippedSkin = item.id; // legacy mirror
        const result = await dbPlayers.updateOne(
          { _id: playerId, inventory: item.id },
          { $set: update }
        );
        if (result.modifiedCount !== 1) {
          const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
          applyParsedWallet(target, fresh);
          if (player) syncWalletFromPlayer(player, socket.id);
          socket.emit('equipResult', Object.assign({ ok: false, message: 'Item not owned.' }, walletPayloadFields(target)));
          emitWallet(socket, target);
          return;
        }
        const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
        applyParsedWallet(target, fresh);
      } catch (dbErr) {
        socket.emit('equipResult', Object.assign({ ok: false, message: 'Store unavailable, try again.' }, walletPayloadFields(target)));
        return;
      }
    } else {
      // In-memory fallback (database offline).
      target.loadout = normalizeLoadout(target.loadout, target.inventory);
      target.loadout[slot] = item.id;
      target.equippedSkin = target.loadout.equippedSkin;
    }

    if (player) syncWalletFromPlayer(player, socket.id);

    socket.emit('equipResult', Object.assign({
      ok: true,
      itemId: item.id,
      slot
    }, walletPayloadFields(target)));
    emitWallet(socket, target);
    if (player && player.roomName) {
      io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    }
  });


  socket.on('equipSkin', async (skinId) => {
    // Dedicated skin equip path required by the character skin system.
    // Validates ownership before updating loadout.equippedSkin.
    const player = players[socket.id];
    const target = player || wallets[socket.id];
    if (!target) return;

    // Accept either raw string id or object { skinId, id, equippedSkin }
    let rawId = null;
    if (typeof skinId === 'string') rawId = skinId;
    else if (skinId && typeof skinId === 'object') {
      rawId = skinId.skinId || skinId.id || skinId.equippedSkin || skinId.skin || null;
    }

    const itemId = typeof rawId === 'string' ? rawId.trim().replace(/\.glb$/i, '') : null;
    // Also allow full .glb name: strip extension for lookup, but keep original for file mapping
    const lookupId = itemId && STORE_ITEMS[itemId] ? itemId : (rawId && typeof rawId === 'string' ? rawId.replace(/\.glb$/i, '').trim() : null);

    if (!lookupId) {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Missing skin id.' }, walletPayloadFields(target)));
      return;
    }

    const item = itemForId(lookupId) || itemForId(rawId);
    if (!item || item.type !== 'skin') {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Unknown skin.' }, walletPayloadFields(target)));
      return;
    }

    if (!Array.isArray(target.inventory)) target.inventory = DEFAULT_INVENTORY.slice();
    const owned = normalizeInventory(target).includes(item.id);
    if (!owned) {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Skin not owned.' }, walletPayloadFields(target)));
      return;
    }

    const playerId = target.playerId || (player && player.playerId) || null;

    if (dbPlayers && playerId) {
      try {
        await ensurePlayerDoc(playerId, item.id);
        // Atomic ownership validation: filter ensures inventory contains the skin
        const result = await dbPlayers.updateOne(
          { _id: playerId, inventory: item.id },
          { $set: { 'loadout.equippedSkin': item.id, equippedSkin: item.id } }
        );
        if (result.modifiedCount !== 1) {
          const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
          applyParsedWallet(target, fresh);
          if (player) syncWalletFromPlayer(player, socket.id);
          socket.emit('equipResult', Object.assign({ ok: false, message: 'Skin not owned.' }, walletPayloadFields(target)));
          emitWallet(socket, target);
          return;
        }
        const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
        applyParsedWallet(target, fresh);
      } catch (dbErr) {
        socket.emit('equipResult', Object.assign({ ok: false, message: 'Store unavailable, try again.' }, walletPayloadFields(target)));
        return;
      }
    } else {
      target.loadout = normalizeLoadout(target.loadout, target.inventory);
      target.loadout.equippedSkin = item.id;
      target.equippedSkin = item.id;
    }

    if (player) syncWalletFromPlayer(player, socket.id);

    socket.emit('equipResult', Object.assign({
      ok: true,
      itemId: item.id,
      slot: 'equippedSkin'
    }, walletPayloadFields(target)));
    emitWallet(socket, target);
    if (player && player.roomName) {
      io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    }
  });

  socket.on('buySkin', async (skinId) => {
    // Alias for buyItem restricted to skins — uses same atomic $addToSet + $inc safety.
    const player = players[socket.id];
    const target = player || wallets[socket.id];
    if (!target) return;

    let rawId = typeof skinId === 'string' ? skinId : (skinId && (skinId.skinId || skinId.id)) || null;
    if (!rawId) {
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Missing skin id.' }, walletPayloadFields(target)));
      return;
    }
    const cleanId = typeof rawId === 'string' ? rawId.replace(/\.glb$/i, '').trim() : rawId;
    const item = itemForId(cleanId) || itemForId(rawId);
    if (!item || item.type !== 'skin') {
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Unknown skin.' }, walletPayloadFields(target)));
      return;
    }
    if (item.cost <= 0) {
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Starter skins are free — equip them instead.' }, walletPayloadFields(target)));
      return;
    }
    if (!Array.isArray(target.inventory)) target.inventory = DEFAULT_INVENTORY.slice();
    if (normalizeInventory(target).includes(item.id)) {
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Already owned.' }, walletPayloadFields(target)));
      return;
    }
    if ((target.coins || 0) < item.cost) {
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Not enough coins.' }, walletPayloadFields(target)));
      return;
    }

    const playerId = target.playerId || (player && player.playerId) || null;

    if (dbPlayers && playerId) {
      try {
        await ensurePlayerDoc(playerId);
        const result = await dbPlayers.updateOne(
          { _id: playerId, coins: { $gte: item.cost }, inventory: { $ne: item.id } },
          { $inc: { coins: -item.cost }, $addToSet: { inventory: item.id } }
        );
        if (result.modifiedCount !== 1) {
          const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
          applyParsedWallet(target, fresh);
          if (player) syncWalletFromPlayer(player, socket.id);
          const reason = fresh.inventory.includes(item.id) ? 'Already owned.' : 'Not enough coins.';
          socket.emit('buyResult', Object.assign({ ok: false, message: reason }, walletPayloadFields(target)));
          emitWallet(socket, target);
          return;
        }
        const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
        applyParsedWallet(target, fresh);
      } catch (dbErr) {
        socket.emit('buyResult', Object.assign({ ok: false, message: 'Store unavailable, try again.' }, walletPayloadFields(target)));
        return;
      }
    } else {
      target.coins = (target.coins || 0) - item.cost;
      target.inventory = normalizeInventory(target);
      target.inventory.push(item.id);
      target.loadout = normalizeLoadout(target.loadout, target.inventory);
      target.equippedSkin = target.loadout.equippedSkin;
    }

    if (player) syncWalletFromPlayer(player, socket.id);
    socket.emit('buyResult', Object.assign({ ok: true, itemId: item.id }, walletPayloadFields(target)));
    emitWallet(socket, target);
  });

  socket.on('leaveGame', () => {
    const player = players[socket.id];
    if (!player) return;

    const roomName = player.roomName;
    socket.leave(roomName);           
    delete players[socket.id];
    reassignHostIfNeeded(roomName, socket.id);
    cleanupEmptyRoom(roomName);       

    io.to(roomName).emit('playerLeft', socket.id);
    sendRadarAfterStateChange();
    broadcastLeaderboard(roomName);
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (!player) return;

    const roomName = player.roomName;
    syncWalletFromPlayer(player, socket.id);
    delete players[socket.id];
    delete wallets[socket.id];
    reassignHostIfNeeded(roomName, socket.id);
    cleanupEmptyRoom(roomName);

    io.to(roomName).emit('playerLeft', socket.id);
    sendRadarAfterStateChange();
    broadcastLeaderboard(roomName);
  });
});

// ===========================================================================
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

function tickNPCs() {
  const now = Date.now();
  const npcDamageRooms = new Set();
  const eliminationRooms = new Set();

  for (const [npcId, npc] of Object.entries(npcs)) {
    if (!npc || !Array.isArray(npc.waypoints) || npc.waypoints.length === 0) continue;

    if (typeof npc.currentWaypoint !== 'number' || npc.currentWaypoint < 0 || npc.currentWaypoint >= npc.waypoints.length) {
      npc.currentWaypoint = 0;
    }

    const patrolSpeed = typeof npc.speed === 'number' ? npc.speed : 6;
    const chaseSpeed = patrolSpeed * 1.5;

    let target = npc.targetId ? players[npc.targetId] : null;
    if (target) {
      const targetRoom = getRoomState(target.roomName);
      const npcRoom = npcRooms.get(npc.id);
      if (!target.alive || !targetRoom || targetRoom.state !== 'playing' || (npcRoom && target.roomName !== npcRoom)) {
        target = null;
      }
    }
    if (!target && npc.targetId) {
      npc.targetId = null;
      if (npc.state === 'chasing') {
        npc.state = 'patrolling';
        npc.currentWaypoint = 0;
        const npcRoom = npcRooms.get(npc.id);
        if (npcRoom) io.to(npcRoom).emit('npcStateChange', { npcId: npc.id, state: 'patrolling' });
      }
    }

    const homeX = npc.waypoints[0].x;
    const homeZ = npc.waypoints[0].z;
    const distFromHome = Math.hypot(npc.x - homeX, npc.z - homeZ);

    if (npc.state === 'chasing' && distFromHome > NPC_LEASH_RADIUS) {
      npc.isLeashing = true;
      npc.state = 'returning';
      npc.targetId = null;
      target = null;
      npc.currentWaypoint = 0; 
      const npcRoom = npcRooms.get(npc.id);
      if (npcRoom) io.to(npcRoom).emit('npcStateChange', { npcId: npc.id, state: 'returning' });
    }

    let closest = null;
    let closestId = null;
    let closestDist = Infinity;
    const boundRoom = npc.state === 'chasing' ? (npcRooms.get(npc.id) || null) : null;

    for (const [id, player] of Object.entries(players)) {
      if (!player.alive) continue;
      if (boundRoom && player.roomName !== boundRoom) continue;
      if (getRoomState(player.roomName)?.state !== 'playing') continue;

      const d = Math.hypot(player.x - npc.x, player.z - npc.z);
      if (d < closestDist) {
        closestDist = d;
        closest = player;
        closestId = id;
      }
    }

    if (npc.state === 'patrolling' && !npc.isLeashing && closest && closestDist <= 300) {
      npc.state = 'chasing';
      npc.targetId = closestId;
      npcRooms.set(npc.id, closest.roomName);
      target = closest;
      io.to(closest.roomName).emit('npcAggro', { npcId: npc.id, targetId: closestId });
    }

    if (npc.state === 'chasing' && target) {
      const dx = target.x - npc.x;
      const dz = target.z - npc.z;
      const dist = Math.hypot(dx, dz);
      const stopDist = 30 - 5;

      if (dist > stopDist) {
        const step = Math.min(chaseSpeed, dist - stopDist);
        npc.x += (dx / dist) * step;
        npc.z += (dz / dist) * step;
      }
    } else if (npc.state === 'returning') {
      const dx = homeX - npc.x;
      const dz = homeZ - npc.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= patrolSpeed) {
        npc.x = homeX;
        npc.z = homeZ;
        npc.state = 'exhausted_heavy';
        npc.currentWaypoint = 0;
        const npcRoom = npcRooms.get(npc.id);
        if (npcRoom) io.to(npcRoom).emit('npcStateChange', { npcId: npc.id, state: 'exhausted_heavy' });

        scheduleNPCRecovery(npc.id, () => {
          if (npcs[npc.id] !== npc || npc.state !== 'exhausted_heavy') return;
          npc.state = 'exhausted_slow';
          if (npcRooms.get(npc.id)) io.to(npcRooms.get(npc.id)).emit('npcStateChange', { npcId: npc.id, state: 'exhausted_slow' });

          scheduleNPCRecovery(npc.id, () => {
            if (npcs[npc.id] !== npc || npc.state !== 'exhausted_slow') return;
            npc.state = 'patrolling';
            npc.isLeashing = false;
            npc.currentWaypoint = 0; 
            if (npcRooms.get(npc.id)) io.to(npcRooms.get(npc.id)).emit('npcStateChange', { npcId: npc.id, state: 'patrolling' });
          }, 3500);
        }, 3500);
      } else {
        npc.x += (dx / dist) * patrolSpeed;
        npc.z += (dz / dist) * patrolSpeed;
      }
    } else if (npc.state === 'patrolling') {
      const wp = npc.waypoints[npc.currentWaypoint];
      if (wp) {
        const dx = wp.x - npc.x;
        const dz = wp.z - npc.z;
        const dist = Math.hypot(dx, dz);

        if (dist < patrolSpeed || dist === 0) {
          npc.x = wp.x;
          npc.z = wp.z;
          npc.currentWaypoint = (npc.currentWaypoint + 1) % npc.waypoints.length;
          npc.isLeashing = false;
        } else {
          npc.x += (dx / dist) * patrolSpeed;
          npc.z += (dz / dist) * patrolSpeed;
        }
      }
    }

    if (npc.state !== 'chasing' || !target) continue;
    const strikeDist = Math.hypot(target.x - npc.x, target.z - npc.z);
    if (strikeDist > 30) continue;
    if (now - (npc.lastAttackAt || 0) < 1000) continue;

    npc.lastAttackAt = now;
    if (typeof target.health !== 'number') target.health = 100;
    if (typeof target.npcStrikes !== 'number') target.npcStrikes = 0;

    target.npcStrikes += 1;
    target.health -= 17;
    const lethal = target.npcStrikes >= 6 || target.health <= 0;

    npcDamageRooms.add(target.roomName);
    io.to(target.roomName).emit('npcAttack', { npcId: npc.id });

    if (lethal) {
      target.health = 0;
      target.alive = false;
      target.isProp = false;
      target.propId = null;
      target.npcStrikes = 0;

      io.to(npc.targetId).emit('hit', { health: 0, wasMelee: true, fromNpc: true });
      io.to(npc.targetId).emit('died');
      eliminationRooms.add(target.roomName);

      npc.targetId = null;
      npc.state = 'patrolling';
      npc.currentWaypoint = 0;
      io.to(target.roomName).emit('npcStateChange', { npcId: npc.id, state: 'patrolling' });
    } else {
      io.to(npc.targetId).emit('hit', { health: target.health, wasMelee: true });
    }
  }

  for (const roomName of npcDamageRooms) {
    io.to(roomName).emit('stateUpdate', buildStateUpdatePayload(roomName));
  }
  if (eliminationRooms.size > 0) {
    sendRadarAfterStateChange();
    for (const roomName of eliminationRooms) {
      broadcastLeaderboard(roomName);
      checkWinConditions(roomName);
    }
  }
}

function tickLoot() {
  let stateChanged = false;
  const stateRooms = new Set();

  for (const [playerId, player] of Object.entries(players)) {
    const roomState = getRoomState(player.roomName);
    if (!player.alive || !roomState || roomState.state !== 'playing') continue;

    for (const [lootId, drop] of Object.entries(lootDrops)) {
      if (!drop || drop.roomName !== player.roomName) continue;

      const dist = Math.hypot(player.x - drop.x, player.z - drop.z);
      if (dist < PLAYER_RADIUS + 10) {
        player.coins = (player.coins || 0) + drop.value;
        syncWalletFromPlayer(player, playerId);

        if (dbPlayers && player.playerId) {
          dbPlayers.updateOne(
            { _id: player.playerId },
            { $inc: { coins: drop.value } }
          ).catch(() => {});
        }

        delete lootDrops[lootId];
        stateChanged = true;
        stateRooms.add(player.roomName);

        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
          emitWallet(playerSocket, player);
          playerSocket.emit('lootCollected', drop.value);
        }
      }
    }
  }

  if (stateChanged) {
    for (const roomName of stateRooms) {
      io.to(roomName).emit('stateUpdate', buildStateUpdatePayload(roomName));
    }
  }
}

setInterval(() => {
  tickNPCs();
  tickLoot();

  const activeRooms = new Set();
  Object.values(players).forEach(p => {
    if (getRoomState(p.roomName)?.state === 'playing') activeRooms.add(p.roomName);
  });
  for (const r of activeRooms) {
    io.to(r).emit('stateUpdate', buildStateUpdatePayload(r));
  }
}, TICK_RATE);

function tickPropSurvival() {
  const roomsScored = new Set();

  for (const [id, player] of Object.entries(players)) {
    if (player.role === 'prop' && player.alive && getRoomState(player.roomName)?.state === 'playing') {
      player.score = (player.score || 0) + PROP_SURVIVAL_SCORE;
      player.coins = (player.coins || 0) + PROP_SURVIVAL_COINS;
      if (dbPlayers && player.playerId) {
        dbPlayers.updateOne({ _id: player.playerId }, { $inc: { coins: PROP_SURVIVAL_COINS } }).catch(() => {});
      }
      const sock = io.sockets.sockets.get(id);
      syncWalletFromPlayer(player, id);
      if (sock) emitWallet(sock, player);
      roomsScored.add(player.roomName);
    }
  }

  for (const roomName of roomsScored) {
    broadcastLeaderboard(roomName);
  }
}

setInterval(tickPropSurvival, PROP_SURVIVAL_INTERVAL);

async function connectDatabase() {
  const client = new MongoClient(MONGO_URI, {});
  await client.connect();
  dbPlayers = client.db('prophunt').collection('players');
  console.log('MongoDB connected — persistent wallets enabled (db: prophunt, collection: players)');
}

async function startServer() {
  try {
    await connectDatabase();
  } catch (err) {
    console.error('MongoDB connection failed — falling back to in-memory wallets:', err.message);
    dbPlayers = null;
  }

  // Crucial for Render: Allows the cloud to assign its own port, or defaults to 3000 locally
  const serverPort = process.env.PORT || (typeof PORT !== 'undefined' ? PORT : 3000);

  server.listen(serverPort, () => {
    console.log(`PropHunt.io Ghost Town server running on port ${serverPort}`);
    console.log(`Map size: ${typeof WORLD_WIDTH !== 'undefined' ? WORLD_WIDTH : 'Unknown'}x${typeof WORLD_HEIGHT !== 'undefined' ? WORLD_HEIGHT : 'Unknown'}`);
  });
}

startServer();