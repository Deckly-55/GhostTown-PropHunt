import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ===========================
// Group 5 — Frictionless browser auth (Session identity)
// ===========================
let persistentPlayerId = sessionStorage.getItem('propHuntPlayerId');
if (!persistentPlayerId) {
  persistentPlayerId = 'player_' + Math.random().toString(36).substring(2, 11);
  try {
    sessionStorage.setItem('propHuntPlayerId', persistentPlayerId);
  } catch (err) {
    persistentPlayerId = 'player_' + Math.random().toString(36).substring(2, 11);
  }
}

// ===========================
// Constants & State
// ===========================
const PLAYER_RADIUS = 15;
const ZONE_DEFINITIONS = {
  oldCityCenter: { id: 'oldCityCenter', name: 'The Old City Center', minX: 0, maxX: 3000, minZ: 0, maxZ: 3000 },
  historicRuralEdge: { id: 'historicRuralEdge', name: 'The Historic & Rural Edge', minX: 0, maxX: 3000, minZ: 3000, maxZ: 7000 },
  industrialWorkingDistrict: { id: 'industrialWorkingDistrict', name: 'The Industrial Working District', minX: 3000, maxX: 6000, minZ: 0, maxZ: 3000 },
  miningForgeHub: { id: 'miningForgeHub', name: 'The Mining & Forge Hub', minX: 6000, maxX: 9000, minZ: 0, maxZ: 7000 },
  massiveTransitCorridor: { id: 'massiveTransitCorridor', name: 'The Massive Transit Corridor', minX: 3000, maxX: 6000, minZ: 3000, maxZ: 7000 },
  giantSouthernBorder: { id: 'giantSouthernBorder', name: 'The Giant Southern Border', minX: 0, maxX: 9000, minZ: 7000, maxZ: 9000 }
};
let currentZone = ZONE_DEFINITIONS.oldCityCenter;
let zoneVisualGroup = null;
const PLAYER_RADIUS_3D = 8;
const PLAYER_EYE_HEIGHT = 12;
const STANDING_EYE_HEIGHT = PLAYER_EYE_HEIGHT; // 12 units
const CHARACTER_TARGET_HEIGHT = STANDING_EYE_HEIGHT * 1.1; // 13.2 units (standingEyeHeight * 1.1 for direct eye-to-eye alignment)
const PLAYER_HEIGHT_3D = CHARACTER_TARGET_HEIGHT;
const BADGE_HEIGHT = CHARACTER_TARGET_HEIGHT * 1.12; // ~14.78 units cleanly above character head

const CROUCH_EYE_HEIGHT = PLAYER_EYE_HEIGHT / 2;
const CROUCH_LERP_SPEED = 10;

const HEAL_CHANNEL_MS = 5000;

const WEAPONS = {
  primary:   { name: 'Primary',   damage: 25, ammo: 5,  fireRateMs: 800, reloadMs: 2000 },
  secondary: { name: 'Secondary', damage: 12.5, ammo: 12, fireRateMs: 150, reloadMs: 2000 }
};
const KNIFE_THROW_COOLDOWN_MS = 1500;
let lastKnifeThrowTime = 0;
const RELOAD_DURATION_MS = 2000;

const GRAVITY = 90;
const JUMP_VELOCITY = 50;
const MAX_FRAME_DT = 0.05;

const DEFAULT_FOV = 75;
const ADS_FOV = 40;
const ADS_LERP_SPEED = 12;

const MOVE_SPEED = 4;
const DISGUISE_RADIUS = 50;
const TRACER_LIFETIME_MS = 150;
const TRACER_RADIUS = 1.6;
const GRID_SIZE = 100;
const WALL_HEIGHT = 40;
const GLASS_HEIGHT = 40;
const PROP_HEIGHT = 18;

const CRATE_MODEL_URL = 'Crate.glb';
const mapModelCache = {};
const mapModelLoadPromises = {};

let socket = null;
let myId = null;
let players = {};
let npcs = {};
let npcMeshes = {};
let lootDrops = {};
let lootMeshes = {};
let props = [];
let map = [];

let worldWidth = 3000;
let worldHeight = 3000;
let localX = 0;
let localZ = 0;

let velocityY = 0;
let jumpOffset = 0;
let isGrounded = true;

const terrainRaycaster = new THREE.Raycaster();
const DOWN_VECTOR = new THREE.Vector3(0, -1, 0);
const rayOrigin = new THREE.Vector3();

const RAY_START_HEIGHT = 200;
const RAY_MAX_DISTANCE = 400;
const FLOOR_LERP_SPEED = 12;
const MAX_STEP_UP = 25;

let currentFloorHeight = 0;
let smoothedFloorHeight = 0;
let lastFloorSampleX = null;
let lastFloorSampleZ = null;

function resetFloorTracking() {
  lastFloorSampleX = null;
  lastFloorSampleZ = null;
  currentFloorHeight = 0;
  smoothedFloorHeight = 0;
  jumpOffset = 0;
  velocityY = 0;
  isGrounded = true;
  wasInAir = false; // A respawn/teleport is not a landing — prevents a false landing sound
}

let isCrouching = false;
let crouchAmount = 0;
let isHealing = false;
let healStartedAt = 0;
let myIsHealing = false;
let myIsPropHealing = false;
let myIsPassiveHealing = false;
let myHealCooldownRemaining = 0;
let healInterruptedUntil = 0;

let equippedWeapon = 'primary';
let ammo = { primary: WEAPONS.primary.ammo, secondary: WEAPONS.secondary.ammo };
let lastShotTimeByWeapon = { primary: 0, secondary: 0 };
let isReloading = false;
let reloadEndsAt = 0;
let isAiming = false;

let lastSentX = null;
let lastSentY = null;
let lastSentZ = null;

let isDisguised = false;
let myRole = null;
let amAlive = true;
let hasJoined = false;
let myHealth = 100;

const LOBBY_COMPUTER_X = 50000;
const LOBBY_COMPUTER_Z = 50000;
const LOBBY_COMPUTER_INTERACT_DISTANCE = 60;
const DEFAULT_PRIVATE_TIME_LIMIT = 300;

let selectedTimeLimit = DEFAULT_PRIVATE_TIME_LIMIT;
let roomSettingsZoneId = 'oldCityCenter';
let lobbyMapName = 'The Old City Center';
let hostSettingsOpen = false;
let nearLobbyComputer = false;

let timeLeft = 300;
let matchState = 'waiting';
let isPrivateRoom = false;
let isRoomHost = false;
let myIsHost = false;
let currentRoomCode = null;

const LOBBY_AREA = { id: 'stagingLobby', name: 'Staging Ground', minX: 49800, maxX: 50200, minZ: 49800, maxZ: 50200 };
let originalDuration = 300;
let intermissionSeconds = 10;
let intermissionCountdownInterval = null;

const keys = { w: false, a: false, s: false, d: false, space: false };
let damageFlashAlpha = 0;
let disguiseBreakNotification = 0;
let lastLeaderboardEntries = [];

const STORE_CATALOG = {
  Casual_Character: { id: 'Casual_Character', name: 'Casual Character', file: 'Casual_Character.glb', cost: 0, type: 'skin', slot: 'equippedSkin', color: null, tracer: null, starter: true, gender: 'male',   stats: 'Free male starter uniform.' },
  Casual_w:         { id: 'Casual_w',         name: 'Casual Female',    file: 'Casual_w.glb',         cost: 0, type: 'skin', slot: 'equippedSkin', color: null, tracer: null, starter: true, gender: 'female', stats: 'Free female starter uniform.' },
  Beach_Character:    { id: 'Beach_Character',    name: 'Beach Character',         file: 'Beach_Character.glb',    cost: 500,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Sun-bleached boardwalk fit.' },
  Casual_w2:          { id: 'Casual_w2',          name: 'Casual Female 2',         file: 'Casual_w2.glb',          cost: 500,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Alternate casual streetwear cut.' },
  Farmer:             { id: 'Farmer',             name: 'Farmer',                  file: 'Farmer.glb',             cost: 600,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Dusty overalls from the rural edge.' },
  Hoodie_Character:   { id: 'Hoodie_Character',   name: 'Hoodie Character',        file: 'Hoodie_Character.glb',   cost: 600,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Low-profile hoodie for quiet hunts.' },
  Worker:             { id: 'Worker',             name: 'Worker',                  file: 'Worker.glb',             cost: 600,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'High-vis industrial district uniform.' },
  Worker_w:           { id: 'Worker_w',           name: 'Worker Female',           file: 'Worker_w.glb',           cost: 600,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'High-vis industrial district uniform.' },
  Adventurer:         { id: 'Adventurer',         name: 'Adventurer',              file: 'Adventurer.glb',         cost: 650,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Field-ready explorer kit.' },
  Business_Man:       { id: 'Business_Man',       name: 'Business Man',            file: 'Business_Man.glb',       cost: 700,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Sharp suit, sharper aim.' },
  Adventurer_w:       { id: 'Adventurer_w',       name: 'Adventurer Female',       file: 'Adventurer_w.glb',       cost: 750,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Field-ready explorer kit.' },
  Punk:               { id: 'Punk',               name: 'Punk',                    file: 'Punk.glb',               cost: 800,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Studs, spikes and bad attitude.' },
  Suit_w:             { id: 'Suit_w',             name: 'Suit Female',             file: 'Suit_w.glb',             cost: 800,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Tailored corporate silhouette.' },
  Medieval_w:         { id: 'Medieval_w',         name: 'Medieval Female',         file: 'Medieval_w.glb',         cost: 850,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Old-world garb from the ruins.' },
  Soldier_w:          { id: 'Soldier_w',          name: 'Soldier Female',          file: 'Soldier_w.glb',          cost: 850,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Standard-issue combat fatigues.' },
  Punk_w:             { id: 'Punk_w',             name: 'Punk Female',             file: 'Punk_w.glb',             cost: 900,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Studs, spikes and bad attitude.' },
  Swat:               { id: 'Swat',               name: 'SWAT',                    file: 'Swat.glb',               cost: 950,  type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Breach-ready tactical loadout.' },
  King:               { id: 'King',               name: 'King',                    file: 'King.glb',               cost: 1500, type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Rule the ghost town in style.' },
  Witch_w:            { id: 'Witch_w',            name: 'Witch Female',            file: 'Witch_w.glb',            cost: 1500, type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Hexed robes for midnight matches.' },
  Sci_Fi_Character_w: { id: 'Sci_Fi_Character_w', name: 'Sci-Fi Character Female', file: 'Sci_Fi_Character_w.glb', cost: 2500, type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Neon-lit hard-light exosuit.' },
  Astronaut:          { id: 'Astronaut',          name: 'Astronaut',               file: 'Astronaut.glb',          cost: 3000, type: 'skin', slot: 'equippedSkin', color: null, tracer: null, stats: 'Vacuum-rated flagship cosmetic.' },

  default:       { id: 'default',       name: 'Standard Uniform',   file: 'Casual_Character.glb', cost: 0,    type: 'skin',            slot: 'equippedSkin',    color: null,      tracer: null,      legacy: true, stats: 'The classic Hunter / Prop look.' },
  shadowHunter:  { id: 'shadowHunter',  name: 'Shadow Hunter Skin', file: 'Casual_Character.glb', cost: 500,  type: 'skin',            slot: 'equippedSkin',    color: 0x111111, tracer: null,      legacy: true, stats: 'Pitch-black silhouette for Hunters.' },
  steelProp:     { id: 'steelProp',     name: 'Steel Prop Crate',   file: 'Casual_w.glb',         cost: 500,  type: 'skin',            slot: 'equippedSkin',    color: 0x7f8c8d, tracer: null,      legacy: true, stats: 'Brushed-metal finish for disguised Props.' },

  standardRifle: { id: 'standardRifle', name: 'Militia Carbine',      file: 'militiaCarbine.glb', thumb: '/store/weapons/militiaCarbine.png', cost: 0,    type: 'hunterWeapon',    slot: 'primaryGun',      color: null,      tracer: 0xffe27a, legacy: true, stats: 'Dmg 25 · 5 rds · dependable all-rounder.' },
  shotgun:       { id: 'shotgun',       name: 'Graveyard Pump',     file: 'graveyardPump.glb',  thumb: '/store/weapons/graveyardPump.png',  cost: 700,  type: 'hunterWeapon',    slot: 'primaryGun',      color: null,      tracer: 0xffd08a, legacy: true, stats: 'Dmg 25 · 5 rds · heavy close-range profile.' },
  vulcanRifle:   { id: 'vulcanRifle',   name: 'Hellhound MK-III',   file: 'hellhoundMK3.glb',   thumb: '/store/weapons/hellhoundMK3.png',   cost: 800,  type: 'hunterWeapon',    slot: 'primaryGun',      color: null,      tracer: 0xff8c42, legacy: true, stats: 'Dmg 25 · 5 rds · molten-ember tracer.' },
  longshotMk2:   { id: 'longshotMk2',   name: 'Nightwatch DMR',     file: 'nightwatchDMR.glb',  thumb: '/store/weapons/nightwatchDMR.png',  cost: 1200, type: 'hunterWeapon',    slot: 'primaryGun',      color: null,      tracer: 0x9fd8ff, legacy: true, stats: 'Dmg 25 · 5 rds · cold-blue tracer.' },

  sidearmPistol: { id: 'sidearmPistol', name: 'Watchman 9mm',       file: 'watchman9mm.glb',    thumb: '/store/weapons/watchman9mm.png',    cost: 0,    type: 'hunterWeapon',    slot: 'secondaryGun',    color: null,      tracer: 0xffe27a, legacy: true, stats: 'Dmg 12.5 · 12 rds · fast and reliable.' },
  revolver:      { id: 'revolver',      name: 'Outlaw Six-Shooter', file: 'outlawRevolver.glb', thumb: '/store/weapons/outlawRevolver.png', cost: 700,  type: 'hunterWeapon',    slot: 'secondaryGun',    color: null,      tracer: 0xffc27a, legacy: true, stats: 'Dmg 12.5 · 12 rds · hard-hitting hand cannon.' },
  viperSMG:      { id: 'viperSMG',      name: 'Cryptkeeper Auto',   file: 'cryptkeeperAuto.glb', thumb: '/store/weapons/cryptkeeperAuto.png', cost: 600,  type: 'hunterWeapon',    slot: 'secondaryGun',    color: null,      tracer: 0xa2ff9f, legacy: true, stats: 'Dmg 12.5 · 12 rds · toxic-green tracer.' },

  fieldBlade:    { id: 'fieldBlade',    name: 'Field Blade',        file: 'fieldBlade.glb',     thumb: '/store/weapons/fieldBlade.png',     cost: 0,    type: 'propWeapon',      slot: 'primaryKnife',    color: null,      tracer: null,      stats: 'Trusted close-range melee blade.' },
  carbonCleaver: { id: 'carbonCleaver', name: 'Cursed Cleaver',     file: 'cursedCleaver.glb',  thumb: '/store/weapons/cursedCleaver.png',  cost: 400,  type: 'propWeapon',      slot: 'primaryKnife',    color: null,      tracer: null,      legacy: true, stats: 'Featherweight carbon melee cleaver.' },
  throwingKnife: { id: 'throwingKnife', name: 'Throwing Knife',     file: 'Arrow.glb',          thumb: '/store/weapons/Arrow.png',          cost: 0,    type: 'propWeapon',      slot: 'secondaryKnife',  color: null,      tracer: 0x9fd8ff, legacy: true, stats: 'Balanced Prop throwing knife.' },
  phantomDagger: { id: 'phantomDagger', name: 'Bloodfang Dagger',   file: 'bloodfangDagger.glb', thumb: '/store/weapons/bloodfangDagger.png', cost: 650,  type: 'propWeapon',      slot: 'secondaryKnife',  color: null,      tracer: 0xd8a2ff, legacy: true, stats: 'Haunting violet throw trail.' }
};

function formatWeaponDisplayName(rawId) {
  if (!rawId || typeof rawId !== 'string') return '';
  let clean = rawId.replace(/^.*[\\\/]/, '').replace(/\.glb$/i, '');
  if (clean.toLowerCase().startsWith('l.')) {
    clean = clean.slice(2);
  }
  const key = clean.toLowerCase();
  const nameMap = {
    // Hunter Weapons
    'rustbolt308': 'Rustbolt .308',
    'nightwatchdmr': 'Nightwatch DMR',
    'wraithlongshot': 'Wraith Longshot',
    'hollowpointmk4': 'Hollow Point MK-IV',
    'reaperseye': "Reaper's Eye",
    'militiacarbine': 'Militia Carbine',
    'blackoutar': 'Blackout AR',
    'hellhoundmk3': 'Hellhound MK-III',
    'duskbreakerar': 'Duskbreaker AR',
    'alleyvipersmg': 'Alley Viper SMG',
    'submachinegun': 'Alley Viper SMG',
    'submachine gun': 'Alley Viper SMG',
    'pulseshredderx9': 'Pulse Shredder X9',
    'watchman9mm': 'Watchman 9mm',
    'shadow45': 'Shadow .45',
    'nightshadepistol': 'Nightshade Tactical',
    'cryptkeeperauto': 'Cryptkeeper Auto',
    'outlawrevolver': 'Outlaw Six-Shooter',
    'ironjudge44': 'Iron Judge .44',
    'palerider': 'Pale Rider',
    'graveyardpump': 'Graveyard Pump',
    'alleysweeper': 'Alley Sweeper',
    'breacher12g': 'Breacher 12G',
    'widowmaker': 'Widowmaker',
    'whisperingrecurve': 'Whispering Recurve',
    'silentstalker': 'Silent Stalker',
    'ammopistol': 'Ammo Pistol',
    'ammoshotgun': 'Ammo Shotgun',
    'ammosniper': 'Ammo Sniper',
    'arrow': 'Arrow',
    'quiver': 'Quiver',

    // Prop Weapons
    'rustyshiv': 'Rusty Shiv',
    'fieldblade': 'Field Blade',
    'shadowfang': 'Shadow Fang',
    'cursedcleaver': 'Cursed Cleaver',
    'timberripper': 'Timber Ripper',
    'skullcracker': 'Skullcracker',
    'slaughterhousecleaver': 'Slaughterhouse Cleaver',
    'ironpry': 'Iron Pry',
    'bloodfangdagger': 'Bloodfang Dagger',
    'trackersedge': "Tracker's Edge",
    'ghostblade': 'Ghostblade',
    'marshcarver': 'Marsh Carver',
    'grimharvester': 'Grim Harvester',
    'bonecrusher': 'Bonecrusher',
    'rustyjaw': 'Rusty Jaw',
    'carboncleaver': 'Carbon Cleaver',
    'throwingknife': 'Throwing Knife',
    'phantomdagger': 'Phantom Dagger',

    // Legendary Weapons
    'ionstriker': 'Ion Striker',
    'vanguardpulsear': 'Vanguard Pulse AR',
    'spectrexcarbine': 'Spectre-X Carbine',
    'hyperionmk2': 'Hyperion MK-II',
    'eclipserifle': 'Eclipse Rifle',
    'plasmamortar': 'Plasma Mortar',
    'novafrag': 'Nova Frag',
    'arcsidearm': 'Arc Sidearm',
    'nova7blaster': 'Nova-7 Blaster',
    'volt9auto': 'Volt-9 Auto',
    'photonripper': 'Photon Ripper',
    'voidlance': 'Void Lance',
    'railghostx1': 'Railghost X1'
  };

  if (nameMap[key]) return nameMap[key];

  let formatted = clean
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();

  return formatted
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getItemDisplayName(item) {
  if (!item) return '';
  if (typeof item === 'string') {
    return formatWeaponDisplayName(item) || item;
  }
  if (item.type !== 'skin') {
    return formatWeaponDisplayName(item.id || item.file) || item.name || '';
  }
  return item.name || '';
}

function isLegendaryWeapon(itemOrId) {
  if (!itemOrId) return false;
  if (typeof itemOrId === 'string') {
    return itemOrId.toLowerCase().startsWith('l.') || itemOrId.toLowerCase().includes('legendary');
  }
  return !!(itemOrId.isLegendary || (itemOrId.id && itemOrId.id.toLowerCase().startsWith('l.')) || (itemOrId.file && itemOrId.file.toLowerCase().startsWith('l.')));
}

function isPropWeapon(itemOrId) {
  if (!itemOrId) return false;
  if (isLegendaryWeapon(itemOrId)) return false;
  if (typeof itemOrId === 'object') {
    if (itemOrId.type === 'skin') return false;
    if (itemOrId.type === 'propWeapon') return true;
    if (itemOrId.type === 'hunterWeapon') return false;
  }
  const id = typeof itemOrId === 'string' ? itemOrId : (itemOrId.id || itemOrId.file || '');
  const lower = id.replace(/\.glb$/i, '').toLowerCase();

  const propSet = new Set([
    'rustyshiv', 'fieldblade', 'shadowfang', 'cursedcleaver',
    'timberripper', 'skullcracker', 'slaughterhousecleaver', 'ironpry',
    'bloodfangdagger', 'trackersedge', 'ghostblade', 'marshcarver',
    'grimharvester', 'bonecrusher', 'rustyjaw', 'carboncleaver',
    'phantomdagger'
  ]);
  if (propSet.has(lower)) return true;

  const propKeywords = [
    'knife', 'dagger', 'cleaver', 'shiv', 'katana', 'machete', 'axe',
    'bat', 'crowbar', 'sickle', 'hammer', 'wrench', 'blade', 'jaw',
    'crusher', 'pry', 'harvester', 'cracker', 'ripper', 'fang', 'carver'
  ];
  return propKeywords.some(kw => lower.includes(kw));
}

function isHunterWeapon(itemOrId) {
  if (!itemOrId) return false;
  if (isLegendaryWeapon(itemOrId)) return false;
  if (typeof itemOrId === 'object' && itemOrId.type === 'skin') return false;
  if (typeof itemOrId === 'object' && itemOrId.type === 'hunterWeapon') return true;
  if (typeof itemOrId === 'object' && itemOrId.type === 'propWeapon') return false;
  return !isPropWeapon(itemOrId);
}

// Weapons Store Catalog: 53 weapons scanned from public/Skins/Weapons/ and public/store/weapons/
// Non-legendary weapons are cleanly separated by role into Hunter Weapons vs. Prop Weapons.
// All 'l.' prefixed Sci-Fi weapons are grouped into Legendary Weapons.
const WEAPON_REGISTRY = [
  // — Legendary Weapons (Gold/Legendary section, stripped display names, higher pricing) —
  { id: 'l.arcSidearm', name: 'Arc Sidearm', file: 'l.arcSidearm.glb', cost: 2200, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffd700, isLegendary: true, stats: 'Legendary plasma sidearm emitting high-voltage arcs.' },
  { id: 'l.eclipseRifle', name: 'Eclipse Rifle', file: 'l.eclipseRifle.glb', cost: 2500, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffd700, isLegendary: true, stats: 'Legendary precision assault rifle forged in darkness.' },
  { id: 'l.hyperionMK2', name: 'Hyperion MK-II', file: 'l.hyperionMK2.glb', cost: 2800, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffd700, isLegendary: true, stats: 'Legendary heavy combat platform with hyper-accelerated fire.' },
  { id: 'l.ionStriker', name: 'Ion Striker', file: 'l.ionStriker.glb', cost: 2600, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x66ccff, isLegendary: true, stats: 'Legendary ionized beam weapon with lethal stopping power.' },
  { id: 'l.nova7Blaster', name: 'Nova-7 Blaster', file: 'l.nova7Blaster.glb', cost: 2700, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xff6600, isLegendary: true, stats: 'Legendary solar-energy blaster with devastating burst output.' },
  { id: 'l.photonRipper', name: 'Photon Ripper', file: 'l.photonRipper.glb', cost: 2500, type: 'propWeapon', slot: 'primaryKnife', tracer: null, isLegendary: true, stats: 'Legendary high-frequency photon blade that cleaves cleanly.' },
  { id: 'l.railghostX1', name: 'Railghost X1', file: 'l.railghostX1.glb', cost: 3000, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x00ffff, isLegendary: true, stats: 'Legendary flagship railgun designed for ethereal target elimination.' },
  { id: 'l.spectreXCarbine', name: 'Spectre-X Carbine', file: 'l.spectreXCarbine.glb', cost: 2500, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffd700, isLegendary: true, stats: 'Legendary lightweight carbine optimized for ghost hunters.' },
  { id: 'l.vanguardPulseAR', name: 'Vanguard Pulse AR', file: 'l.vanguardPulseAR.glb', cost: 2750, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffd700, isLegendary: true, stats: 'Legendary pulse assault rifle with automated cadence control.' },
  { id: 'l.voidLance', name: 'Void Lance', file: 'l.voidLance.glb', cost: 2600, type: 'propWeapon', slot: 'secondaryKnife', tracer: 0xcc66ff, isLegendary: true, stats: 'Legendary spectral projectile infused with dark void energy.' },
  { id: 'l.volt9Auto', name: 'Volt-9 Auto', file: 'l.volt9Auto.glb', cost: 2400, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffd700, isLegendary: true, stats: 'Legendary full-auto machine pistol delivering rapid electrostatic rounds.' },

  // — Hunter Weapons (ranged firearms + bows/crossbows) —
  { id: 'alleySweeper', name: 'Alley Sweeper', file: 'alleySweeper.glb', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffe27a, stats: 'Close-quarters street sweeper with formidable spread.' },
  { id: 'ammopistol', name: 'Ammo Pistol', file: 'ammopistol.glb', cost: 500, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffc27a, stats: 'Reliable service pistol with high-capacity magazines.' },
  { id: 'ammoshotgun', name: 'Ammo Shotgun', file: 'ammoshotgun.glb', cost: 700, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffd08a, stats: 'Heavy tactical pump-action shotgun for breach operations.' },
  { id: 'ammosniper', name: 'Ammo Sniper', file: 'ammosniper.glb', cost: 950, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'Bolt-action precision sniper rifle with long-range scope.' },
  { id: 'Arrow', name: 'Arrow', file: 'Arrow.glb', cost: 500, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'Steel-tipped silent hunting arrow.' },
  { id: 'blackoutAR', name: 'Blackout AR', file: 'blackoutAR.glb', cost: 850, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffe27a, stats: 'Suppressed black-ops assault rifle for covert missions.' },
  { id: 'breacher12G', name: 'Breacher 12G', file: 'breacher12G.glb', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffd08a, stats: '12-gauge close-quarters combat shotgun.' },
  { id: 'cryptkeeperAuto', name: 'Cryptkeeper Auto', file: 'cryptkeeperAuto.glb', cost: 900, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffe27a, stats: 'Fully automatic carbine from the forgotten catacombs.' },
  { id: 'duskbreakerAR', name: 'Duskbreaker AR', file: 'duskbreakerAR.glb', cost: 850, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xff8c42, stats: 'Thermal-treated assault rifle that pierces through gloom.' },
  { id: 'graveyardPump', name: 'Graveyard Pump', file: 'graveyardPump.glb', cost: 750, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffd08a, stats: 'Weathered shotgun salvaged from the churchyard.' },
  { id: 'hellhoundMK3', name: 'Hellhound MK-III', file: 'hellhoundMK3.glb', cost: 950, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xff8c42, stats: 'Aggressive rapid-fire assault rifle with fiery muzzle brake.' },
  { id: 'hollowPointMK4', name: 'Hollow Point MK-IV', file: 'hollowPointMK4.glb', cost: 900, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffe27a, stats: 'Chambered for expanding rounds with severe impact shock.' },
  { id: 'ironJudge44', name: 'Iron Judge .44', file: 'ironJudge44.glb', cost: 750, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffc27a, stats: 'Heavy .44 magnum revolver dispensing absolute justice.' },
  { id: 'militiaCarbine', name: 'Militia Carbine', file: 'militiaCarbine.glb', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffe27a, stats: 'Rugged semi-auto carbine favored by resistance fighters.' },
  { id: 'nightshadePistol', name: 'Nightshade Tactical', file: 'nightshadePistol.glb', cost: 650, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffc27a, stats: 'Sleek tactical pistol with toxic nightshade aesthetics.' },
  { id: 'nightwatchDMR', name: 'Nightwatch DMR', file: 'nightwatchDMR.glb', cost: 900, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'Designated marksman rifle with rapid follow-up shot capability.' },
  { id: 'outlawRevolver', name: 'Outlaw Six-Shooter', file: 'outlawRevolver.glb', cost: 700, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffc27a, stats: 'Classic 6-shooter with hair-trigger hammer cocking.' },
  { id: 'paleRider', name: 'Pale Rider', file: 'paleRider.glb', cost: 800, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffc27a, stats: 'Silver-plated hand cannon with ivory grips.' },
  { id: 'Quiver', name: 'Quiver', file: 'Quiver.glb', cost: 600, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'Reinforced leather quiver holding specialized projectile darts.' },
  { id: 'reapersEye', name: "Reaper's Eye", file: 'reapersEye.glb', cost: 1000, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xff8c42, stats: 'Long-range marksman rifle with eerie infrared scope.' },
  { id: 'rustbolt308', name: 'Rustbolt .308', file: 'rustbolt308.glb', cost: 850, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0xffe27a, stats: 'Heavy .308 calibre hunting rifle with oxidized patina.' },
  { id: 'shadow45', name: 'Shadow .45', file: 'shadow45.glb', cost: 600, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffc27a, stats: 'Matte-black .45 caliber semi-automatic sidearm.' },
  { id: 'silentStalker', name: 'Silent Stalker', file: 'silentStalker.glb', cost: 750, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'Aerodynamic silent crossbow tuned for complete silence.' },
  { id: 'watchman9mm', name: 'Watchman 9mm', file: 'watchman9mm.glb', cost: 550, type: 'hunterWeapon', slot: 'secondaryGun', tracer: 0xffc27a, stats: 'Standard security issue 9mm sidearm with crisp trigger pull.' },
  { id: 'whisperingRecurve', name: 'Whispering Recurve', file: 'whisperingRecurve.glb', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'Composite recurve bow delivering silent lethal shafts.' },
  { id: 'widowmaker', name: 'Widowmaker', file: 'widowmaker.glb', cost: 950, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'High-caliber sniper rifle that leaves mourning in its wake.' },
  { id: 'wraithLongshot', name: 'Wraith Longshot', file: 'wraithLongshot.glb', cost: 1100, type: 'hunterWeapon', slot: 'primaryGun', tracer: 0x9fd8ff, stats: 'Mastercrafted anti-materiel rifle with bone-chilling muzzle velocity.' },

  // — Prop Weapons (melee & knives only) —
  { id: 'bloodfangDagger', name: 'Bloodfang Dagger', file: 'bloodfangDagger.glb', cost: 600, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Curved serrated blade designed for swift silent takedowns.' },
  { id: 'bonecrusher', name: 'Bonecrusher', file: 'bonecrusher.glb', cost: 750, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Brutal bludgeoning weapon with devastating impact.' },
  { id: 'cursedCleaver', name: 'Cursed Cleaver', file: 'cursedCleaver.glb', cost: 700, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Heavy butcher cleaver whispering with ancient curses.' },
  { id: 'fieldBlade', name: 'Field Blade', file: 'fieldBlade.glb', cost: 0, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Trusted close-range melee blade.' },
  { id: 'ghostblade', name: 'Ghostblade', file: 'ghostblade.glb', cost: 850, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Semi-translucent blade that cuts without sound.' },
  { id: 'grimHarvester', name: 'Grim Harvester', file: 'grimHarvester.glb', cost: 950, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Razor-sharp scythe blade reminiscent of death himself.' },
  { id: 'ironPry', name: 'Iron Pry', file: 'ironPry.glb', cost: 450, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Hardened iron prybar for cracking doors and skulls.' },
  { id: 'marshCarver', name: 'Marsh Carver', file: 'marshCarver.glb', cost: 650, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Rust-resistant survival knife from the stagnant swamplands.' },
  { id: 'rustyJaw', name: 'Rusty Jaw', file: 'rustyJaw.glb', cost: 500, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Serrated iron jaws re-forged into a savage melee blade.' },
  { id: 'rustyShiv', name: 'Rusty Shiv', file: 'rustyShiv.glb', cost: 400, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Crude improvised blade with tetanus-inducing tip.' },
  { id: 'shadowFang', name: 'Shadow Fang', file: 'shadowFang.glb', cost: 800, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Obsidian dagger shaped like a predatory serpent tooth.' },
  { id: 'skullcracker', name: 'Skullcracker', file: 'skullcracker.glb', cost: 750, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Heavy spiked trench club delivering skull-shattering blows.' },
  { id: 'slaughterhouseCleaver', name: 'Slaughterhouse Cleaver', file: 'slaughterhouseCleaver.glb', cost: 850, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Massive iron cleaver with broad cutting surface.' },
  { id: 'timberRipper', name: 'Timber Ripper', file: 'timberRipper.glb', cost: 700, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Heavy woodsman axe with aggressive ripping teeth.' },
  { id: 'trackersEdge', name: "Tracker's Edge", file: 'trackersEdge.glb', cost: 650, type: 'propWeapon', slot: 'primaryKnife', tracer: null, stats: 'Finely honed Bowie knife for tracking prey across ruins.' }
];

WEAPON_REGISTRY.forEach((weapon) => {
  const isLeg = isLegendaryWeapon(weapon.id);
  const displayName = formatWeaponDisplayName(weapon.id || weapon.file) || weapon.name;
  STORE_CATALOG[weapon.id] = Object.assign({
    color: null,
    tracer: 0xffe27a,
    isLegendary: isLeg
  }, weapon, { name: displayName });
});

const MALE_STARTER_ID = 'Casual_Character';
const FEMALE_STARTER_ID = 'Casual_w';
const STARTER_SKIN_IDS = [MALE_STARTER_ID, FEMALE_STARTER_ID];
const STARTER_BY_GENDER = {
  male:   { id: MALE_STARTER_ID,  file: 'Casual_Character.glb', label: 'Male' },
  female: { id: FEMALE_STARTER_ID, file: 'Casual_w.glb',         label: 'Female' }
};
const LS_STARTER_GENDER = 'prophunt.starterGender';
const LS_STARTER_MODEL  = 'prophunt.starterModel';
const LS_STARTER_SKIN   = 'prophunt.starterSkinId';
const LS_GENDER_LOCKED  = 'prophunt.genderLocked';

const SHOP_SKIN_ORDER = [
  'Beach_Character', 'Casual_w2', 'Farmer', 'Hoodie_Character', 'Worker', 'Worker_w',
  'Adventurer', 'Business_Man', 'Adventurer_w', 'Punk', 'Suit_w', 'Medieval_w',
  'Soldier_w', 'Punk_w', 'Swat', 'King', 'Witch_w', 'Sci_Fi_Character_w', 'Astronaut'
];

const LS_EQUIPPED_SKIN = 'prophunt.equippedSkin';

function cleanSkinId(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  let s = rawId.trim().split('?')[0].split('#')[0];
  const parts = s.split(/[\/\\]/);
  s = parts[parts.length - 1];
  return s.replace(/\.glb$/i, '').trim();
}

function readSavedEquippedSkin() {
  try {
    const saved = localStorage.getItem(LS_EQUIPPED_SKIN);
    const clean = cleanSkinId(saved);
    if (clean && STORE_CATALOG[clean] && STORE_CATALOG[clean].type === 'skin') {
      return clean;
    }
  } catch (e) {}
  return null;
}

function persistEquippedSkin(skinId) {
  if (!skinId) return;
  const clean = cleanSkinId(skinId) || skinId;
  if (!STORE_CATALOG[clean] || STORE_CATALOG[clean].type !== 'skin') return;
  myEquippedSkin = clean;
  myLoadout.equippedSkin = clean;
  window.__myEquippedSkin = clean;
  try {
    localStorage.setItem(LS_EQUIPPED_SKIN, clean);
    localStorage.setItem('prophunt.starterSkinId', clean);
  } catch (e) {}
}

const LOADOUT_SLOTS = ['equippedSkin', 'primaryGun', 'secondaryGun', 'primaryKnife', 'secondaryKnife'];
const DEFAULT_LOADOUT = {
  equippedSkin: readSavedEquippedSkin() || MALE_STARTER_ID,
  primaryGun: 'standardRifle',
  secondaryGun: 'sidearmPistol',
  primaryKnife: 'fieldBlade',
  secondaryKnife: 'throwingKnife'
};
const FREE_WEAPON_IDS = ['standardRifle', 'sidearmPistol', 'fieldBlade', 'throwingKnife'];
const DEFAULT_INVENTORY = FREE_WEAPON_IDS.slice();

function guaranteedStarterSkinId() {
  return STARTER_SKIN_IDS.includes(chosenStarterSkinId) ? chosenStarterSkinId : MALE_STARTER_ID;
}
function defaultEquippedSkinId() {
  const saved = readSavedEquippedSkin();
  if (saved && STORE_CATALOG[saved]) return saved;
  return guaranteedStarterSkinId();
}

const STORE_CATEGORIES = [
  { type: 'skin',           slot: 'equippedSkin',   label: 'Player Skins' },
  { type: 'hunterWeapon',                           label: 'Hunter Weapons' },
  { type: 'propWeapon',                             label: 'Prop Weapons' }
];

let STORE_ITEM_IDS = Object.keys(STORE_CATALOG);
function getStoreItemIds() {
  return Object.keys(STORE_CATALOG);
}

const LOADOUT_SLOT_UI = [
  { slot: 'primaryGun',     type: 'primaryGun',     keyLabel: 'KEY 1', label: 'Primary Weapon' },
  { slot: 'secondaryGun',   type: 'secondaryGun',   keyLabel: 'KEY 2', label: 'Secondary Weapon' },
  { slot: 'primaryKnife',   type: 'primaryKnife',   keyLabel: 'MELEE', label: 'Primary Knife' },
  { slot: 'secondaryKnife', type: 'secondaryKnife', keyLabel: 'THROW',  label: 'Secondary Knife' }
];

const STORE_SWATCH_CLASS = {
  default: 'sw-skin-default', shadowHunter: 'shadow', steelProp: 'steel',
  standardRifle: 'sw-gun-standard', shotgun: 'sw-gun-shotgun', vulcanRifle: 'sw-gun-vulcan',
  longshotMk2: 'sw-gun-longshot', sidearmPistol: 'sw-gun-sidearm', revolver: 'sw-gun-revolver',
  viperSMG: 'sw-gun-viper', fieldBlade: 'sw-knife-field', carbonCleaver: 'sw-knife-carbon',
  throwingKnife: 'sw-knife-throwing', phantomDagger: 'sw-knife-phantom'
};

const PREVIEW_LOADOUT_SLOTS = [
  { slot: 'equippedSkin', label: 'Skin' },
  { slot: 'primaryGun', label: 'Key 1 · Primary' },
  { slot: 'secondaryGun', label: 'Key 2 · Secondary' },
  { slot: 'primaryKnife', label: 'Melee' },
  { slot: 'secondaryKnife', label: 'Throw' }
];

const STORE_TAB_COPY = {
  shop: 'Spend coins from eliminations and survival. Purchases are saved to your account.',
  inventory: 'Equip owned skins, guns and knives. Your loadout is saved to your account.'
};

const STORE_RARITY_TIERS = [
  { maxCost: 0,    key: 'starter',   label: 'Starter',   theme: 'Base kit issued to every recruit.' },
  { maxCost: 650,  key: 'common',    label: 'Common',    theme: 'Everyday field cosmetic.' },
  { maxCost: 900,  key: 'rare',      label: 'Rare',      theme: 'Limited-run gear, seen rarely in the lobby.' },
  { maxCost: 1500, key: 'epic',      label: 'Epic',      theme: 'Signature collector line with custom flair.' },
  { maxCost: Infinity, key: 'legendary', label: 'Legendary', theme: 'Top-shelf flagship — the store’s crown jewel.' }
];

function storeItemRarity(item) {
  if (item && (item.isLegendary || (typeof item.id === 'string' && item.id.startsWith('l.')))) {
    return { maxCost: Infinity, key: 'legendary', label: 'LEGENDARY', theme: 'Legendary flagship weapon — pinnacle of cursed craftsmanship.' };
  }
  const cost = item && typeof item.cost === 'number' ? item.cost : 0;
  for (const tier of STORE_RARITY_TIERS) {
    if (cost <= tier.maxCost) return tier;
  }
  return STORE_RARITY_TIERS[STORE_RARITY_TIERS.length - 1];
}

let myCoins = 0;
let myInventory = DEFAULT_INVENTORY.slice();
let myLoadout = Object.assign({}, DEFAULT_LOADOUT);
let myEquippedSkin = DEFAULT_LOADOUT.equippedSkin;
let isRegistered = false;
let myUsername = null;
let myDisplayName = 'Guest_' + String(persistentPlayerId).slice(-4);

let starterGender = null;
let chosenStarterSkinId = null;
let hasChosenStarter = false;
let isGenderLocked = false;

const mainMenu = document.getElementById('main-menu');
const menuButtonsRoot = document.getElementById('menu-buttons-root');
const menuButtonsZones = document.getElementById('menu-buttons-zones');
const btnZonesBack = document.getElementById('btn-zones-back');
const roomCodeInput = document.getElementById('room-code-input');
const joinErrorEl = document.getElementById('join-error');
const roomCodeDisplay = document.getElementById('room-code-display');
const deathScreen = document.getElementById('death-screen');
const hudHint = document.getElementById('hint');
const hudRoleDisplay = document.getElementById('roleDisplay');
const hudLeaderboard = document.getElementById('leaderboard');
const hudHealthBar = document.getElementById('health-bar-container');
const hudHealthFill = document.getElementById('health-fill');
const hudHealthText = document.getElementById('health-text');
const hunterRegenIcon = document.getElementById('hunter-regen-icon');
const propHealIndicator = document.getElementById('prop-heal-indicator');
const propHealStatusText = document.getElementById('prop-heal-status-text');
const healProgressContainer = document.getElementById('heal-progress-container');
const healProgressFill = document.getElementById('heal-progress-fill');
const weaponHud = document.getElementById('weaponHud');
const weaponHudName = document.getElementById('weaponHudName');
const weaponHudAmmo = document.getElementById('weaponHudAmmo');
const weaponHudReload = document.getElementById('weaponHudReload');
const weaponHudKnife = document.getElementById('weaponHudKnife');
const loadingOverlay = document.getElementById('loadingOverlay');
const crosshair = document.getElementById('crosshair');
const lockHint = document.getElementById('lockHint');
const damageFlashEl = document.getElementById('damageFlash');
const matchTimerEl = document.getElementById('matchTimer');
const matchOverOverlay = document.getElementById('matchOverOverlay');
const matchOverTitle = document.getElementById('matchOverTitle');
const matchOverSubtitle = document.getElementById('matchOverSubtitle');
const matchOverCountdown = document.getElementById('matchOverCountdown');
const topCenterHud = document.getElementById('topCenterHud');
const roomCodeBar = document.getElementById('roomCodeBar');
const roomCodeSmallText = document.getElementById('roomCodeSmallText');
const copyRoomCodeBtn = document.getElementById('copy-room-code');
const lobbyPanel = document.getElementById('lobbyPanel');
const lobbyStatus = document.getElementById('lobbyStatus');
const startMatchBtn = document.getElementById('start-match-btn');
const mapInfoEl = document.getElementById('mapInfo');

const lobbyComputerHint = document.getElementById('lobbyComputerHint');
const hostSettingsOverlay = document.getElementById('hostSettingsOverlay');
const settingsZoneSelect = document.getElementById('settingsZoneSelect');
const settingsTimeSelect = document.getElementById('settingsTimeSelect');
const settingsApplyBtn = document.getElementById('settingsApplyBtn');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const storeOverlay = document.getElementById('storeOverlay');
const storeCoinBalance = document.getElementById('storeCoinBalance');
const storeStatus = document.getElementById('storeStatus');
const storeCloseBtn = document.getElementById('storeCloseBtn');
const storeTabShop = document.getElementById('storeTab-shop');
const storeTabInventory = document.getElementById('storeTab-inventory');
const storeTabContentShop = document.getElementById('storeTabContent-shop');
const storeTabContentInventory = document.getElementById('storeTabContent-inventory');
const storeTabSubtitle = document.getElementById('storeTabSubtitle');
const shopItemsEl = document.getElementById('shopItems');
const inventoryLoadoutSlotsEl = document.getElementById('inventoryLoadoutSlots');
const inventoryItemsEl = document.getElementById('inventoryItems');
const previewFigure = document.getElementById('previewFigure');
const previewSkinName = document.getElementById('previewSkinName');
const previewLoadout = document.getElementById('previewLoadout');
const characterHoverPreview = document.getElementById('characterHoverPreview');
const chpImage = document.getElementById('chpImage');
const chpFallback = document.getElementById('chpFallback');
const chpTitle = document.getElementById('chpTitle');
const chpRarity = document.getElementById('chpRarity');
const chpTheme = document.getElementById('chpTheme');
const chpCost = document.getElementById('chpCost');
const storePanelEl = storeOverlay ? storeOverlay.querySelector('.store-panel') : null;
let activeStoreTab = 'shop';

// 360-Degree Interactive 3D Preview Modal & Two-Step Buy Confirmation Modal elements
const storePreviewModal = document.getElementById('storePreviewModal');
const preview3dBox = document.getElementById('preview3dBox');
const preview3dTitle = document.getElementById('preview3dTitle');
const preview3dBadge = document.getElementById('preview3dBadge');
const preview3dCloseBtn = document.getElementById('preview3dCloseBtn');
const preview3dCanvasContainer = document.getElementById('preview3dCanvasContainer');
const preview3dLoading = document.getElementById('preview3dLoading');
const preview3dCost = document.getElementById('preview3dCost');
const preview3dStatus = document.getElementById('preview3dStatus');
const preview3dActionBtn = document.getElementById('preview3dActionBtn');

const storeBuyConfirmModal = document.getElementById('storeBuyConfirmModal');
const confirmBuyPrompt = document.getElementById('confirmBuyPrompt');
const confirmItemName = document.getElementById('confirmItemName');
const confirmItemPrice = document.getElementById('confirmItemPrice');
const confirmBuyYesBtn = document.getElementById('confirmBuyYesBtn');
const confirmBuyNoBtn = document.getElementById('confirmBuyNoBtn');

let preview3dRenderer = null;
let preview3dScene = null;
let preview3dCamera = null;
let preview3dPivot = null;
let preview3dAnimId = null;
let active3dPreviewItem = null;
let isPreview3dDragging = false;
let preview3dPointerStart = { x: 0, y: 0 };
let preview3dActive = false;
const previewGltfLoader = new GLTFLoader();
const authOverlay = document.getElementById('authOverlay');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authRegisterBtn = document.getElementById('authRegisterBtn');
const authLoginBtn = document.getElementById('authLoginBtn');
const authCloseBtn = document.getElementById('authCloseBtn');
const btnAuth = document.getElementById('btn-auth');
const menuAccountLabel = document.getElementById('menuAccountLabel');

const starterOverlay = document.getElementById('starterOverlay');
const starterConfirmBtn = document.getElementById('starterConfirmBtn');
const starterStatus = document.getElementById('starterStatus');
const starterRadios = Array.prototype.slice.call(document.querySelectorAll('input[name="starter-gender"]'));
const btnCharacter = document.getElementById('btn-character');

const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
const MINIMAP_RANGE = 700;

let radarContacts = {};

// ===========================
// Three.js Setup
// ===========================
let scene, camera, renderer, controls;
let floorMesh;
let ambientLight, directionalLight, hemisphereLight;
let sunTarget;
let mapGroup, propGroup, playerGroup, tracerGroup;
let gridHelper;

let audioListener = null;
let fountainAudioBuffer = null;
let fountainAudioReady = false;
const fountains = []; // populated automatically when oldCityCenterMap.glb loads

// --- Footstep audio settings ---
let footstepSound = null;
let footstepAudioReady = false;
let footstepTimer = 0;
const FOOTSTEP_INTERVAL = 0.4; // Time interval between footstep sounds

// --- Concrete path footstep audio settings ---
// Surface-aware footsteps: when the player walks on any block whose name
// contains "Path_Straight", the concrete footstep plays instead of the default one.
let concreteFootstepSound = null;
let concreteAudioReady = false;
let isOnConcretePath = false;

// --- Jump-landing audio settings ---
let landingSound = null;
let landingAudioReady = false;
let wasInAir = false; // Tracks if the player was previously airborne

// --- Gunshot audio settings ---
let gunshotSound = null;
let gunshotAudioReady = false;

// --- Monster screech audio settings (skeleton aggro / rest) ---
let screechRunSound = null;
let screechRunReady = false;
let screechRestSound = null;
let screechRestReady = false;
let skeletonWasChasing = false; // Tracks state transitions

const FOUNTAIN_PARTICLE_COUNT = 500;  // particles per fountain
const FOUNTAIN_SPAWN_OFFSET_Y = 60;   // particles emit this far above each fountain's origin
const FOUNTAIN_BASIN_OFFSET_Y = -5;   // particles respawn once they fall this far below the origin
const FOUNTAIN_GRAVITY = 60;

const mapMeshes = [];
let propMeshes = [];
const playerMeshes = {};
const tracers = [];

let lobbyComputerGroup = null;
let lobbyComputerCubeMat = null;
let crateTemplate = null;
let ghoulTemplate = null;
let npcMixers = {};

const GHOUL_MAX_HITS      = 8;
const NPC_POS_LERP_SPEED  = 12;
const NPC_ANIM_BLEND_SPEED= 6;
const NPC_WALK_TIME_SCALE = 1.0;
const NPC_RUN_TIME_SCALE  = 1.7;
const NPC_FACE_MIN_DIST_SQ= 0.25;

const frameClock = new THREE.Clock();

const tmpForward = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpMinimapDir = new THREE.Vector3();
const npcScratch = new THREE.Vector3();

const DAY_CYCLE_MS       = 120000;
const SUN_ORBIT_RADIUS   = 1800;
const SUN_DISTANCE_Y     = 2200;
const DAYTIME_INTENSITY  = 0.9;
const NIGHTTIME_INTENSITY = 0.0;
const DAY_HEMISPHERE     = 0.5;
const NIGHT_HEMISPHERE   = 0.12;
const SUN_WARMUP_SPEED   = 1.5;
const DAY_GROUND_COLOR   = new THREE.Color(0x6b4630);
const NIGHT_SKY_COLOR    = new THREE.Color(0x0a1020);
const NIGHT_FOG_COLOR    = new THREE.Color(0x10151f);
const DAY_AMBIENT        = 0.75;
const NIGHT_AMBIENT      = 0.2;

const _sunPos = new THREE.Vector3();
const _sunColor = new THREE.Color();
const _hemiColor = new THREE.Color();

function sunElevationToDaylight(height) {
  return THREE.MathUtils.clamp(height * SUN_WARMUP_SPEED, 0, 1);
}

function updateDayNightCycle(dt) {
  if (!directionalLight || !hemisphereLight || !sunTarget) return;

  const dayPhase = (performance.now() % DAY_CYCLE_MS) / DAY_CYCLE_MS;
  const angle = dayPhase * Math.PI * 2;

  _sunPos.set(
    Math.cos(angle) * SUN_ORBIT_RADIUS,
    0,
    Math.sin(angle) * SUN_ORBIT_RADIUS
  );

  const sunHeight = Math.sin(angle);
  _sunPos.y = Math.max(sunHeight, -0.15) * SUN_DISTANCE_Y;
  directionalLight.position.copy(_sunPos);
  directionalLight.target.position.copy(sunTarget.position);
  directionalLight.target.updateMatrixWorld();

  const daylight = sunElevationToDaylight(sunHeight);

  _sunColor.copy(NIGHT_SKY_COLOR);
  if (daylight > 0) {
    _sunColor.copy(_hemiColor.set(0xffb27a)).lerp(_hemiColor.set(0xffffff), daylight);
  }
  directionalLight.color.copy(_sunColor);
  directionalLight.intensity = NIGHTTIME_INTENSITY + (DAYTIME_INTENSITY - NIGHTTIME_INTENSITY) * daylight;

  _hemiColor.copy(NIGHT_SKY_COLOR);
  _hemiColor.lerp(_hemiColor.set(0xffc9a3), 0.25 * daylight);
  _hemiColor.lerp(_hemiColor.set(0xffffff), Math.max(0, daylight - 0.5) * 2 * 0.55);
  hemisphereLight.color.copy(_hemiColor);
  hemisphereLight.groundColor.copy(DAY_GROUND_COLOR);
  hemisphereLight.intensity = NIGHT_HEMISPHERE + (DAY_HEMISPHERE - NIGHT_HEMISPHERE) * daylight;

  if (ambientLight) {
    ambientLight.intensity = NIGHT_AMBIENT + (DAY_AMBIENT - NIGHT_AMBIENT) * daylight;
  }
  if (scene) {
    scene.background.copy(_sunColor.set(0x87ceeb)).lerp(NIGHT_SKY_COLOR, 1 - daylight);
    scene.fog.color.copy(_sunColor.set(0xcde6c7)).lerp(NIGHT_FOG_COLOR, 1 - daylight);
  }
}

function disposeZoneVisuals(group) {
  if (!group) return;
  group.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) {
      if (material.map) material.map.dispose();
      material.dispose();
    }
  });
}

function createPowerShieldTexture(repeatX, repeatY) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i <= 256; i += 32) {
    const major = i % 128 === 0;
    ctx.strokeStyle = major ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.62)';
    ctx.lineWidth = major ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createZoneVisuals(zone) {
  if (!scene || !zone) return;
  if (zoneVisualGroup) {
    scene.remove(zoneVisualGroup);
    disposeZoneVisuals(zoneVisualGroup);
  }

  zoneVisualGroup = new THREE.Group();
  zoneVisualGroup.name = 'districtPowerShield';
  const shieldHeight = 180;

  const makeShieldWall = (length, x, z, rotationY = 0) => {
    const texture = createPowerShieldTexture(length / 140, shieldHeight / 45);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      map: texture,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const geometry = new THREE.PlaneGeometry(length, shieldHeight);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, shieldHeight / 2, z);
    mesh.rotation.y = rotationY;
    mesh.renderOrder = 3;
    zoneVisualGroup.add(mesh);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    edge.position.copy(mesh.position);
    edge.rotation.copy(mesh.rotation);
    edge.renderOrder = 4;
    zoneVisualGroup.add(edge);
  };

  const width = zone.maxX - zone.minX;
  const depth = zone.maxZ - zone.minZ;
  const centerX = (zone.minX + zone.maxX) / 2;
  const centerZ = (zone.minZ + zone.maxZ) / 2;
  makeShieldWall(width, centerX, zone.minZ);
  makeShieldWall(width, centerX, zone.maxZ);
  makeShieldWall(depth, zone.minX, centerZ, Math.PI / 2);
  makeShieldWall(depth, zone.maxX, centerZ, Math.PI / 2);

  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 220;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(5,20,35,0.78)';
  ctx.fillRect(10, 10, 1580, 200);
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 1580, 200);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(zone.name, 800, 110);
  const signTexture = new THREE.CanvasTexture(canvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture, transparent: true, depthTest: false }));
  sign.position.set(centerX, 260, centerZ);
  sign.scale.set(Math.min(1400, Math.max(340, width * 0.7)), 193, 1);
  zoneVisualGroup.add(sign);
  scene.add(zoneVisualGroup);
}

function createStagingLobbyVisuals() {
  if (!scene) return;
  const old = scene.getObjectByName('stagingLobbyVisuals'); if (old) scene.remove(old);
  const group = new THREE.Group(); group.name = 'stagingLobbyVisuals';
  const cx = (LOBBY_AREA.minX + LOBBY_AREA.maxX) / 2, cz = (LOBBY_AREA.minZ + LOBBY_AREA.maxZ) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({color:0x183a4a, roughness:.75})); floor.rotation.x=-Math.PI/2; floor.position.set(cx,.35,cz); group.add(floor);
  const wallMat=new THREE.MeshStandardMaterial({color:0x2a6b80, emissive:0x0c2730, transparent:true, opacity:.82});
  [[400,12,cx,cz-200],[400,12,cx,cz+200],[12,400,cx-200,cz],[12,400,cx+200,cz]].forEach(([w,d,x,z])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,65,d),wallMat);m.position.set(x,32,z);group.add(m);});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(55,2,10,36),new THREE.MeshBasicMaterial({color:0x8ee8ff})); ring.rotation.x=Math.PI/2;ring.position.set(cx,1,cz);group.add(ring);

  lobbyComputerGroup = new THREE.Group();
  lobbyComputerGroup.name = 'lobbyComputer';

  const cubeSize = 26;
  const cubeMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffaa00,
    emissiveIntensity: 0.75,
    metalness: 0.45,
    roughness: 0.25
  });
  lobbyComputerCubeMat = cubeMat;
  const cube = new THREE.Mesh(new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize), cubeMat);
  cube.position.set(0, cubeSize / 2 + 2, 0);
  cube.castShadow = true;
  cube.receiveShadow = true;
  lobbyComputerGroup.add(cube);

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(cubeSize + 3, cubeSize + 3, cubeSize + 3),
    new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true, transparent: true, opacity: 0.35 })
  );
  shell.position.copy(cube.position);
  lobbyComputerGroup.add(shell);

  const ringGeo = new THREE.RingGeometry(cubeSize * 1.15, cubeSize * 1.45, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const decal = new THREE.Mesh(ringGeo, ringMat);
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(0, 0.6, 0);
  lobbyComputerGroup.add(decal);

  const glow = new THREE.PointLight(0xffd700, 150, 260, 1.6);
  glow.position.set(0, cubeSize + 10, 0);
  lobbyComputerGroup.add(glow);

  lobbyComputerGroup.position.set(cx, 0, cz);
  group.add(lobbyComputerGroup);
  scene.add(group);
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0xcde6c7, 600, 2200);

  camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.set(localX || worldWidth / 2, PLAYER_EYE_HEIGHT, localZ || worldHeight / 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambientLight);

  hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x6b4630, 0.5);
  hemisphereLight.position.set(0, 100, 0);
  scene.add(hemisphereLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
  directionalLight.position.set(120, 200, 80);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 2000;
  directionalLight.shadow.camera.left = -800;
  directionalLight.shadow.camera.right = 800;
  directionalLight.shadow.camera.top = 800;
  directionalLight.shadow.camera.bottom = -800;
  scene.add(directionalLight);

  sunTarget = new THREE.Object3D();
  sunTarget.position.set(worldWidth / 2, 0, worldHeight / 2);
  scene.add(sunTarget);
  directionalLight.target = sunTarget;

  const floorGeo = new THREE.PlaneGeometry(worldWidth, worldHeight);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xa36405, side: THREE.DoubleSide });
  floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(worldWidth / 2, 0, worldHeight / 2);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  gridHelper = new THREE.GridHelper(Math.max(worldWidth, worldHeight), Math.max(worldWidth, worldHeight) / GRID_SIZE, 0x000000, 0x000000);
  gridHelper.material.opacity = 0.08;
  gridHelper.material.transparent = true;
  gridHelper.position.set(worldWidth / 2, 0.2, worldHeight / 2);
  scene.add(gridHelper);

  mapGroup = new THREE.Group();
  propGroup = new THREE.Group();
  playerGroup = new THREE.Group();
  tracerGroup = new THREE.Group();
  scene.add(mapGroup);
  scene.add(propGroup);
  scene.add(playerGroup);
  scene.add(tracerGroup);

  audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  // The water loop is loaded ONCE — every auto-discovered fountain shares this buffer.
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load('fountain.mp3', (buffer) => {
      fountainAudioBuffer = buffer;
      fountainAudioReady = true;
      // The map may have finished loading first: attach the buffer to fountains that already exist.
      for (const fountain of fountains) {
        if (fountain.sound && !fountain.sound.buffer) configureFountainSound(fountain.sound, buffer);
      }
      if (controls && controls.isLocked) startFountainAudio();
    }, undefined, (error) => console.error('FAILED to load fountain.mp3:', error));

  // Player footstep SFX — non-positional, attached to the camera's audio listener.
  const footstepAudioLoader = new THREE.AudioLoader();
  footstepSound = new THREE.Audio(audioListener);
  footstepAudioLoader.load('footstep.mp3', (buffer) => {
    footstepSound.setBuffer(buffer);
    footstepSound.setVolume(0.5);
    footstepAudioReady = true;
  }, undefined, (err) => console.error("Failed to load footstep.mp3", err));

  // Concrete-path footstep SFX — played while walking on "Path_Straight" blocks.
  const concreteAudioLoader = new THREE.AudioLoader();
  concreteFootstepSound = new THREE.Audio(audioListener);
  concreteAudioLoader.load('footsteponconcrete.mp3', (buffer) => {
    concreteFootstepSound.setBuffer(buffer);
    concreteFootstepSound.setVolume(0.6);
    concreteAudioReady = true;
  }, undefined, (err) => console.error("Failed to load footsteponconcrete.mp3", err));

  // Player jump-landing SFX — non-positional, attached to the camera's audio listener.
  const landingAudioLoader = new THREE.AudioLoader();
  landingSound = new THREE.Audio(audioListener);
  landingAudioLoader.load('jumplanding.mp3', (buffer) => {
    landingSound.setBuffer(buffer);
    landingSound.setVolume(0.6); // Adjust volume here (0.0 to 1.0)
    landingAudioReady = true;
  }, undefined, (err) => console.error("Failed to load jumplanding.mp3", err));

  const gunshotAudioLoader = new THREE.AudioLoader();
  gunshotSound = new THREE.Audio(audioListener);
  gunshotAudioLoader.load('gunshot.mp3', (buffer) => {
    gunshotSound.setBuffer(buffer);
    gunshotSound.setVolume(0.7); // Adjust volume (0.0 to 1.0)
    gunshotAudioReady = true;
  }, undefined, (err) => console.error("Failed to load gunshot.mp3", err));

  // Skeleton screech SFX — non-positional, attached to the camera's audio listener.
  // (Named screechAudioLoader because 'audioLoader' is already declared above for the fountain.)
  const screechAudioLoader = new THREE.AudioLoader();

  // Run/Aggro sound
  screechRunSound = new THREE.Audio(audioListener);
  screechAudioLoader.load('monsterscreechrun.mp3', (buffer) => {
    screechRunSound.setBuffer(buffer);
    screechRunSound.setVolume(0.8);
    screechRunReady = true;
  }, undefined, (err) => console.error("Failed to load monsterscreechrun.mp3", err));

  // Rest/Return sound
  screechRestSound = new THREE.Audio(audioListener);
  screechAudioLoader.load('monsterscreechrest.mp3', (buffer) => {
    screechRestSound.setBuffer(buffer);
    screechRestSound.setVolume(0.8);
    screechRestReady = true;
  }, undefined, (err) => console.error("Failed to load monsterscreechrest.mp3", err));

  controls = new PointerLockControls(camera, renderer.domElement);

  // Expose to window for index.html settings / fog controls
  window.__gameScene = scene;
  window.__gameCamera = camera;
  window.__gameRenderer = renderer;
  window.__gameControls = controls;
  window.__gameAudioListener = audioListener;
  window.__playerGroup = playerGroup;
  window.__players = players;
  window.__playerMeshes = playerMeshes;
  window.__gameSfxSounds = [footstepSound, concreteFootstepSound, landingSound, gunshotSound, screechRunSound, screechRestSound];
  if (window.__applyGameSettings) {
    try { window.__applyGameSettings(); } catch (e) {}
  }

  controls.addEventListener('lock', () => {
    if (crosshair) crosshair.classList.remove('hidden');
    if (lockHint) lockHint.classList.add('hidden');
    if (audioListener && audioListener.context.state === 'suspended') {
      audioListener.context.resume();
    }
    startFountainAudio();
  });
  controls.addEventListener('unlock', () => {
    resetInputState();
    if (!hasJoined || !amAlive || !mainMenu.classList.contains('hidden') || !deathScreen.classList.contains('hidden')) {
      if (crosshair) crosshair.classList.add('hidden');
      if (lockHint) lockHint.classList.add('hidden');
    } else {
      if (crosshair) crosshair.classList.remove('hidden');
      if (lockHint) lockHint.classList.remove('hidden');
    }
  });

  window.addEventListener('resize', onWindowResize);
  
  
  // --- AUTO-TILING FLOOR (seamless tiles stretched across the full world) ---
  loadMapModel('Wasteland_clear.glb').then(template => {
    const TILE_SIZE = 150; 
    const scaleX = TILE_SIZE / (template.size.x || 100);
    const scaleZ = TILE_SIZE / (template.size.z || 100);
    for (let x = 0; x < 3000; x += TILE_SIZE) {
      for (let z = 0; z < 3000; z += TILE_SIZE) {
        const clone = SkeletonUtils.clone(template.scene);
        clone.scale.set(scaleX, 1, scaleZ);
        clone.position.set(x + (TILE_SIZE / 2), 0, z + (TILE_SIZE / 2));
        mapGroup.add(clone);
      }
    }
  }).catch(err => console.error("Error loading floor:", err));

	const gltfLoader = new GLTFLoader();
  
	// Initialize Draco loader for compressed map files
	const dracoLoader = new DRACOLoader();
	dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
	gltfLoader.setDRACOLoader(dracoLoader);

	gltfLoader.load('oldCityCenterMap.glb', function(gltf) {
      const myCustomMap = gltf.scene;
      myCustomMap.position.set(1500, 1, 1500);
      myCustomMap.scale.set(1, 1, 1);
      mapGroup.add(myCustomMap);

      // Refresh world matrices so getWorldPosition() returns final coordinates.
      myCustomMap.updateMatrixWorld(true);

      const pos = new THREE.Vector3();
      let discovered = 0;

      // --- AUTO-DISCOVER EVERY FOUNTAIN: no hardcoded coordinates needed ---
      myCustomMap.traverse((node) => {
        if (!node.name || node.name.toLowerCase().indexOf('fountain') === -1) return;

        // If this node sits inside another fountain-named node, skip it so a
        // fountain built from several named submeshes only spawns ONE system.
        let ancestor = node.parent;
        while (ancestor) {
          if (ancestor.name && ancestor.name.toLowerCase().indexOf('fountain') !== -1) return;
          ancestor = ancestor.parent;
        }

        node.getWorldPosition(pos);         // 1) world position of the fountain
        createFountain(pos, node.name);     // 2-4) particles + positional audio + register
        discovered++;
		});

      console.log(`[fountains] Auto-discovered ${discovered} fountain(s) in oldCityCenterMap.glb`);
		}, undefined, function(error) {
		console.error("Error loading objects map:", error);
		});
	}

function startFountainAudio() {
  if (!fountainAudioReady) return;
  for (const fountain of fountains) {
    const sound = fountain.sound;
    if (!sound || !sound.buffer || sound.isPlaying) continue;
    try { sound.play(); } catch (err) {}
  }
}


function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function loadCrateModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(CRATE_MODEL_URL, (gltf) => {
        const modelScene = gltf.scene;
        const box = new THREE.Box3().setFromObject(modelScene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const offsetX = -center.x;
        const offsetY = -box.min.y;
        const offsetZ = -center.z;
        modelScene.position.set(offsetX, offsetY, offsetZ);
        modelScene.updateMatrixWorld(true);

        const normalizedBox = new THREE.Box3().setFromObject(modelScene);
        const normalizedSize = new THREE.Vector3();
        const normalizedCenter = new THREE.Vector3();
        normalizedBox.getSize(normalizedSize);
        normalizedBox.getCenter(normalizedCenter);

        modelScene.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        resolve({ scene: modelScene, size: normalizedSize, center: normalizedCenter });
      }, undefined, (error) => reject(error));
  });
}

function loadGhoulModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load('ghoul.glb', (gltf) => {
        const modelScene = gltf.scene;
        modelScene.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        resolve({ scene: gltf.scene, animations: gltf.animations });
      }, undefined, (error) => reject(error));
  });
}

// ===========================
// Character Skin System
// ===========================
// CHARACTER SKINS & 3D MODELS
// ===========================
const skinGLTFLoader = new GLTFLoader();
const skinModelCache = {};
const skinModelPromises = {};

const CHARACTER_RUN_SPEED = 55;
const CHARACTER_WALK_SPEED = 3;
const CHARACTER_ANIM_FADE = 0.2;

const playerMixers = {};

// Procedural 3D Visual Themes (All 23 Skins)
const STORE_SKIN_STYLES = {
  Casual_Character: {
    name: 'Casual Character',
    torsoColor: 0x2b3e50,
    torsoRoughness: 0.75,
    torsoMetalness: 0.1,
    vestColor: 0x3d566e,
    vestRoughness: 0.65,
    vestMetalness: 0.15,
    pantsColor: 0x1f2937,
    armColor: 0x2b3e50,
    headColor: 0x4a3b32,
    visorColor: 0x00d4ff
  },
  Casual_w: {
    name: 'Casual Female',
    torsoColor: 0x2e4a3d,
    torsoRoughness: 0.7,
    torsoMetalness: 0.1,
    vestColor: 0x233a30,
    vestRoughness: 0.65,
    vestMetalness: 0.15,
    pantsColor: 0x1f2421,
    armColor: 0x2e4a3d,
    headColor: 0x3d2b1f,
    visorColor: 0x2ecc71
  },
  Beach_Character: {
    name: 'Beach Character',
    torsoColor: 0x00a896,
    torsoRoughness: 0.8,
    torsoMetalness: 0.05,
    vestColor: 0xf4a261,
    vestRoughness: 0.75,
    vestMetalness: 0.05,
    pantsColor: 0xe9c46a,
    armColor: 0x00a896,
    headColor: 0xe76f51,
    visorColor: 0xffd166,
    accent: 'beach'
  },
  Casual_w2: {
    name: 'Casual Female 2',
    torsoColor: 0x800e34,
    torsoRoughness: 0.6,
    torsoMetalness: 0.15,
    vestColor: 0x4a091d,
    vestRoughness: 0.7,
    vestMetalness: 0.1,
    pantsColor: 0x2b2d42,
    armColor: 0x800e34,
    headColor: 0x1f1a24,
    visorColor: 0xe056fd
  },
  Farmer: {
    name: 'Farmer',
    torsoColor: 0xb03a2e,
    torsoRoughness: 0.85,
    torsoMetalness: 0.05,
    vestColor: 0x78281f,
    vestRoughness: 0.8,
    vestMetalness: 0.1,
    pantsColor: 0x1b4f72,
    armColor: 0xb03a2e,
    headColor: 0x6e2c00,
    visorColor: 0xf39c12,
    accent: 'farmer'
  },
  Hoodie_Character: {
    name: 'Hoodie Character',
    torsoColor: 0x1c2833,
    torsoRoughness: 0.8,
    torsoMetalness: 0.1,
    vestColor: 0x273746,
    vestRoughness: 0.7,
    vestMetalness: 0.15,
    pantsColor: 0x17202a,
    armColor: 0x1c2833,
    headColor: 0x212f3d,
    visorColor: 0x58d68d,
    accent: 'hoodie'
  },
  Worker: {
    name: 'Worker',
    torsoColor: 0xd35400,
    torsoRoughness: 0.65,
    torsoMetalness: 0.2,
    vestColor: 0xe67e22,
    vestRoughness: 0.6,
    vestMetalness: 0.25,
    pantsColor: 0x2c3e50,
    armColor: 0xd35400,
    headColor: 0xf1c40f,
    visorColor: 0xf39c12,
    accent: 'worker'
  },
  Worker_w: {
    name: 'Worker Female',
    torsoColor: 0xe67e22,
    torsoRoughness: 0.65,
    torsoMetalness: 0.2,
    vestColor: 0xd35400,
    vestRoughness: 0.6,
    vestMetalness: 0.25,
    pantsColor: 0x34495e,
    armColor: 0xe67e22,
    headColor: 0xf39c12,
    visorColor: 0xf1c40f,
    accent: 'worker'
  },
  Adventurer: {
    name: 'Adventurer',
    torsoColor: 0x5d6d7e,
    torsoRoughness: 0.7,
    torsoMetalness: 0.2,
    vestColor: 0x34495e,
    vestRoughness: 0.65,
    vestMetalness: 0.2,
    pantsColor: 0x212f3d,
    armColor: 0x5d6d7e,
    headColor: 0x6e2c00,
    visorColor: 0x5dade2,
    accent: 'adventurer'
  },
  Business_Man: {
    name: 'Business Man',
    torsoColor: 0x1b2631,
    torsoRoughness: 0.5,
    torsoMetalness: 0.3,
    vestColor: 0x212f3d,
    vestRoughness: 0.45,
    vestMetalness: 0.25,
    pantsColor: 0x17202a,
    armColor: 0x1b2631,
    headColor: 0x2c3e50,
    visorColor: 0xe74c3c,
    accent: 'businessman'
  },
  Adventurer_w: {
    name: 'Adventurer Female',
    torsoColor: 0x6c7a89,
    torsoRoughness: 0.7,
    torsoMetalness: 0.2,
    vestColor: 0x4b5320,
    vestRoughness: 0.65,
    vestMetalness: 0.2,
    pantsColor: 0x283020,
    armColor: 0x6c7a89,
    headColor: 0x5c3a21,
    visorColor: 0xa2d240,
    accent: 'adventurer'
  },
  Punk: {
    name: 'Punk',
    torsoColor: 0x18181b,
    torsoRoughness: 0.5,
    torsoMetalness: 0.6,
    vestColor: 0x27272a,
    vestRoughness: 0.6,
    vestMetalness: 0.55,
    pantsColor: 0x3f3f46,
    armColor: 0x18181b,
    headColor: 0xd946ef,
    visorColor: 0xec4899,
    accent: 'punk'
  },
  Suit_w: {
    name: 'Suit Female',
    torsoColor: 0x0f172a,
    torsoRoughness: 0.4,
    torsoMetalness: 0.25,
    vestColor: 0x1e293b,
    vestRoughness: 0.45,
    vestMetalness: 0.15,
    pantsColor: 0x0b0f19,
    armColor: 0x0f172a,
    headColor: 0x1e1e24,
    visorColor: 0xf43f5e,
    accent: 'suit_w'
  },
  Medieval_w: {
    name: 'Medieval Female',
    torsoColor: 0x475569,
    torsoRoughness: 0.3,
    torsoMetalness: 0.85,
    vestColor: 0x991b1b,
    vestRoughness: 0.5,
    vestMetalness: 0.4,
    pantsColor: 0x334155,
    armColor: 0x475569,
    headColor: 0x64748b,
    visorColor: 0xfbbf24,
    accent: 'medieval'
  },
  Soldier_w: {
    name: 'Soldier Female',
    torsoColor: 0x334d3a,
    torsoRoughness: 0.7,
    torsoMetalness: 0.15,
    vestColor: 0x1f2e23,
    vestRoughness: 0.6,
    vestMetalness: 0.3,
    pantsColor: 0x2b3e31,
    armColor: 0x334d3a,
    headColor: 0x1a261c,
    visorColor: 0x22c55e,
    accent: 'soldier'
  },
  Punk_w: {
    name: 'Punk Female',
    torsoColor: 0x4c1d95,
    torsoRoughness: 0.55,
    torsoMetalness: 0.45,
    vestColor: 0x2e1065,
    vestRoughness: 0.6,
    vestMetalness: 0.5,
    pantsColor: 0x1e1b4b,
    armColor: 0x4c1d95,
    headColor: 0x06b6d4,
    visorColor: 0x06b6d4,
    accent: 'punk_w'
  },
  Swat: {
    name: 'SWAT',
    torsoColor: 0x09090b,
    torsoRoughness: 0.4,
    torsoMetalness: 0.4,
    vestColor: 0x18181b,
    vestRoughness: 0.35,
    vestMetalness: 0.5,
    pantsColor: 0x0c0c0e,
    armColor: 0x09090b,
    headColor: 0x18181b,
    visorColor: 0x38bdf8,
    accent: 'swat'
  },
  King: {
    name: 'King',
    torsoColor: 0x581c87,
    torsoRoughness: 0.4,
    torsoMetalness: 0.3,
    vestColor: 0x7e22ce,
    vestRoughness: 0.4,
    vestMetalness: 0.6,
    pantsColor: 0x3b0764,
    armColor: 0x581c87,
    headColor: 0xfbbf24,
    visorColor: 0xf59e0b,
    accent: 'king'
  },
  Witch_w: {
    name: 'Witch Female',
    torsoColor: 0x1e1b4b,
    torsoRoughness: 0.8,
    torsoMetalness: 0.15,
    vestColor: 0x311042,
    vestRoughness: 0.7,
    vestMetalness: 0.2,
    pantsColor: 0x0f0d23,
    armColor: 0x1e1b4b,
    headColor: 0x181028,
    visorColor: 0x10b981,
    accent: 'witch'
  },
  Sci_Fi_Character_w: {
    name: 'Sci-Fi Character Female',
    torsoColor: 0xe2e8f0,
    torsoRoughness: 0.25,
    torsoMetalness: 0.85,
    vestColor: 0x0f172a,
    vestRoughness: 0.3,
    vestMetalness: 0.75,
    pantsColor: 0xcbd5e1,
    armColor: 0xe2e8f0,
    headColor: 0xf8fafc,
    visorColor: 0x00f0ff,
    accent: 'scifi'
  },
  Astronaut: {
    name: 'Astronaut',
    torsoColor: 0xf1f5f9,
    torsoRoughness: 0.5,
    torsoMetalness: 0.2,
    vestColor: 0xe2e8f0,
    vestRoughness: 0.4,
    vestMetalness: 0.35,
    pantsColor: 0xf1f5f9,
    armColor: 0xf1f5f9,
    headColor: 0xffffff,
    visorColor: 0xf59e0b,
    accent: 'astronaut'
  },
  shadowHunter: {
    name: 'Shadow Hunter',
    torsoColor: 0x070709,
    torsoRoughness: 0.9,
    torsoMetalness: 0.15,
    vestColor: 0x12080a,
    vestRoughness: 0.8,
    vestMetalness: 0.3,
    pantsColor: 0x040405,
    armColor: 0x070709,
    headColor: 0x0a0a0d,
    visorColor: 0xff1744,
    accent: 'shadow'
  },
  steelProp: {
    name: 'Steel Prop',
    torsoColor: 0x334155,
    torsoRoughness: 0.3,
    torsoMetalness: 0.85,
    vestColor: 0x475569,
    vestRoughness: 0.35,
    vestMetalness: 0.8,
    pantsColor: 0x1e293b,
    armColor: 0x334155,
    headColor: 0x334155,
    visorColor: 0xf97316,
    accent: 'steel'
  }
};
STORE_SKIN_STYLES.default = STORE_SKIN_STYLES.Casual_Character;

function disposeMeshHierarchy(obj) {
  if (!obj) return;
  obj.traverse((node) => {
    if (node.isMesh || node.isSkinnedMesh) {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
        else node.material.dispose();
      }
    }
  });
}

function createPlayerBadge(username, role) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.5, 1.125, 1);
    sprite.position.set(0, BADGE_HEIGHT, 0); // Positioned cleanly above character head at targetHeight * 1.12
    sprite.renderOrder = 999;
    sprite.frustumCulled = false;
    sprite.userData.isBadge = true;

    const badgeObj = { canvas, ctx, texture, sprite, lastName: null, lastRole: null };
    updatePlayerBadge(badgeObj, username, role);
    return badgeObj;
  } catch (e) {
    return null;
  }
}

function updatePlayerBadge(badgeObj, username, role) {
  if (!badgeObj || !badgeObj.ctx) return;
  if (badgeObj.sprite) {
    badgeObj.sprite.position.set(0, BADGE_HEIGHT, 0);
  }
  const cleanName = (username || 'Player').substring(0, 15);
  const cleanRole = (role || 'survivor').toLowerCase();
  if (badgeObj.lastName === cleanName && badgeObj.lastRole === cleanRole) return;
  badgeObj.lastName = cleanName;
  badgeObj.lastRole = cleanRole;

  const ctx = badgeObj.ctx;
  ctx.clearRect(0, 0, 256, 64);

  // Background pill
  ctx.fillStyle = 'rgba(10, 15, 24, 0.78)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(8, 6, 240, 52, 10);
  } else {
    ctx.rect(8, 6, 240, 52);
  }
  ctx.fill();

  const isHunter = cleanRole === 'hunter';
  const isProp = cleanRole === 'prop';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = isHunter ? '#ff4d4d' : (isProp ? '#ffa64d' : '#4de2ff');
  ctx.stroke();

  // Username
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cleanName, 128, 23);

  // Role tag
  ctx.fillStyle = isHunter ? '#ff4d4d' : (isProp ? '#ffa64d' : '#4de2ff');
  ctx.font = 'bold 13px monospace, sans-serif';
  const roleText = (cleanRole || 'SURVIVOR').toUpperCase();
  ctx.fillText(`[${roleText}]`, 128, 43);

  badgeObj.texture.needsUpdate = true;
}

function buildProceduralCharacter(player, skinId, isHunter) {
  const cleanId = (typeof skinId === 'string' ? skinId.replace(/\.glb$/i, '').trim() : skinId) || MALE_STARTER_ID;
  const skinStyle = STORE_SKIN_STYLES[cleanId] || STORE_SKIN_STYLES.Casual_Character;

  const characterGroup = new THREE.Group();
  characterGroup.name = 'proceduralCharacterGroup';
  characterGroup.frustumCulled = false;

  const baseHeight = 14.1;
  const scaleFactor = PLAYER_HEIGHT_3D / baseHeight;
  characterGroup.scale.setScalar(scaleFactor);

  const bodyBobGroup = new THREE.Group();
  bodyBobGroup.frustumCulled = false;

  const torsoGeo = new THREE.BoxGeometry(3.6, 5.2, 2.2);
  const torsoMat = new THREE.MeshStandardMaterial({
    color: skinStyle.torsoColor,
    roughness: skinStyle.torsoRoughness,
    metalness: skinStyle.torsoMetalness
  });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 8.5;
  torso.castShadow = true;
  torso.receiveShadow = true;
  torso.frustumCulled = false;
  bodyBobGroup.add(torso);

  const vestGeo = new THREE.BoxGeometry(3.9, 4.4, 2.5);
  const vestMat = new THREE.MeshStandardMaterial({
    color: skinStyle.vestColor,
    roughness: skinStyle.vestRoughness,
    metalness: skinStyle.vestMetalness
  });
  const vest = new THREE.Mesh(vestGeo, vestMat);
  vest.position.y = 8.7;
  vest.castShadow = true;
  vest.receiveShadow = true;
  vest.frustumCulled = false;
  bodyBobGroup.add(vest);

  const beltGeo = new THREE.BoxGeometry(3.8, 0.7, 2.4);
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.9 });
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.position.y = 6.2;
  belt.castShadow = true;
  belt.receiveShadow = true;
  belt.frustumCulled = false;
  bodyBobGroup.add(belt);

  const headGeo = new THREE.BoxGeometry(2.4, 2.6, 2.4);
  const headMat = new THREE.MeshStandardMaterial({
    color: skinStyle.headColor,
    roughness: 0.65
  });
  const headMesh = new THREE.Mesh(headGeo, headMat);
  headMesh.position.y = 12.8;
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headMesh.frustumCulled = false;
  bodyBobGroup.add(headMesh);

  const visorGeo = new THREE.BoxGeometry(2.1, 0.85, 0.5);
  const visorMat = new THREE.MeshBasicMaterial({
    color: isHunter ? 0xff2222 : skinStyle.visorColor
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 12.8, 1.25);
  visor.frustumCulled = false;
  bodyBobGroup.add(visor);

  // Accent props
  const accent = skinStyle.accent;
  if (accent === 'astronaut') {
    const domeGeo = new THREE.SphereGeometry(1.4, 16, 12);
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.05, metalness: 0.95 });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(0, 12.6, 0.4);
    dome.scale.set(1, 1, 0.9);
    dome.frustumCulled = false;
    bodyBobGroup.add(dome);
  } else if (accent === 'king') {
    const crownGeo = new THREE.CylinderGeometry(1.5, 1.3, 1.0, 8);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.15, metalness: 0.95 });
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(0, 14.2, 0);
    crown.frustumCulled = false;
    bodyBobGroup.add(crown);
  } else if (accent === 'swat') {
    const padGeo = new THREE.BoxGeometry(1.6, 0.9, 1.8);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.6 });
    const p1 = new THREE.Mesh(padGeo, padMat); p1.position.set(-2.2, 10.8, 0); p1.frustumCulled = false; bodyBobGroup.add(p1);
    const p2 = new THREE.Mesh(padGeo, padMat); p2.position.set(2.2, 10.8, 0); p2.frustumCulled = false; bodyBobGroup.add(p2);
  } else if (accent === 'worker') {
    const brimGeo = new THREE.CylinderGeometry(1.6, 1.7, 0.3, 12);
    const brimMat = new THREE.MeshStandardMaterial({ color: skinStyle.headColor, roughness: 0.4 });
    const brim = new THREE.Mesh(brimGeo, brimMat);
    brim.position.set(0, 13.7, 0);
    brim.frustumCulled = false;
    bodyBobGroup.add(brim);
  } else if (accent === 'punk' || accent === 'punk_w') {
    const hawkGeo = new THREE.BoxGeometry(0.5, 1.8, 2.6);
    const hawkMat = new THREE.MeshStandardMaterial({ color: skinStyle.headColor, roughness: 0.5 });
    const hawk = new THREE.Mesh(hawkGeo, hawkMat);
    hawk.position.set(0, 14.5, 0);
    hawk.frustumCulled = false;
    bodyBobGroup.add(hawk);
  } else if (accent === 'witch') {
    const brimGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.15, 16);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x140c20, roughness: 0.85 });
    const brim = new THREE.Mesh(brimGeo, hatMat);
    brim.position.set(0, 13.9, 0);
    brim.frustumCulled = false;
    bodyBobGroup.add(brim);

    const coneGeo = new THREE.ConeGeometry(1.6, 3.2, 10);
    const cone = new THREE.Mesh(coneGeo, hatMat);
    cone.position.set(0, 15.5, -0.2);
    cone.rotation.x = -0.15;
    cone.frustumCulled = false;
    bodyBobGroup.add(cone);
  } else if (accent === 'businessman') {
    const tieGeo = new THREE.BoxGeometry(0.65, 3.2, 0.15);
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });
    const tie = new THREE.Mesh(tieGeo, tieMat);
    tie.position.set(0, 8.6, 1.3);
    tie.frustumCulled = false;
    bodyBobGroup.add(tie);
  } else if (accent === 'farmer' || accent === 'adventurer') {
    const brimGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.2, 16);
    const brimMat = new THREE.MeshStandardMaterial({ color: skinStyle.headColor, roughness: 0.85 });
    const brim = new THREE.Mesh(brimGeo, brimMat);
    brim.position.set(0, 13.9, 0);
    brim.frustumCulled = false;
    bodyBobGroup.add(brim);
  }

  // Arms and Legs
  const armGeo = new THREE.BoxGeometry(1.1, 4.4, 1.2);
  const armMat = new THREE.MeshStandardMaterial({
    color: skinStyle.armColor,
    roughness: 0.7
  });

  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-2.4, 10.6, 0);
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.y = -2.0;
  leftArm.castShadow = true;
  leftArm.receiveShadow = true;
  leftArm.frustumCulled = false;
  leftArmPivot.add(leftArm);
  bodyBobGroup.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(2.4, 10.6, 0);
  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.y = -2.0;
  rightArm.castShadow = true;
  rightArm.receiveShadow = true;
  rightArm.frustumCulled = false;
  rightArmPivot.add(rightArm);
  bodyBobGroup.add(rightArmPivot);

  characterGroup.add(bodyBobGroup);

  const legGeo = new THREE.BoxGeometry(1.35, 5.8, 1.4);
  const legMat = new THREE.MeshStandardMaterial({
    color: skinStyle.pantsColor,
    roughness: 0.8
  });

  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-1.0, 5.8, 0);
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.y = -2.9;
  leftLeg.castShadow = true;
  leftLeg.receiveShadow = true;
  leftLeg.frustumCulled = false;
  leftLegPivot.add(leftLeg);
  characterGroup.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(1.0, 5.8, 0);
  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.position.y = -2.9;
  rightLeg.castShadow = true;
  rightLeg.receiveShadow = true;
  rightLeg.frustumCulled = false;
  rightLegPivot.add(rightLeg);
  characterGroup.add(rightLegPivot);

  characterGroup.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => { m.fog = true; });
        } else {
          child.material.fog = true;
        }
      }
    }
  });

  characterGroup.userData.animateWalk = (time, isWalking) => {
    if (isWalking) {
      const armSwing = Math.sin(time * 6) * 0.45;
      const legSwing = Math.sin(time * 6) * 0.55;
      leftArmPivot.rotation.x = armSwing;
      rightArmPivot.rotation.x = -armSwing;
      leftLegPivot.rotation.x = -legSwing;
      rightLegPivot.rotation.x = legSwing;
      bodyBobGroup.position.y = Math.abs(Math.sin(time * 6)) * 0.2;
    } else {
      leftArmPivot.rotation.x = THREE.MathUtils.lerp(leftArmPivot.rotation.x, 0, 0.2);
      rightArmPivot.rotation.x = THREE.MathUtils.lerp(rightArmPivot.rotation.x, 0, 0.2);
      leftLegPivot.rotation.x = THREE.MathUtils.lerp(leftLegPivot.rotation.x, 0, 0.2);
      rightLegPivot.rotation.x = THREE.MathUtils.lerp(rightLegPivot.rotation.x, 0, 0.2);
      bodyBobGroup.position.y = THREE.MathUtils.lerp(bodyBobGroup.position.y, 0, 0.2);
    }
  };

  return characterGroup;
}

function skinFileForId(skinId) {
  const clean = cleanSkinId(skinId) || MALE_STARTER_ID;
  if (STORE_CATALOG[clean] && STORE_CATALOG[clean].file) {
    return STORE_CATALOG[clean].file;
  }
  const simplified = clean.toLowerCase().replace(/[\s\-_]/g, '');
  for (const [key, item] of Object.entries(STORE_CATALOG)) {
    if (key.toLowerCase().replace(/[\s\-_]/g, '') === simplified && item.file) {
      return item.file;
    }
    if (item.file && cleanSkinId(item.file).toLowerCase().replace(/[\s\-_]/g, '') === simplified) {
      return item.file;
    }
  }
  if (typeof skinId === 'string' && /\.glb$/i.test(skinId)) {
    const parts = skinId.trim().split(/[\/\\]/);
    return parts[parts.length - 1];
  }
  return STORE_CATALOG[MALE_STARTER_ID].file;
}

const SKIN_FACING_OFFSETS = {
  Casual_Character: 0,
  Casual_w: 0,
  Astronaut: 0
};

function getSkinFacingOffset(skinId) {
  if (!skinId) return 0;
  const clean = cleanSkinId(skinId);
  return SKIN_FACING_OFFSETS[clean] || 0;
}

function getCandidateSkinUrls(fileOrPath) {
  if (!fileOrPath) return ['/Skins/Players/Casual_Character.glb', '/Casual_Character.glb'];
  if (fileOrPath.startsWith('http://') || fileOrPath.startsWith('https://')) {
    return [fileOrPath];
  }
  const cleanParts = fileOrPath.trim().split(/[\/\\]/);
  let baseName = cleanParts[cleanParts.length - 1];
  if (!/\.glb$/i.test(baseName)) {
    const file = skinFileForId(baseName);
    if (file) baseName = file;
    else baseName += '.glb';
  }
  const urls = [];

  // If a specific absolute path was requested and ends with .glb, try that first
  if (fileOrPath.startsWith('/') && /\.glb$/i.test(fileOrPath)) {
    urls.push(fileOrPath);
  }

  // Priority 1: /Skins/Players/<file>.glb
  const standard = `/Skins/Players/${baseName}`;
  if (!urls.includes(standard)) urls.push(standard);

  // Priority 2: /<file>.glb (directly in public/)
  const root = `/${baseName}`;
  if (!urls.includes(root)) urls.push(root);

  // Priority 3: /public/Skins/Players/<file>.glb
  const pub = `/public/Skins/Players/${baseName}`;
  if (!urls.includes(pub)) urls.push(pub);

  return urls;
}

function skinUrlForFile(skinFile) {
  const candidates = getCandidateSkinUrls(skinFile);
  return candidates[0];
}

function loadSkinModel(skinFile) {
  const fileName = skinFileForId(skinFile);
  if (skinModelCache[fileName]) return Promise.resolve(skinModelCache[fileName]);
  if (skinModelPromises[fileName]) return skinModelPromises[fileName];

  const candidateUrls = getCandidateSkinUrls(skinFile || fileName);

  skinModelPromises[fileName] = new Promise((resolve, reject) => {
    let index = 0;
    function tryNext() {
      if (index >= candidateUrls.length) {
        delete skinModelPromises[fileName];
        reject(new Error(`[skin] Could not load model from candidate paths: ${candidateUrls.join(', ')}`));
        return;
      }
      const currentUrl = candidateUrls[index++];
      skinGLTFLoader.load(
        currentUrl,
        (gltf) => {
          gltf.__resolvedUrl = currentUrl;
          skinModelCache[fileName] = gltf;
          delete skinModelPromises[fileName];
          resolve(gltf);
        },
        undefined,
        () => {
          tryNext();
        }
      );
    }
    tryNext();
  });

  return skinModelPromises[fileName];
}

function instantiateSkinModel(gltf, url) {
  return new Promise((resolve, reject) => {
    try {
      if (SkeletonUtils && typeof SkeletonUtils.clone === 'function' && gltf && gltf.scene) {
        const clonedScene = SkeletonUtils.clone(gltf.scene);
        resolve({ scene: clonedScene, animations: gltf.animations || [] });
        return;
      }
    } catch (cloneErr) {
      console.warn(`[skin] SkeletonUtils.clone failed for ${url}, falling back to fresh GLTFLoader:`, cloneErr);
    }

    try {
      const activeUrl = (gltf && gltf.__resolvedUrl) || url;
      const loader = new GLTFLoader();
      loader.load(
        activeUrl,
        (freshGltf) => {
          resolve({ scene: freshGltf.scene, animations: freshGltf.animations || [] });
        },
        undefined,
        (err) => reject(err)
      );
    } catch (e) {
      reject(e);
    }
  });
}

function findClip(animations, keywords) {
  if (!Array.isArray(animations) || animations.length === 0) return null;
  for (const keyword of keywords) {
    const match = animations.find(
      (clip) => clip && typeof clip.name === 'string' && clip.name.toLowerCase().includes(keyword)
    );
    if (match) return match;
  }
  return null;
}

function setupCharacterAnimations(id, model, animations) {
  if (!animations || animations.length === 0) return;
  const playerRoot = playerMeshes[id];
  if (!playerRoot) return;

  const mixer = new THREE.AnimationMixer(model);
  const ud = playerRoot.userData;

  const idleClip = findClip(animations, ['idle', 'stand', 'breath']) || animations[0];
  const walkClip = findClip(animations, ['walk']) || idleClip;
  const runClip = findClip(animations, ['run', 'sprint', 'jog']) || walkClip;

  ud.idleAction = idleClip ? mixer.clipAction(idleClip) : null;
  ud.walkAction = walkClip ? mixer.clipAction(walkClip) : null;
  ud.runAction = runClip ? mixer.clipAction(runClip) : null;

  for (const action of [ud.idleAction, ud.walkAction, ud.runAction]) {
    if (!action) continue;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  }

  const startAction = ud.idleAction || ud.walkAction || ud.runAction;
  if (startAction) {
    startAction.reset().play();
    ud.currentAction = startAction;
  }

  disposePlayerMixer(id);
  playerMixers[id] = mixer;
  ud.mixer = mixer;
}

function disposePlayerMixer(id) {
  const mixer = playerMixers[id];
  if (!mixer) return;
  try {
    mixer.stopAllAction();
    if (mixer.getRoot()) mixer.uncacheRoot(mixer.getRoot());
  } catch (e) {}
  delete playerMixers[id];
}

function updateCharacterAnimationState(group, speed) {
  const ud = group.userData;
  if (!ud || !ud.mixer) return;

  let target;
  if (speed >= CHARACTER_RUN_SPEED) target = ud.runAction || ud.walkAction || ud.idleAction;
  else if (speed >= CHARACTER_WALK_SPEED) target = ud.walkAction || ud.idleAction;
  else target = ud.idleAction || ud.walkAction;

  if (!target || target === ud.currentAction) return;

  target.reset();
  target.enabled = true;
  target.setEffectiveTimeScale(1);
  target.setEffectiveWeight(1);
  if (ud.currentAction) target.crossFadeFrom(ud.currentAction, CHARACTER_ANIM_FADE, false);
  target.play();
  ud.currentAction = target;
}

function attachSkinToPlayer(id, playerRoot, skinId) {
  if (!playerRoot || !playerRoot.userData) return;
  const file = skinFileForId(skinId);
  const ud = playerRoot.userData;
  const bodyContainer = ud.bodyContainer || playerRoot;

  if (ud.model && ud.skinFile === file) return;
  if (ud.pendingSkinFile === file) return;
  ud.pendingSkinFile = file;

  loadSkinModel(file)
    .then((gltf) => {
      if (playerMeshes[id] !== playerRoot || ud.pendingSkinFile !== file || ud.isDisguised) return;

      const activeUrl = (gltf && gltf.__resolvedUrl) || skinUrlForFile(file);
      return instantiateSkinModel(gltf, activeUrl).then((instantiated) => {
        if (playerMeshes[id] !== playerRoot || ud.pendingSkinFile !== file || ud.isDisguised) return;
        ud.pendingSkinFile = null;

        const model = instantiated.scene;
        model.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);

        let rawHeight = size.y;
        if (!rawHeight || isNaN(rawHeight) || rawHeight < 0.001) {
          rawHeight = 1.8;
        }

        const targetHeight = CHARACTER_TARGET_HEIGHT;
        const scale = targetHeight / rawHeight;
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = new THREE.Vector3();
        scaledBox.getCenter(scaledCenter);

        model.position.set(-scaledCenter.x, -scaledBox.min.y, -scaledCenter.z);
        model.rotation.y = getSkinFacingOffset(skinId);
        model.updateMatrixWorld(true);

        model.traverse((child) => {
          if (child.isMesh || child.isSkinnedMesh) {
            child.visible = true;
            child.frustumCulled = false;
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => {
                  mat.fog = true;
                  mat.depthWrite = true;
                });
              } else {
                child.material.fog = true;
                child.material.depthWrite = true;
              }
            }
          }
        });

        // Remove old model if present
        if (ud.model) {
          bodyContainer.remove(ud.model);
          disposeMeshHierarchy(ud.model);
          ud.model = null;
        }

        bodyContainer.add(model);
        ud.model = model;
        ud.skinFile = file;

        // Diagnostic log on success: print targetHeight and scale for verification
        console.log('[skin] loaded:', activeUrl, 'targetHeight:', targetHeight, 'scale:', scale);

        // ONLY remove or hide fallback body after .glb is attached
        if (ud.fallbackMesh) {
          bodyContainer.remove(ud.fallbackMesh);
          disposeMeshHierarchy(ud.fallbackMesh);
          ud.fallbackMesh = null;
        }

        setupCharacterAnimations(id, model, instantiated.animations);
      });
    })
    .catch((err) => {
      if (ud.pendingSkinFile === file) ud.pendingSkinFile = null;
      console.warn('[skin] failed:', file, err);
    });
}

async function loadMapModel(modelPath) {
  if (!modelPath) throw new Error('loadMapModel requires a modelPath');
  if (mapModelCache[modelPath]) return mapModelCache[modelPath];
  if (mapModelLoadPromises[modelPath]) return mapModelLoadPromises[modelPath];

  mapModelLoadPromises[modelPath] = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
        const modelScene = gltf.scene;

        // Strip any lights/cameras accidentally exported inside the model.
        // Extra lights push the shader past WebGL uniform limits and crash it.
        const badNodes = [];
        modelScene.traverse((node) => {
          if (node.isLight || node.isCamera) {
            badNodes.push(node);
          }
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        for (const node of badNodes) {
          if (node.parent) node.parent.remove(node);
        }

        const box = new THREE.Box3().setFromObject(modelScene);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const offsetX = -center.x;
        const offsetY = -box.min.y;
        const offsetZ = -center.z;
        modelScene.position.set(offsetX, offsetY, offsetZ);
        modelScene.updateMatrixWorld(true);

        const normalizedBox = new THREE.Box3().setFromObject(modelScene);
        const normalizedSize = new THREE.Vector3();
        const normalizedCenter = new THREE.Vector3();
        normalizedBox.getSize(normalizedSize);
        normalizedBox.getCenter(normalizedCenter);

        const template = { scene: modelScene, size: normalizedSize, center: normalizedCenter };
        mapModelCache[modelPath] = template;
        resolve(template);
      }, undefined, (error) => {
        delete mapModelLoadPromises[modelPath];
        reject(error);
      });
  });

  return mapModelLoadPromises[modelPath];
}

function circleRectCollisionXZ(cx, cz, radius, rx, rz, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestZ = Math.max(rz, Math.min(cz, rz + rh));
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

function wouldCollideXZ(x, z, radius) {
  for (const obj of map) {
    if (circleRectCollisionXZ(x, z, radius, obj.x, obj.y, obj.width, obj.height)) return true;
  }
  return false;
}

function constrainPosition(x, z, radius) {
  const minX = currentZone.minX + radius;
  const maxX = currentZone.maxX - radius;
  const minZ = currentZone.minZ + radius;
  const maxZ = currentZone.maxZ - radius;

  let newX = Math.max(minX, Math.min(maxX, x));
  let newZ = Math.max(minZ, Math.min(maxZ, z));

  const pushOutAmount = 2;
  for (let attempts = 0; attempts < 10; attempts++) {
    let collided = false;
    for (const obj of (matchState === 'waiting' ? [] : map)) {
      if (newX > obj.x && newX < obj.x + obj.width && newZ > obj.y && newZ < obj.y + obj.height) {
        collided = true;
        const distLeft = newX - obj.x;
        const distRight = (obj.x + obj.width) - newX;
        const distTop = newZ - obj.y;
        const distBottom = (obj.y + obj.height) - newZ;
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);
        if (minDist === distLeft) newX = obj.x - radius;
        else if (minDist === distRight) newX = obj.x + obj.width + radius;
        else if (minDist === distTop) newZ = obj.y - radius;
        else newZ = obj.y + obj.height + radius;
        continue;
      }

      const closestX = Math.max(obj.x, Math.min(newX, obj.x + obj.width));
      const closestZ = Math.max(obj.y, Math.min(newZ, obj.y + obj.height));
      const dx = newX - closestX;
      const dz = newZ - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        collided = true;
        const dist = Math.sqrt(distSq) || 0.001;
        if (Math.abs(dx) > Math.abs(dz)) {
          newX += dx > 0 ? pushOutAmount : -pushOutAmount;
        } else {
          newZ += dz > 0 ? pushOutAmount : -pushOutAmount;
        }
      }
    }
    if (!collided) break;
  }

  newX = Math.max(minX, Math.min(maxX, newX));
  newZ = Math.max(minZ, Math.min(maxZ, newZ));
  return { x: newX, z: newZ };
}

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children.pop();
    if (obj.geometry) obj.geometry.dispose();
  }
}

function rebuildMapMeshes() {
  for (const m of mapMeshes) {
    mapGroup.remove(m.mesh);
    if (m.mesh.geometry) m.mesh.geometry.dispose();
  }
  mapMeshes.length = 0;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x7ec8f0, transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide });

  for (const obj of map) {
    if (obj.type === 'model') {
      const cached = obj.modelPath ? mapModelCache[obj.modelPath] : null;
      if (cached) {
        const instance = cached.scene.clone(true);
        const templateSize = cached.size;
        if (templateSize.x > 0) {
          const scaleFactor = obj.width / templateSize.x;
          instance.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }
        instance.position.set(obj.x + obj.width / 2, 0, obj.y + obj.height / 2);
        instance.userData.type = 'model';
        instance.userData.modelPath = obj.modelPath;
        mapGroup.add(instance);
        mapMeshes.push({ mesh: instance, data: obj });
      } else if (obj.modelPath) {
        loadMapModel(obj.modelPath).then(() => rebuildMapMeshes()).catch(console.error);
      }
      continue;
    }

    if (obj.type === 'wall' || obj.type === 'glass') {
      const w = obj.width;
      const d = obj.height;
      const h = obj.type === 'glass' ? GLASS_HEIGHT : WALL_HEIGHT;
      const geo = new THREE.BoxGeometry(w, h, d);
      const meshMat = obj.type === 'glass' ? glassMat : wallMat;
      const mesh = new THREE.Mesh(geo, meshMat);
      mesh.position.set(obj.x + w / 2, h / 2, obj.y + d / 2);
      mesh.castShadow = obj.type === 'wall';
      mesh.receiveShadow = true;
      mesh.userData.type = obj.type;
      mapGroup.add(mesh);
      mapMeshes.push({ mesh, data: obj });
    }
  }
}

function rebuildPropMeshes() {
  for (const child of propGroup.children.slice()) propGroup.remove(child);
  propMeshes = [];

  if (!crateTemplate) return;
  const templateSize = crateTemplate.size;

  for (const p of props) {
    const w = p.width;
    const d = p.height;
    const h = PROP_HEIGHT;

    const crateInstance = crateTemplate.scene.clone(true);
    if (templateSize.x > 0) crateInstance.scale.x = w / templateSize.x;
    if (templateSize.y > 0) crateInstance.scale.y = h / templateSize.y;
    if (templateSize.z > 0) crateInstance.scale.z = d / templateSize.z;

    crateInstance.position.set(p.x + w / 2, 0, p.y + d / 2);
    crateInstance.userData.propId = p.id;
    propGroup.add(crateInstance);
    propMeshes.push(crateInstance);
  }
}

function resolvePlayerSkinId(player) {
  if (!player) return (myEquippedSkin || defaultEquippedSkinId());
  if (player.id === myId && myEquippedSkin && STORE_CATALOG[myEquippedSkin]) {
    return myEquippedSkin;
  }
  let raw = (player.loadout && player.loadout.equippedSkin) || player.equippedSkin || player.skinId;
  const id = cleanSkinId(raw);
  if (!id) {
    return player.id === myId ? (myEquippedSkin || defaultEquippedSkinId()) : MALE_STARTER_ID;
  }
  if (id === 'default') return MALE_STARTER_ID;
  if (STORE_CATALOG[id]) return id;
  const simplified = id.toLowerCase().replace(/[\s\-_]/g, '');
  for (const [key, item] of Object.entries(STORE_CATALOG)) {
    if (key.toLowerCase().replace(/[\s\-_]/g, '') === simplified) return key;
    if (item.file && cleanSkinId(item.file).toLowerCase().replace(/[\s\-_]/g, '') === simplified) return key;
  }
  return player.id === myId ? (myEquippedSkin || defaultEquippedSkinId()) : MALE_STARTER_ID;
}

function resolveMeshColor(player) {
  const skin = resolvePlayerSkinId(player);
  if (player.role === 'hunter' && skin === 'shadowHunter') return STORE_CATALOG.shadowHunter.color;
  if ((player.role === 'prop' || player.role === 'waiting') && skin === 'steelProp') return STORE_CATALOG.steelProp.color;
  if (player.role === 'hunter') return 0xe74c3c;
  return 0x3498db;
}

function resolveDisguiseColor(player) {
  if (resolvePlayerSkinId(player) === 'steelProp') return STORE_CATALOG.steelProp.color;
  return 0x8b5a2b;
}

function createPropBoxMesh(player, skinId) {
  const prop = props.find((pp) => pp.id === player.propId);
  const w = prop ? prop.width : 40;
  const d = prop ? prop.height : 40;
  const boxColor = resolveDisguiseColor(player);
  const geo = new THREE.BoxGeometry(w, PROP_HEIGHT, d);
  const mat = new THREE.MeshStandardMaterial({
    color: boxColor,
    metalness: skinId === 'steelProp' ? 0.75 : 0.05,
    roughness: skinId === 'steelProp' ? 0.28 : 0.8
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = PROP_HEIGHT / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.disposableMaterial = true;
  return mesh;
}

function getOrCreatePlayerMesh(id, player) {
  let playerRoot = playerMeshes[id];
  const isMe = id === myId;

  const disguised = Boolean(player.isProp && player.propId);
  const skinId = resolvePlayerSkinId(player);
  const wantsCharacter = !disguised;

  if (!isMe && (!playerRoot || playerRoot.userData.lastLoggedSkin !== skinId)) {
    console.log('[skin-sync]', player.username, 'equippedSkin:', player.equippedSkin);
  }

  if (!playerRoot) {
    playerRoot = new THREE.Group();
    playerRoot.name = `playerRoot_${id}`;
    playerRoot.scale.set(1, 1, 1);
    playerRoot.frustumCulled = false;
    playerRoot.userData.id = id;
    playerRoot.userData.isCharacter = wantsCharacter;
    playerRoot.userData.isDisguised = disguised;
    playerRoot.userData.skinFile = null;
    playerRoot.userData.pendingSkinFile = null;
    playerRoot.userData.model = null;
    playerRoot.userData.fallbackMesh = null;
    playerRoot.userData.speed = 0;
    playerRoot.userData.lastPos = null;
    playerRoot.userData.lastPosTime = performance.now();
    playerRoot.userData.initializedPos = false;
    playerRoot.userData.lastLoggedSkin = skinId;

    // bodyContainer holds ONLY the active skin .glb, procedural fallback body, or prop box
    const bodyContainer = new THREE.Group();
    bodyContainer.name = `bodyContainer_${id}`;
    bodyContainer.scale.set(1, 1, 1);
    bodyContainer.frustumCulled = false;
    playerRoot.add(bodyContainer);
    playerRoot.userData.bodyContainer = bodyContainer;

    // Overhead name badge for remote players (child Sprite of playerRoot)
    if (!isMe) {
      const badge = createPlayerBadge(player.username || player.displayName || 'Survivor', player.role);
      if (badge) {
        playerRoot.add(badge.sprite);
        playerRoot.userData.badge = badge;
      }
    }

    if (disguised) {
      const propBox = createPropBoxMesh(player, skinId);
      bodyContainer.add(propBox);
      bodyContainer.userData.propMesh = propBox;
    } else {
      const fallback = buildProceduralCharacter(player, skinId, player.role === 'hunter');
      bodyContainer.add(fallback);
      playerRoot.userData.fallbackMesh = fallback;
    }

    playerMeshes[id] = playerRoot;
    if (scene) {
      scene.add(playerRoot);
    } else if (playerGroup) {
      playerGroup.add(playerRoot);
    }
  } else {
    // Ensure playerRoot is attached directly to scene
    if (scene && playerRoot.parent !== scene) {
      if (playerRoot.parent) playerRoot.parent.remove(playerRoot);
      scene.add(playerRoot);
    }

    const ud = playerRoot.userData;
    const bodyContainer = ud.bodyContainer || playerRoot;
    playerRoot.scale.set(1, 1, 1);
    if (bodyContainer) bodyContainer.scale.set(1, 1, 1);

    if (ud.isDisguised !== disguised) {
      ud.isDisguised = disguised;
      ud.isCharacter = wantsCharacter;

      disposePlayerMixer(id);
      if (ud.model) {
        bodyContainer.remove(ud.model);
        disposeMeshHierarchy(ud.model);
        ud.model = null;
      }
      if (ud.fallbackMesh) {
        bodyContainer.remove(ud.fallbackMesh);
        disposeMeshHierarchy(ud.fallbackMesh);
        ud.fallbackMesh = null;
      }
      if (bodyContainer.userData.propMesh) {
        bodyContainer.remove(bodyContainer.userData.propMesh);
        disposeMeshHierarchy(bodyContainer.userData.propMesh);
        bodyContainer.userData.propMesh = null;
      }
      ud.skinFile = null;
      ud.pendingSkinFile = null;

      if (disguised) {
        const propBox = createPropBoxMesh(player, skinId);
        bodyContainer.add(propBox);
        bodyContainer.userData.propMesh = propBox;
      } else {
        const fallback = buildProceduralCharacter(player, skinId, player.role === 'hunter');
        bodyContainer.add(fallback);
        ud.fallbackMesh = fallback;
      }
    } else if (disguised && bodyContainer.userData.propMesh) {
      const boxColor = resolveDisguiseColor(player);
      if (bodyContainer.userData.propMesh.material && bodyContainer.userData.propMesh.material.color) {
        bodyContainer.userData.propMesh.material.color.setHex(boxColor);
      }
    }
  }

  // Update badge content & visibility
  if (!isMe) {
    if (!playerRoot.userData.badge) {
      const badge = createPlayerBadge(player.username || player.displayName || 'Survivor', player.role);
      if (badge) {
        playerRoot.add(badge.sprite);
        playerRoot.userData.badge = badge;
      }
    } else {
      updatePlayerBadge(playerRoot.userData.badge, player.username || player.displayName || 'Survivor', player.role);
    }

    if (playerRoot.userData.badge && playerRoot.userData.badge.sprite) {
      playerRoot.userData.badge.sprite.visible = !disguised && Boolean(player.alive);
    }
  }

  playerRoot.userData.lastLoggedSkin = skinId;
  if (wantsCharacter) {
    attachSkinToPlayer(id, playerRoot, skinId);
  }

  if (isMe) {
    playerRoot.visible = false;
  } else {
    playerRoot.visible = Boolean(player.alive);
    playerRoot.frustumCulled = false;
  }

  return playerRoot;
}

function removePlayerMesh(id) {
  const playerRoot = playerMeshes[id];
  if (!playerRoot) return;
  disposePlayerMixer(id);
  if (playerRoot.parent) {
    playerRoot.parent.remove(playerRoot);
  } else if (scene) {
    scene.remove(playerRoot);
  }
  playerRoot.traverse((node) => {
    if (node.isMesh || node.isSkinnedMesh) {
      if (node.geometry) node.geometry.dispose();
      if (node.userData && node.userData.disposableMaterial && node.material) {
        node.material.dispose();
      }
    }
  });
  if (playerRoot.userData && playerRoot.userData.badge && playerRoot.userData.badge.texture) {
    playerRoot.userData.badge.texture.dispose();
  }
  delete playerMeshes[id];
}

function updatePlayerMeshes() {
  const aliveIds = new Set(Object.keys(players));
  for (const id of Object.keys(playerMeshes)) {
    if (!aliveIds.has(id)) removePlayerMesh(id);
  }

  const nowMs = performance.now();

  for (const [id, player] of Object.entries(players)) {
    const isMe = id === myId;
    let px, pz;
    if (isMe) {
      px = localX;
      pz = localZ;
    } else {
      px = player.x;
      pz = player.z;
    }

    const playerRoot = getOrCreatePlayerMesh(id, player);
    if (!player.alive || isMe) {
      playerRoot.visible = false;
      continue;
    }

    playerRoot.visible = true;
    playerRoot.frustumCulled = false;

    // Ground height: player.y is eye level (~12), ground height is Math.max(0, player.y - 12)
    const rawY = typeof player.y === 'number' ? player.y : PLAYER_EYE_HEIGHT;
    const targetGroundY = Math.max(0, rawY - PLAYER_EYE_HEIGHT);
    const targetYaw = (typeof player.yaw === 'number') ? player.yaw : ((typeof player.rotation === 'number') ? player.rotation : (playerRoot.rotation.y || 0));

    const ud = playerRoot.userData;

    if (!ud.initializedPos) {
      playerRoot.position.set(px, targetGroundY, pz);
      playerRoot.rotation.y = targetYaw;
      ud.initializedPos = true;
    }

    if (ud.isCharacter) {
      if (ud.lastPos) {
        const dtSec = Math.max(0.001, (nowMs - ud.lastPosTime) / 1000);
        const inst = Math.hypot(px - ud.lastPos.x, pz - ud.lastPos.z) / dtSec;
        ud.speed = (ud.speed || 0) * 0.6 + inst * 0.4;
      } else {
        ud.speed = 0;
      }
      ud.lastPos = { x: px, z: pz };
      ud.lastPosTime = nowMs;

      playerRoot.position.x = THREE.MathUtils.lerp(playerRoot.position.x, px, 0.35);
      playerRoot.position.y = THREE.MathUtils.lerp(playerRoot.position.y, targetGroundY, 0.35);
      playerRoot.position.z = THREE.MathUtils.lerp(playerRoot.position.z, pz, 0.35);

      let rotDiff = targetYaw - playerRoot.rotation.y;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      playerRoot.rotation.y += rotDiff * 0.35;

      // Animate procedural limb swinging if fallback is active
      if (ud.fallbackMesh && ud.fallbackMesh.userData && ud.fallbackMesh.userData.animateWalk) {
        ud.fallbackMesh.userData.animateWalk(nowMs * 0.008, ud.speed > CHARACTER_WALK_SPEED);
      }
    } else {
      playerRoot.position.x = THREE.MathUtils.lerp(playerRoot.position.x, px, 0.35);
      playerRoot.position.y = THREE.MathUtils.lerp(playerRoot.position.y, targetGroundY, 0.35);
      playerRoot.position.z = THREE.MathUtils.lerp(playerRoot.position.z, pz, 0.35);
      playerRoot.rotation.y = targetYaw;
    }

    // Overhead badge update
    if (ud.badge) {
      updatePlayerBadge(ud.badge, player.username || player.displayName || 'Survivor', player.role);
      if (ud.badge.sprite) {
        ud.badge.sprite.visible = !player.isProp && Boolean(player.alive);
      }
    }
  }
}

function updatePlayerAnimations(dt) {
  for (const [id, mesh] of Object.entries(playerMeshes)) {
    if (!mesh.userData || !mesh.userData.isCharacter) continue;
    const mixer = playerMixers[id];
    if (!mixer) continue;
    updateCharacterAnimationState(mesh, mesh.userData.speed || 0);
    mixer.update(dt);
  }
}

function getNpcRemainingHits(npc) {
  if (!npc) return GHOUL_MAX_HITS;
  const max = typeof npc.maxHits === 'number' ? npc.maxHits : GHOUL_MAX_HITS;
  const taken = typeof npc.hitsTaken === 'number' ? npc.hitsTaken : 0;
  return Math.max(0, max - taken);
}

function repaintNpcHealthBar(ctx, hits) {
  const W = 256, H = 64;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);
  const inset = 4, gap = 3, top = 8, bottom = 8;
  const barW = W - inset * 2;
  const cellW = (barW - gap * (GHOUL_MAX_HITS - 1)) / GHOUL_MAX_HITS;
  const cellH = H - top - bottom;

  for (let i = 0; i < GHOUL_MAX_HITS; i++) {
    const x = inset + i * (cellW + gap);
    ctx.fillStyle = i < hits ? '#00cc00' : '#ff0000';
    ctx.fillRect(x, top, cellW, cellH);
    if (i < hits) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x, top, cellW, cellH * 0.35);
    }
  }
}

function updateNPCMeshes() {
  if (!ghoulTemplate) return;

  const activeNPCIds = new Set(Object.keys(npcs));
  for (const id of Object.keys(npcMeshes)) {
    if (!activeNPCIds.has(id)) {
      const deadMesh = npcMeshes[id];
      playerGroup.remove(deadMesh);
      delete npcMeshes[id];

      const mixer = npcMixers[id];
      if (mixer) {
        mixer.stopAllAction();
        mixer.uncacheRoot(deadMesh);
        delete npcMixers[id];
      }
    }
  }

  for (const [id, npc] of Object.entries(npcs)) {
    let mesh = npcMeshes[id];

    if (!mesh) {
      mesh = SkeletonUtils.clone(ghoulTemplate.scene);
      mesh.scale.set(12, 12, 12);
      mesh.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          node.frustumCulled = false;
        }
      });
      mesh.userData.id = id;

      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      repaintNpcHealthBar(ctx, GHOUL_MAX_HITS);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const material = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(material);

      sprite.position.set(0, 2.3, 0);
      sprite.scale.set(1.5, 0.4, 1);
      mesh.add(sprite);

      mesh.userData.healthCtx = ctx;
      mesh.userData.healthTexture = texture;
      mesh.userData.lastHits = GHOUL_MAX_HITS;

      if (ghoulTemplate.animations && ghoulTemplate.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(mesh);
        const walkAction = mixer.clipAction(ghoulTemplate.animations[6]);
        const runAction = mixer.clipAction(ghoulTemplate.animations[5]);
        const heavyBreatheAction = mixer.clipAction(ghoulTemplate.animations[4]);
        const slowBreatheAction = mixer.clipAction(ghoulTemplate.animations[3]);
        const deathAction = mixer.clipAction(ghoulTemplate.animations[1]);

        if (deathAction) {
          deathAction.setLoop(THREE.LoopOnce);
          deathAction.clampWhenFinished = true;
        }

        mesh.userData.walkAction = walkAction;
        mesh.userData.runAction = runAction;
        mesh.userData.heavyBreatheAction = heavyBreatheAction;
        mesh.userData.slowBreatheAction = slowBreatheAction;
        mesh.userData.deathAction = deathAction;

        if (walkAction) {
          walkAction.play();
          mesh.userData.currentAction = walkAction;
          mesh.userData.activeAction = walkAction;
        }
        npcMixers[id] = mixer;
      }

      npcMeshes[id] = mesh;
      playerGroup.add(mesh);
    }

    const ud = mesh.userData;
    const hits = getNpcRemainingHits(npc);
    if (ud.lastHits !== hits) {
      if (ud.healthCtx) {
        repaintNpcHealthBar(ud.healthCtx, hits);
        ud.healthTexture.needsUpdate = true;
      }
      ud.lastHits = hits;
    }

    const y = typeof npc.y === 'number' ? npc.y : 0;
    if (ud.prevServer) {
      const px = npc.x - ud.prevServer.x;
      const pz = npc.z - ud.prevServer.z;
      const nowMs = performance.now();
      const dtSec = Math.max(0.001, (nowMs - ud.prevServerTime) / 1000);
      const instSpeed = Math.hypot(px, pz) / dtSec;
      ud.serverSpeed = (ud.serverSpeed || 0) * 0.6 + instSpeed * 0.4;
    }
    ud.prevServer = { x: npc.x, z: npc.z };
    ud.prevServerTime = performance.now();
    ud.targets = ud.targets || { x: 0, y: 0, z: 0 };
    ud.targets.x = npc.x;
    ud.targets.y = y;
    ud.targets.z = npc.z;

    if (!ud.initialized) {
      mesh.position.set(npc.x, y, npc.z);
      ud.initialized = true;
    }
  }
}

function updateNpcVisuals(dt) {
  let anyNpcChasing = false; // Aggregated every frame; drives the screech state-change triggers below.
  for (const id of Object.keys(npcMeshes)) {
    const mesh = npcMeshes[id];
    const ud = mesh.userData;
    const t = ud.targets;
    if (!t) continue;

    const lerpFactor = 1 - Math.exp(-NPC_POS_LERP_SPEED * dt);
    mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, t.x, lerpFactor);
    mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, t.y, lerpFactor);
    mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, t.z, lerpFactor);

    const dx = t.x - mesh.position.x;
    const dz = t.z - mesh.position.z;
    if (dx * dx + dz * dz > NPC_FACE_MIN_DIST_SQ) {
      npcScratch.set(t.x, mesh.position.y, t.z);
      mesh.lookAt(npcScratch);
    }

    if (ud.isDead) continue;
    const npc = npcs[id];
    const state = String(npc ? (npc.state || npc.mode || npc.aiState || '') : '').toLowerCase().trim();

    // True while this skeleton NPC is actively targeting/chasing the player.
    const isChasingPlayer = state === 'chasing' || state === 'chase' || (!state && npc && (npc.chasing === true || npc.chase === true || npc.aggro === true));
    if (isChasingPlayer) anyNpcChasing = true;

    let targetAction = ud.walkAction;
    let fadeDuration = 0.2;

    if (isChasingPlayer) {
      targetAction = ud.runAction || ud.walkAction;
      fadeDuration = 0.2;
    } else if (state === 'exhausted_heavy' || state === 'exhaustedheavy') {
      targetAction = ud.heavyBreatheAction || ud.walkAction;
      fadeDuration = 0.3;
    } else if (state === 'exhausted_slow' || state === 'exhaustedslow') {
      targetAction = ud.slowBreatheAction || ud.walkAction;
      fadeDuration = 0.3;
    } else if (state === 'patrolling' || state === 'patrol' || state === 'returning' || state === 'return') {
      targetAction = ud.walkAction;
      fadeDuration = 0.2;
    }

    ud.activeAction = targetAction;
    if (ud.attacking) continue;

    if (targetAction && targetAction !== ud.currentAction) {
      const prevAction = ud.currentAction;
      targetAction.reset();
      targetAction.enabled = true;
      targetAction.setEffectiveTimeScale(1.0);
      targetAction.setEffectiveWeight(1.0);
      if (prevAction) {
        targetAction.crossFadeFrom(prevAction, fadeDuration, false);
      }
      targetAction.play();
      ud.currentAction = targetAction;
    }
  }

  // --- Skeleton screech state-change triggers (audio only; no AI/gameplay changes) ---
  // anyNpcChasing aggregates every live skeleton, so the run screech fires exactly
  // once when the FIRST skeleton starts chasing, and the rest screech fires exactly
  // once when the LAST skeleton stops chasing and returns to its resting/idle state.
  if (anyNpcChasing && !skeletonWasChasing) {
    // Skeleton just started chasing the player!
    skeletonWasChasing = true;
    if (screechRunReady && screechRunSound) {
      if (screechRunSound.isPlaying) screechRunSound.stop();
      try { screechRunSound.play(); } catch (e) {}
    }
  } else if (!anyNpcChasing && skeletonWasChasing) {
    // Skeleton stopped chasing and is going back to rest/idle!
    skeletonWasChasing = false;
    if (screechRestReady && screechRestSound) {
      if (screechRestSound.isPlaying) screechRestSound.stop();
      try { screechRestSound.play(); } catch (e) {}
    }
  }
}

function updateLootMeshes() {
  const activeLootIds = new Set(Object.keys(lootDrops));
  for (const id of Object.keys(lootMeshes)) {
    if (!activeLootIds.has(id)) {
      const deadMesh = lootMeshes[id];
      scene.remove(deadMesh);
      if (deadMesh.geometry) deadMesh.geometry.dispose();
      if (deadMesh.material) deadMesh.material.dispose();
      delete lootMeshes[id];
    }
  }

  for (const [id, loot] of Object.entries(lootDrops)) {
    let mesh = lootMeshes[id];
    if (!mesh) {
      const geo = new THREE.CylinderGeometry(5, 5, 1.5, 16);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      lootMeshes[id] = mesh;
    }
    mesh.position.x = loot.x;
    mesh.position.z = typeof loot.z === 'number' ? loot.z : loot.y;
  }
}

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
  let color = 0xffe27a; 
  if (isHit) color = 0xff9d45; 
  if (isKnife) color = 0x9fd8ff; 

  const equippedModel = data.weaponId ? STORE_CATALOG[data.weaponId] : null;
  if (equippedModel && typeof equippedModel.tracer === 'number') {
    color = equippedModel.tracer;
  }

  const thickness = TRACER_RADIUS * (data.weaponType === 'secondary' ? 0.7 : 1);
  const geometry = new THREE.CylinderGeometry(thickness * 0.35, thickness, length, 6, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.renderOrder = 5;
  tracerGroup.add(mesh);
  tracers.push({ mesh, geometry, material, bornAt: performance.now() });
}

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
    const squash = 1 - life * 0.25;
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

function showMainMenuRoot() {
  deathScreen.classList.add('hidden');
  hideMatchOver();
  closeHostSettings();
  mainMenu.classList.remove('hidden');
  if (menuButtonsZones) menuButtonsZones.classList.add('hidden');
  if (menuButtonsRoot) menuButtonsRoot.classList.remove('hidden');
  hideHud();
  if (crosshair) crosshair.classList.add('hidden');
  if (roomCodeBar) roomCodeBar.classList.add('hidden');
  if (lobbyPanel) lobbyPanel.classList.add('hidden');
  if (lockHint) lockHint.classList.add('hidden');
  if (controls) controls.unlock();
}

function hideMainMenu() {
  mainMenu.classList.add('hidden');
}

function showDeathScreen() {
  deathScreen.classList.remove('hidden');
  if (crosshair) crosshair.classList.add('hidden');
  if (lockHint) lockHint.classList.add('hidden');
  if (controls) controls.unlock();

  const respawnBtn = document.getElementById('btn-respawn');
  if (respawnBtn) {
    respawnBtn.disabled = true;
    let count = 5;
    respawnBtn.textContent = 'Respawning in ' + count + '...';
    if (window.respawnCountdown) clearInterval(window.respawnCountdown);
    window.respawnCountdown = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(window.respawnCountdown);
        window.respawnCountdown = null;
        respawnBtn.disabled = false;
        respawnBtn.textContent = 'Respawn';
      } else {
        respawnBtn.textContent = 'Respawning in ' + count + '...';
      }
    }, 1000);
  }
}

function hideDeathScreen() {
  deathScreen.classList.add('hidden');
  if (window.respawnCountdown) {
    clearInterval(window.respawnCountdown);
    window.respawnCountdown = null;
  }
  const respawnBtn = document.getElementById('btn-respawn');
  if (respawnBtn) {
    respawnBtn.disabled = false;
    respawnBtn.textContent = 'Respawn';
  }
}

function showHud() {
  hudHint.classList.remove('hidden');
  hudRoleDisplay.classList.remove('hidden');
  hudLeaderboard.classList.remove('hidden');
  if (minimapCanvas) minimapCanvas.classList.remove('hidden');
  if (matchTimerEl) matchTimerEl.classList.remove('hidden');
  if (crosshair && controls && controls.isLocked) crosshair.classList.remove('hidden');
  updateHealthDisplay();
  updateWeaponHud();
  updateRoleDisplay();
  updateTimerDisplay();
  updateLobbyUi();
}

function hideHud() {
  hudHint.classList.add('hidden');
  hudRoleDisplay.classList.add('hidden');
  hudLeaderboard.classList.add('hidden');
  if (minimapCanvas) minimapCanvas.classList.add('hidden');
  if (hudHealthBar) hudHealthBar.classList.add('hidden');
  if (matchTimerEl) matchTimerEl.classList.add('hidden');
  if (crosshair) crosshair.classList.add('hidden');
  if (lockHint) lockHint.classList.add('hidden');
  if (weaponHud) weaponHud.classList.add('hidden');
  if (healProgressContainer) healProgressContainer.classList.add('hidden');
}

function updateLobbyUi() {
  const waiting = matchState === 'waiting';
  if (lobbyPanel) lobbyPanel.classList.toggle('hidden', !waiting);
  if (lobbyStatus && waiting) {
    if (isPrivateRoom) {
      lobbyStatus.textContent = isRoomHost
        ? 'Waiting for players — start the match when ready.'
        : 'Waiting for the Host to start the match…';
    } else {
      lobbyStatus.textContent = Object.keys(players).length < 2
        ? 'Waiting for at least 2 players…'
        : `Match starts in ${formatTime(timeLeft)}`;
    }
  }
  if (startMatchBtn) startMatchBtn.classList.toggle('hidden', !(waiting && isPrivateRoom && isRoomHost));

  const showRoomCode = isPrivateRoom && hasJoined && !!currentRoomCode;
  if (roomCodeBar) {
    if (showRoomCode) setRoomCodeHudText(currentRoomCode);
    roomCodeBar.classList.toggle('hidden', !showRoomCode);
  }
  if (copyRoomCodeBtn) copyRoomCodeBtn.classList.toggle('hidden', !(showRoomCode && myIsHost));
}

function setRoomCodeHudText(code) {
  if (!roomCodeSmallText) return;
  if (!code) {
    roomCodeSmallText.textContent = '';
    return;
  }
  roomCodeSmallText.innerHTML = `ROOM: <span class="rc-code"></span>`;
  roomCodeSmallText.querySelector('.rc-code').textContent = code;
}

function isInputOrModalActive() {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
    return true;
  }
  const store = document.getElementById('storeOverlay');
  if (store && !store.classList.contains('hidden')) return true;
  const pause = document.getElementById('pauseMenuOverlay');
  if (pause && !pause.classList.contains('hidden')) return true;
  const settings = document.getElementById('settingsModalOverlay');
  if (settings && !settings.classList.contains('hidden')) return true;
  const hostSettings = document.getElementById('hostSettingsOverlay');
  if (hostSettings && !hostSettings.classList.contains('hidden')) return true;
  const auth = document.getElementById('authOverlay');
  if (auth && !auth.classList.contains('hidden')) return true;
  const starter = document.getElementById('starterOverlay');
  if (starter && !starter.classList.contains('hidden')) return true;
  const mainMenu = document.getElementById('main-menu');
  if (mainMenu && !mainMenu.classList.contains('hidden')) return true;
  const deathScreen = document.getElementById('death-screen');
  if (deathScreen && !deathScreen.classList.contains('hidden')) return true;
  return false;
}

function triggerPropHeal() {
  if (!socket || !hasJoined || matchState !== 'playing' || !amAlive) return;
  if (myRole !== 'prop') return;
  if (myHealth >= 100) return;
  if (myIsPropHealing) return;
  if (myHealCooldownRemaining > 0) return;
  if (isInputOrModalActive()) return;

  socket.emit('requestPropHeal');
}

function updateHealStatusHud() {
  if (!amAlive || (myRole !== 'prop' && myRole !== 'hunter') || matchState === 'waiting') {
    if (propHealIndicator) propHealIndicator.classList.add('hidden');
    if (hunterRegenIcon) hunterRegenIcon.classList.add('hidden');
    if (hudHealthBar) hudHealthBar.classList.remove('healing-pulse');
    return;
  }

  if (myRole === 'hunter') {
    if (propHealIndicator) propHealIndicator.classList.add('hidden');
    if (myIsPassiveHealing) {
      if (hudHealthBar) hudHealthBar.classList.add('healing-pulse');
      if (hunterRegenIcon) hunterRegenIcon.classList.remove('hidden');
    } else {
      if (hudHealthBar) hudHealthBar.classList.remove('healing-pulse');
      if (hunterRegenIcon) hunterRegenIcon.classList.add('hidden');
    }
  } else if (myRole === 'prop') {
    if (hunterRegenIcon) hunterRegenIcon.classList.add('hidden');
    if (propHealIndicator) propHealIndicator.classList.remove('hidden');

    const now = performance.now();
    const isInterrupted = now < healInterruptedUntil;

    if (myIsPropHealing) {
      if (hudHealthBar) hudHealthBar.classList.add('healing-pulse');
      if (propHealStatusText) {
        propHealStatusText.className = 'prop-heal-status-active';
        propHealStatusText.textContent = 'Healing...';
        propHealStatusText.style.opacity = '1';
      }
    } else {
      if (hudHealthBar) hudHealthBar.classList.remove('healing-pulse');
      if (propHealStatusText) {
        if (isInterrupted) {
          propHealStatusText.className = 'prop-heal-status-interrupted';
          propHealStatusText.textContent = 'Heal interrupted!';
          propHealStatusText.style.opacity = '1';
        } else if (myHealCooldownRemaining > 0) {
          propHealStatusText.className = 'prop-heal-status-cooldown';
          propHealStatusText.textContent = `Heal: ${myHealCooldownRemaining}s`;
          propHealStatusText.style.opacity = '1';
        } else {
          propHealStatusText.className = 'prop-heal-status-ready';
          propHealStatusText.innerHTML = '<kbd>[H]</kbd> Heal';
          propHealStatusText.style.opacity = myHealth >= 100 ? '0.55' : '1';
        }
      }
    }
  }
}

function updateHealthDisplay() {
  if (!hudHealthFill || !hudHealthText || !hudHealthBar) return;
  if (amAlive && (myRole === 'prop' || myRole === 'hunter')) {
    hudHealthBar.classList.remove('hidden');
    const pct = Math.max(0, Math.min(100, myHealth));
    hudHealthFill.style.width = pct + '%';
    hudHealthText.textContent = Math.round(pct).toString();
    if (pct > 60) hudHealthFill.style.background = '#2ecc71';
    else if (pct > 30) hudHealthFill.style.background = '#f39c12';
    else hudHealthFill.style.background = '#e74c3c';
    updateHealStatusHud();
  } else {
    hudHealthBar.classList.add('hidden');
    if (propHealIndicator) propHealIndicator.classList.add('hidden');
    if (hunterRegenIcon) hunterRegenIcon.classList.add('hidden');
  }
}

function updateRoleDisplay() {
  if (!hudRoleDisplay) return;
  if (matchState === 'waiting') {
    hudRoleDisplay.textContent = 'You are: Staging';
  } else if (!amAlive) {
    hudRoleDisplay.textContent = 'You are: Eliminated';
  } else {
    hudRoleDisplay.textContent = `You are: ${myRole === 'hunter' ? 'Hunter' : 'Prop'}`;
  }
}

function updateLobbyStats() {
  const totalEl = document.getElementById('lobby-total');
  const huntersEl = document.getElementById('lobby-hunters');
  const propsEl = document.getElementById('lobby-props');
  if (!totalEl || !huntersEl || !propsEl) return;
  let total = 0, hunters = 0, propsCount = 0;
  for (const id in players) {
    total++;
    if (players[id].role === 'hunter') hunters++;
    else if (players[id].role === 'prop') propsCount++;
  }
  totalEl.textContent = `Total Players: ${total}`;
  huntersEl.textContent = `Hunters: ${hunters}`;
  propsEl.textContent = `Props: ${propsCount}`;
}

function renderLeaderboardInto(listElement, entries) {
  if (!listElement) return;
  if (!entries || entries.length === 0) {
    listElement.innerHTML = '<li class="lb-empty">No scores yet</li>';
    return;
  }
  listElement.innerHTML = entries.map((entry, index) => {
    const isMe = entry.id === myId;
    const roleLabel = entry.role === 'hunter' ? 'Hunter' : 'Prop';
    const statusLabel = entry.alive ? '' : ' (out)';
    const display = entry.displayName || entry.name || (entry.id ? entry.id.slice(0, 5) : 'Guest');
    return `
      <li class="${isMe ? 'lb-me' : ''}">
        <span class="lb-rank">${index + 1}.</span>
        <span class="lb-name">${isMe ? ('You (' + display + ')') : display}</span>
        <span class="lb-role lb-role-${entry.role}">${roleLabel}${statusLabel}</span>
        <span class="lb-score">${entry.score}</span>
      </li>
    `;
  }).join('');
}

function renderLeaderboard(entries) {
  lastLeaderboardEntries = entries || [];
  renderLeaderboardInto(document.getElementById('leaderboardList'), lastLeaderboardEntries);
  renderLeaderboardInto(document.getElementById('deathLeaderboardList'), lastLeaderboardEntries);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return String(m).padStart(2, '0') + ':' + String(rem).padStart(2, '0');
}

function updateMapInfo() {
  if (!mapInfoEl) return;
  if (matchState === 'waiting') {
    mapInfoEl.textContent = `Map: ${lobbyMapName}  ·  Time: ${Math.round(selectedTimeLimit / 60)} min`;
  } else {
    const zoneName = currentZone && currentZone.name ? currentZone.name : 'Unknown District';
    mapInfoEl.textContent = `Ghost Town — ${worldWidth}x${worldHeight} — ${zoneName}`;
  }
}

function updateTimerDisplay() {
  if (!matchTimerEl) return;
  matchTimerEl.textContent = matchState === 'waiting' && isPrivateRoom ? 'WAITING' : formatTime(timeLeft);
  if (timeLeft <= 60 && matchState === 'playing') matchTimerEl.classList.add('timer-warning');
  else matchTimerEl.classList.remove('timer-warning');
}

function startIntermissionCountdown(seconds) {
  if (intermissionCountdownInterval) {
    clearInterval(intermissionCountdownInterval);
    intermissionCountdownInterval = null;
  }
  intermissionSeconds = seconds || 10;
  if (matchOverCountdown) {
    matchOverCountdown.textContent = `Returning to Lobby in ${intermissionSeconds}...`;
    matchOverCountdown.classList.remove('hidden');
  }
  intermissionCountdownInterval = setInterval(() => {
    intermissionSeconds--;
    if (matchOverCountdown) {
      matchOverCountdown.textContent = intermissionSeconds > 0 ? `Returning to Lobby in ${intermissionSeconds}...` : 'Returning to Lobby...';
    }
    if (intermissionSeconds <= 0) {
      clearInterval(intermissionCountdownInterval);
      intermissionCountdownInterval = null;
    }
  }, 1000);
}

function stopIntermissionCountdown() {
  if (intermissionCountdownInterval) {
    clearInterval(intermissionCountdownInterval);
    intermissionCountdownInterval = null;
  }
  if (matchOverCountdown) matchOverCountdown.classList.add('hidden');
}

function showMatchOver(winner, leaderboardEntries, intermissionSecs) {
  if (!matchOverOverlay || !matchOverTitle) return;
  const isProps = (winner === 'PROPS' || winner === 'PROPS WIN');
  matchOverTitle.textContent = isProps ? 'PROPS WIN' : 'HUNTERS WIN';
  matchOverTitle.className = isProps ? 'props-win' : 'hunters-win';
  
  startIntermissionCountdown(intermissionSecs || 10);
  
  if (matchOverSubtitle) {
    if (isPrivateRoom) matchOverSubtitle.textContent = 'Waiting for Host to start next round...';
    else matchOverSubtitle.textContent = 'New match starting automatically...';
  }

  const listEl = document.getElementById('matchOverLeaderboardList');
  if (listEl) {
    if (Array.isArray(leaderboardEntries) && leaderboardEntries.length > 0) {
      listEl.innerHTML = leaderboardEntries.map((entry, idx) => {
        const roleLabel = entry.role ? (entry.role === 'prop' ? 'Prop' : 'Hunter') : '';
        const nameStr = entry.displayName || entry.name || ((entry.id && typeof entry.id === 'string') ? entry.id.substring(0, 6) : 'Unknown');
        return `<li><span class="lb-rank">#${idx + 1}</span><span class="lb-name">${nameStr}</span><span class="lb-score">${entry.score || 0}</span><span class="lb-role">${roleLabel}</span></li>`;
      }).join('');
    } else {
      listEl.innerHTML = '<li class="lb-empty">No scores yet</li>';
    }
  }

  matchOverOverlay.classList.remove('hidden');
  matchOverOverlay.style.pointerEvents = 'auto';
  matchState = 'ended';
  if (matchTimerEl) matchTimerEl.classList.add('hidden');
}

function hideMatchOver() {
  stopIntermissionCountdown();
  if (matchOverOverlay) {
    matchOverOverlay.classList.add('hidden');
    matchOverOverlay.style.pointerEvents = 'none';
  }
}

function hideLoadingOverlay() {
  if (loadingOverlay) loadingOverlay.style.display = 'none';
}

function showLoadingError(error) {
  console.error(error);
  if (loadingOverlay) {
    loadingOverlay.textContent = 'Failed to load game assets. Please refresh the page.';
    loadingOverlay.classList.add('loading-error');
  }
}

function joinGame(options) {
  if (!socket || hasJoined) return;
  hasJoined = true;
  hideJoinError();
  const opts = { ...(options || {}) };

  if (opts.matchType === 'private' && !opts.roomCode) {
    opts.zone = opts.zone || 'oldCityCenter';
    opts.timeLimit = opts.timeLimit || DEFAULT_PRIVATE_TIME_LIMIT;
  }

  opts.playerId = persistentPlayerId;
  const starterId = chosenStarterSkinId || defaultEquippedSkinId();
  opts.starterSkin = starterId;
  const savedSkin = readSavedEquippedSkin();
  const activeSkin = myLoadout.equippedSkin || myEquippedSkin || savedSkin || starterId;
  opts.equippedSkin = activeSkin;
  opts.skinId = activeSkin;
  opts.gender = starterGender || (starterId === FEMALE_STARTER_ID ? 'female' : 'male');
  socket.emit('joinGame', opts);
  if (opts.matchType === 'private' && !opts.roomCode) {
    socket.emit('createRoom', opts);
  } else if (opts.roomCode) {
    socket.emit('joinRoom', opts);
  }
  hideMainMenu();
  hideDeathScreen();
  hideMatchOver();
  showHud();
  if (lockHint && !controls.isLocked) {
    lockHint.classList.remove('hidden');
  }
}

function createRoom(options) {
  const savedSkin = readSavedEquippedSkin();
  const activeSkin = myLoadout.equippedSkin || myEquippedSkin || savedSkin || (chosenStarterSkinId || defaultEquippedSkinId());
  const opts = Object.assign({
    matchType: 'private',
    zone: 'oldCityCenter',
    timeLimit: DEFAULT_PRIVATE_TIME_LIMIT,
    roomCode: null,
    equippedSkin: activeSkin,
    skinId: activeSkin
  }, options || {});
  joinGame(opts);
}

function joinRoom(roomCode) {
  const savedSkin = readSavedEquippedSkin();
  const activeSkin = myLoadout.equippedSkin || myEquippedSkin || savedSkin || (chosenStarterSkinId || defaultEquippedSkinId());
  joinGame({
    matchType: 'private',
    zone: null,
    roomCode: roomCode,
    equippedSkin: activeSkin,
    skinId: activeSkin
  });
}

function showJoinError(message) {
  if (!joinErrorEl) return;
  joinErrorEl.textContent = message || 'Could not join that match.';
  joinErrorEl.classList.remove('hidden');
}

function hideJoinError() {
  if (joinErrorEl) joinErrorEl.classList.add('hidden');
}

function openHostSettings() {
  if (!hostSettingsOverlay || hostSettingsOpen) return;
  hostSettingsOpen = true;
  if (controls && controls.isLocked) controls.unlock();
  syncHostSettingsSelects();
  hostSettingsOverlay.classList.remove('hidden');
  if (lobbyComputerHint) lobbyComputerHint.classList.add('hidden');
  if (crosshair) crosshair.classList.add('hidden');
  if (lockHint) lockHint.classList.add('hidden');
}

function closeHostSettings() {
  hostSettingsOpen = false;
  if (hostSettingsOverlay) hostSettingsOverlay.classList.add('hidden');
  if (lobbyComputerHint) lobbyComputerHint.classList.add('hidden');
  if (crosshair) crosshair.classList.toggle('hidden', !(controls && controls.isLocked));
  if (lockHint) lockHint.classList.toggle('hidden', Boolean(controls && controls.isLocked));
}

function syncHostSettingsSelects() {
  if (settingsZoneSelect) settingsZoneSelect.value = roomSettingsZoneId;
  if (settingsTimeSelect) settingsTimeSelect.value = String(selectedTimeLimit);
}

function updateLobbyComputerInteraction() {
  const near = Boolean(hasJoined && myIsHost && !hostSettingsOpen && Math.hypot(localX - LOBBY_COMPUTER_X, localZ - LOBBY_COMPUTER_Z) <= LOBBY_COMPUTER_INTERACT_DISTANCE);
  if (near === nearLobbyComputer) return;
  nearLobbyComputer = near;
  if (lobbyComputerHint) lobbyComputerHint.classList.toggle('hidden', !near);
}

const btnPlayGlobal = document.getElementById('btn-play-global');
if (btnPlayGlobal) {
  btnPlayGlobal.addEventListener('click', () => {
    if (menuButtonsRoot) menuButtonsRoot.classList.add('hidden');
    if (menuButtonsZones) menuButtonsZones.classList.remove('hidden');
  });
}

const btnCreatePrivate = document.getElementById('btn-create-private');
if (btnCreatePrivate) {
  btnCreatePrivate.addEventListener('click', () => {
    joinGame({ matchType: 'private', zone: 'oldCityCenter', timeLimit: DEFAULT_PRIVATE_TIME_LIMIT, roomCode: null });
  });
}

const zoneButtons = document.querySelectorAll('#menu-buttons-zones .zone-btn');
zoneButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const clickedZone = btn.dataset.zone || btn.getAttribute('data-zone') || 'oldCityCenter';
    joinGame({ matchType: 'global', zone: clickedZone });
  });
});

const btnZonesBackEl = document.getElementById('btn-zones-back');
if (btnZonesBackEl) {
  btnZonesBackEl.addEventListener('click', () => {
    if (menuButtonsZones) menuButtonsZones.classList.add('hidden');
    if (menuButtonsRoot) menuButtonsRoot.classList.remove('hidden');
  });
}

const ROOM_CODE_LENGTH = 4;
const roomCodeCounter = document.getElementById('room-code-counter');

function normalizeRoomCode(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

function applyRoomCodeFormatting() {
  if (!roomCodeInput) return;
  const before = roomCodeInput.value;
  const caretAtEnd = roomCodeInput.selectionStart === before.length;
  const legalBeforeCaret = normalizeRoomCode(before.slice(0, roomCodeInput.selectionStart ?? before.length)).length;
  const after = normalizeRoomCode(before);
  if (after !== before) {
    roomCodeInput.value = after;
    if (!caretAtEnd) {
      try { roomCodeInput.setSelectionRange(legalBeforeCaret, legalBeforeCaret); } catch (_) {}
    }
  }
  updateRoomCodeAffordances();
}

function updateRoomCodeAffordances() {
  if (!roomCodeInput) return;
  const len = roomCodeInput.value.length;
  const complete = len === ROOM_CODE_LENGTH;
  roomCodeInput.classList.toggle('code-complete', complete);
  roomCodeInput.classList.remove('code-error');
  if (roomCodeCounter) {
    roomCodeCounter.textContent = complete ? `${len} / ${ROOM_CODE_LENGTH} — press Join` : `${len} / ${ROOM_CODE_LENGTH}`;
    roomCodeCounter.classList.toggle('ready', complete);
  }
}

function flashRoomCodeError() {
  if (!roomCodeInput) return;
  roomCodeInput.classList.remove('code-complete', 'code-error');
  void roomCodeInput.offsetWidth;
  roomCodeInput.classList.add('code-error');
  roomCodeInput.focus();
  roomCodeInput.select();
}

if (roomCodeInput) {
  roomCodeInput.addEventListener('input', () => { applyRoomCodeFormatting(); hideJoinError(); });
  roomCodeInput.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    roomCodeInput.value = normalizeRoomCode(pasted);
    hideJoinError();
    updateRoomCodeAffordances();
  });
  roomCodeInput.addEventListener('keydown', (e) => {
    if (!e.key) return; // Safety check
    if (e.key === 'Enter') {
      e.preventDefault();
      submitPrivateJoin();
    }
  });
  roomCodeInput.addEventListener('focus', () => { if (roomCodeInput.value.length) roomCodeInput.select(); });
  updateRoomCodeAffordances();
}

function submitPrivateJoin() {
  const code = normalizeRoomCode(roomCodeInput ? roomCodeInput.value : '');
  if (code.length !== ROOM_CODE_LENGTH) {
    showJoinError('Enter the 4-character room code from your friend\'s HUD (letters and numbers).');
    flashRoomCodeError();
    return;
  }
  joinGame({ matchType: 'private', zone: null, roomCode: code });
}

document.getElementById('btn-join-private').addEventListener('click', submitPrivateJoin);

if (settingsApplyBtn) {
  settingsApplyBtn.addEventListener('click', () => {
    if (!socket || !myIsHost) return;
    const zoneId = settingsZoneSelect ? settingsZoneSelect.value : 'oldCityCenter';
    const timeLimit = Number.parseInt(settingsTimeSelect ? settingsTimeSelect.value : '300', 10);
    socket.emit('updateRoomSettings', { zoneId, timeLimit });
    closeHostSettings();
  });
}
if (settingsCloseBtn) {
  settingsCloseBtn.addEventListener('click', closeHostSettings);
}

function normalizeMyLoadout(loadout, inventory) {
  const owned = new Set(Array.isArray(inventory) ? inventory : myInventory);
  const savedSkin = readSavedEquippedSkin();
  if (savedSkin) owned.add(savedSkin);
  if (myEquippedSkin) owned.add(myEquippedSkin);
  const source = (loadout && typeof loadout === 'object') ? loadout : {};
  const normalized = {};
  for (const slot of LOADOUT_SLOTS) {
    let wanted = typeof source[slot] === 'string' ? source[slot] : DEFAULT_LOADOUT[slot];
    if (slot === 'equippedSkin' && wanted === 'default') wanted = MALE_STARTER_ID;
    if (slot === 'equippedSkin') {
      if (STORE_CATALOG[wanted] && (owned.has(wanted) || !STARTER_SKIN_IDS.includes(wanted))) {
        normalized[slot] = wanted;
      } else {
        normalized[slot] = savedSkin || defaultEquippedSkinId();
      }
    } else {
      normalized[slot] = (STORE_CATALOG[wanted] && owned.has(wanted)) ? wanted : DEFAULT_LOADOUT[slot];
    }
  }
  if (STARTER_SKIN_IDS.includes(normalized.equippedSkin)
      && normalized.equippedSkin !== chosenStarterSkinId
      && !(source && typeof source.equippedSkin === 'string' && STORE_CATALOG[source.equippedSkin])) {
    normalized.equippedSkin = guaranteedStarterSkinId();
  }
  return normalized;
}

function ensureExclusiveStarterInventory() {
  const keep = guaranteedStarterSkinId();
  myInventory = myInventory.filter((id) => !STARTER_SKIN_IDS.includes(id) || id === keep);
}

function applyLoadoutState(inventory, loadout) {
  const savedSkin = readSavedEquippedSkin();
  if (Array.isArray(inventory)) {
    const set = new Set(inventory);
    for (const id of DEFAULT_INVENTORY) set.add(id);
    set.add(guaranteedStarterSkinId());
    if (savedSkin) set.add(savedSkin);
    if (myEquippedSkin) set.add(myEquippedSkin);
    myInventory = Array.from(set);
  }
  ensureExclusiveStarterInventory();
  if (savedSkin && !myInventory.includes(savedSkin)) {
    myInventory.push(savedSkin);
  }
  myLoadout = normalizeMyLoadout(loadout, myInventory);

  if (savedSkin && STORE_CATALOG[savedSkin]) {
    if (!myLoadout.equippedSkin || STARTER_SKIN_IDS.includes(myLoadout.equippedSkin) || !STORE_CATALOG[myLoadout.equippedSkin]) {
      if (!STARTER_SKIN_IDS.includes(savedSkin)) {
        myLoadout.equippedSkin = savedSkin;
      }
    }
  }
  myEquippedSkin = myLoadout.equippedSkin;
  if (myEquippedSkin) {
    persistEquippedSkin(myEquippedSkin);
  }
}

function updateAllCoinCounters() {
  const coinStr = `${Number(myCoins || 0).toLocaleString()} Coins`;
  if (storeCoinBalance) {
    storeCoinBalance.textContent = coinStr;
  }
  document.querySelectorAll('#storeCoinBalance, .store-coin-balance, #menuCoins, #menuCoinBalance, #profileCoins, #inventoryCoins, [data-coin-balance]').forEach(el => {
    el.textContent = coinStr;
  });
  updateAccountLabel();
}

function updateAccountLabel() {
  if (menuAccountLabel) {
    const namePart = isRegistered ? ('Signed in as ' + (myUsername || myDisplayName)) : ('Playing as ' + myDisplayName);
    menuAccountLabel.textContent = `${namePart} · 🪙 ${Number(myCoins || 0).toLocaleString()} Coins`;
  }
  if (btnAuth) btnAuth.textContent = isRegistered ? 'Account' : 'Register / Login';
}

function applyWalletPayload(data) {
  if (!data) return;
  if (typeof data.coins === 'number') myCoins = data.coins;
  if (data.loadout || data.inventory !== undefined || typeof data.equippedSkin === 'string') {
    applyLoadoutState(data.inventory, data.loadout || { equippedSkin: data.equippedSkin });
  }
  if (Array.isArray(data.ownedWeapons)) {
    for (const wId of data.ownedWeapons) {
      if (!myInventory.includes(wId)) myInventory.push(wId);
    }
  }
  if (data.ok && data.itemId) {
    if (!myInventory.includes(data.itemId)) myInventory.push(data.itemId);
  }
  if (typeof data.isRegistered === 'boolean') isRegistered = data.isRegistered;
  if (typeof data.genderLocked === 'boolean') {
    isGenderLocked = data.genderLocked;
    try { localStorage.setItem(LS_GENDER_LOCKED, data.genderLocked ? 'true' : 'false'); } catch (e) {}
  }
  if (data.gender === 'male' || data.gender === 'female') {
    starterGender = data.gender;
    hasChosenStarter = true;
    try {
      localStorage.setItem(LS_STARTER_GENDER, data.gender);
      const starterObj = STARTER_BY_GENDER[data.gender];
      if (starterObj) {
        localStorage.setItem(LS_STARTER_MODEL, starterObj.file);
        localStorage.setItem(LS_STARTER_SKIN, starterObj.id);
      }
    } catch (e) {}
    ensureExclusiveStarterInventory();
  }
  if (data.username !== undefined) myUsername = data.username || null;
  if (typeof data.displayName === 'string' && data.displayName) {
    myDisplayName = data.displayName;
  } else if (isRegistered && myUsername) {
    myDisplayName = myUsername;
  } else {
    myDisplayName = 'Guest_' + String(persistentPlayerId).slice(-4);
  }
  updateAllCoinCounters();
  refreshStoreUi();
  updateWeaponHud();
}

function openAuthMenu() {
  if (!authOverlay) return;
  if (authError) {
    authError.textContent = '';
    authError.classList.add('hidden');
  }
  authOverlay.classList.remove('hidden');
}

function closeAuthMenu() {
  if (authOverlay) authOverlay.classList.add('hidden');
}

function showAuthError(message) {
  if (!authError) return;
  authError.textContent = message || 'Something went wrong.';
  authError.classList.remove('hidden');
}

function isOwnedItem(itemId) {
  if (!itemId) return false;
  if (myInventory.includes(itemId)) return true;
  const item = STORE_CATALOG[itemId];
  if (item && item.type === 'skin') {
    const clean = cleanSkinId(itemId);
    return myInventory.some((invId) => cleanSkinId(invId) === clean);
  }
  // Weapons and store equipment
  const clean = (item && item.file ? item.file.replace(/\.glb$/i, '') : String(itemId).replace(/\.glb$/i, ''));
  if (myInventory.includes(clean)) return true;
  if (!clean.startsWith('l.') && myInventory.includes('l.' + clean)) return true;
  if (clean.startsWith('l.') && myInventory.includes(clean.slice(2))) return true;

  const normTarget = clean.toLowerCase().replace(/^l\./, '').replace(/[\s\-_.]/g, '');
  return myInventory.some((invId) => {
    if (!invId) return false;
    if (invId === itemId || invId === clean) return true;
    const normInv = String(invId).toLowerCase().replace(/\.(glb|png)$/i, '').replace(/^l\./, '').replace(/[\s\-_.]/g, '');
    return normInv === normTarget;
  });
}

function isEquippedItem(itemId) {
  const item = STORE_CATALOG[itemId];
  if (!item) return false;
  if (item.type === 'skin') {
    const equipped = cleanSkinId(myLoadout.equippedSkin);
    const target = cleanSkinId(itemId);
    return !!(equipped && target && equipped === target);
  }
  return !!(myLoadout[item.slot] === itemId);
}

function switchStoreTab(tab) {
  activeStoreTab = tab === 'inventory' ? 'inventory' : 'shop';
  hideCharacterHoverPreview();
  if (storeTabShop) storeTabShop.classList.toggle('active', activeStoreTab === 'shop');
  if (storeTabInventory) storeTabInventory.classList.toggle('active', activeStoreTab === 'inventory');
  if (storeTabContentShop) storeTabContentShop.classList.toggle('hidden', activeStoreTab !== 'shop');
  if (storeTabContentInventory) storeTabContentInventory.classList.toggle('hidden', activeStoreTab !== 'inventory');
  if (storeTabSubtitle) storeTabSubtitle.textContent = STORE_TAB_COPY[activeStoreTab] || STORE_TAB_COPY.shop;
  if (activeStoreTab === 'inventory') {
    refreshInventoryUi();
    refreshCharacterPreview();
  }
}

function refreshCharacterPreview() {
  const skinId = equippedItemId('equippedSkin');
  const skin = STORE_CATALOG[skinId];
  if (previewFigure) {
    previewFigure.classList.remove('skin-default', 'skin-shadow', 'skin-steel');
    const img = document.getElementById('previewFigureImg');
    if (img) {
      const src = itemPreviewSrc(skinId);
      if (src) {
        img.src = src;
        img.classList.remove('hidden');
        previewFigure.classList.remove('no-image');
      } else {
        img.classList.add('hidden');
        previewFigure.classList.add('no-image');
        previewFigure.textContent = 'Preview';
      }
    }
    previewFigure.dataset.skin = skinId;
    previewFigure.dataset.model = skinFileForId(skinId);
  }
  if (previewSkinName) {
    previewSkinName.textContent = skin ? skin.name : 'Standard Uniform';
  }
  if (previewLoadout) {
    previewLoadout.innerHTML = PREVIEW_LOADOUT_SLOTS.map(({ label }) => {
      return `<div class="preview-slot"><span class="preview-slot-label">${label}</span><span class="preview-slot-value"><img class="preview-gear-thumb" alt="" /><span class="preview-gear-name"></span></span></div>`;
    }).join('');
    const values = previewLoadout.querySelectorAll('.preview-slot-value');
    PREVIEW_LOADOUT_SLOTS.forEach(({ slot }, index) => {
      const item = STORE_CATALOG[equippedItemId(slot)];
      const container = values[index];
      if (!container) return;
      const nameEl = container.querySelector('.preview-gear-name');
      const thumbEl = container.querySelector('.preview-gear-thumb');
      if (nameEl) nameEl.textContent = item ? getItemDisplayName(item) : '—';
      if (thumbEl) {
        const src = item ? itemPreviewSrc(item.id) : '';
        if (src) { thumbEl.src = src; thumbEl.classList.remove('hidden'); }
        else { thumbEl.classList.add('hidden'); }
      }
    });
  }
}

function setStoreStatus(message, color = '#8ee8ff') {
  if (!storeStatus) return;
  storeStatus.textContent = message || '';
  storeStatus.style.color = color;
}

function requestEquipItem(itemId) {
  if (!socket) return;
  setStoreStatus('');
  const clean = cleanSkinId(itemId) || itemId;
  const item = STORE_CATALOG[clean] || STORE_CATALOG[itemId];
  if (!item) return;

  // Strict ownership gate: item can ONLY be equipped if already owned or a free default item
  const isFree = (item.cost !== undefined ? item.cost : item.price) <= 0 ||
    item.id === 'Casual_Character' || item.id === 'Casual_w' ||
    item.id === 'standardRifle' || item.id === 'sidearmPistol' ||
    item.id === 'fieldBlade' || item.id === 'throwingKnife';
  const owned = isOwnedItem(item.id) || isFree;
  if (!owned) {
    console.warn('[store] Cannot equip unowned item:', item.id);
    if (storeStatus) {
      storeStatus.textContent = 'You do not own this item.';
      storeStatus.style.color = '#ff8a7a';
    }
    return;
  }

  if (item.type === 'skin') {
    persistEquippedSkin(item.id);
    socket.emit('equipSkin', { skinId: item.id, playerId: persistentPlayerId });
    if (players[myId]) {
      players[myId].equippedSkin = item.id;
      players[myId].skinId = item.id;
      if (players[myId].loadout) players[myId].loadout.equippedSkin = item.id;
    }
    const myMesh = playerMeshes[myId];
    if (myMesh && !players[myId]?.isProp) {
      attachSkinToPlayer(myId, myMesh, item.id);
    }
    updatePlayerMeshes();
    refreshStoreUi();
    refreshCharacterPreview();
  } else {
    socket.emit('equipItem', { itemId: item.id, playerId: persistentPlayerId });
  }
}

function requestBuyItem(itemId) {
  if (!socket) return;
  const item = STORE_CATALOG[itemId];
  const targetId = (item && item.id) || itemId;
  const itemCost = (item && (item.cost !== undefined ? item.cost : item.price)) || 0;
  const buyPayload = {
    id: targetId,
    itemId: targetId,
    weaponId: targetId,
    skinId: targetId,
    category: (item && (item.slot || item.type)) || 'weapon',
    type: (item && item.type) || 'weapon',
    cost: itemCost,
    price: itemCost,
    playerId: persistentPlayerId
  };
  console.log('[buy-client] sending:', JSON.stringify(buyPayload));
  if (item && item.type === 'skin') socket.emit('buySkin', buyPayload);
  else socket.emit('buyItem', buyPayload);
}

function itemPreviewSrc(itemOrId) {
  const item = typeof itemOrId === 'string' ? STORE_CATALOG[itemOrId] : itemOrId;
  if (!item) return '';
  // Keep existing Store Player Skin card image paths completely unchanged
  if (item.type === 'skin') {
    return `/images/skins/${item.id}.png`;
  }
  // For Weapons cards, use matched thumb if available, or load thumbnail from /store/weapons/<filename>.png (matching each weapon's .glb base filename)
  if (item.thumb) return item.thumb;
  const filename = item.file ? item.file.replace(/\.glb$/i, '') : item.id;
  return `/store/weapons/${filename}.png`;
}

function createStoreSwatch(item) {
  const swatch = document.createElement('div');
  swatch.className = 'store-swatch ' + (STORE_SWATCH_CLASS[item.id] || '');
  swatch.classList.add('sw-image');
  const img = document.createElement('img');
  img.className = 'item-preview-img';
  img.src = itemPreviewSrc(item.id);
  img.alt = getItemDisplayName(item);
  img.loading = 'lazy';
  if (item.type !== 'skin') {
    img.onerror = () => {
      if (!img.dataset.failedOnce) {
        img.dataset.failedOnce = '1';
        const base = (item.file ? item.file.replace(/\.glb$/i, '') : item.id);
        img.src = `/store/weapons/${base}.png`;
      }
    };
  }
  swatch.appendChild(img);
  return swatch;
}

function createStoreCard(item, mode = 'shop') {
  const card = document.createElement('div');
  card.className = 'store-card';
  card.dataset.item = item.id;

  const isLeg = item.isLegendary || (typeof item.id === 'string' && item.id.startsWith('l.'));
  if (isLeg) {
    card.classList.add('legendary-card');
    const legBadge = document.createElement('span');
    legBadge.className = 'card-tier-badge badge-legendary';
    legBadge.textContent = 'LEGENDARY';
    card.appendChild(legBadge);
  }

  card.appendChild(createStoreSwatch(item));

  const heading = document.createElement('h3');
  heading.textContent = getItemDisplayName(item);
  card.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'store-desc';
  desc.textContent = item.stats || '';
  card.appendChild(desc);

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.item = item.id;

  const owned = isOwnedItem(item.id);
  const equipped = isEquippedItem(item.id);

  if (mode === 'inventory') {
    const badge = document.createElement('span');
    badge.className = 'equipped-badge' + (equipped ? ' visible' : ' hidden');
    badge.textContent = 'Equipped';
    card.appendChild(badge);
    button.className = 'store-action ' + (equipped ? 'equipped' : 'owned');
    button.disabled = false;
    button.textContent = equipped ? 'Equipped' : 'Equip';
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!equipped && (owned || item.cost <= 0)) {
        requestEquipItem(item.id);
      } else {
        open3dPreviewModal(item);
      }
    });
  } else {
    // mode === 'shop'
    if (owned || item.cost <= 0) {
      button.id = `storeAction-${item.id}`;
      card.classList.add('is-owned');
      if (equipped) {
        card.classList.add('is-equipped');
        const eqBadge = document.createElement('span');
        eqBadge.className = 'equipped-badge visible';
        eqBadge.textContent = 'Equipped';
        card.appendChild(eqBadge);
      }
      button.className = 'store-action ' + (equipped ? 'equipped' : 'owned');
      button.disabled = false;
      button.textContent = equipped ? 'Equipped' : (item.cost <= 0 ? 'Included · Equip' : 'Equip');
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!equipped) {
          requestEquipItem(item.id);
        } else {
          open3dPreviewModal(item);
        }
      });
    } else {
      // Unowned item: Clicking card OR button ALWAYS opens 360° Preview Popup
      button.id = `storePreviewBtn-${item.id}`;
      button.className = 'store-action store-buy-action';
      button.disabled = false;
      button.textContent = `Buy — ${item.cost}`;
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        hideCharacterHoverPreview();
        open3dPreviewModal(item);
      });
    }
  }

  card.appendChild(button);

  // Clear badge/note right underneath the card stating that the player already owns it
  if (mode === 'shop' && (owned || item.cost <= 0)) {
    const ownedNote = document.createElement('div');
    ownedNote.className = 'store-owned-note';
    ownedNote.textContent = item.type === 'skin' ? '✓ You already own this skin' : '✓ You already own this weapon';
    card.appendChild(ownedNote);
  }

  // Clicking anywhere on the card opens 360-degree interactive 3D preview
  card.addEventListener('click', () => {
    hideCharacterHoverPreview();
    open3dPreviewModal(item);
  });

  return card;
}

function appendLegendarySection(container, items, mode = 'shop') {
  if (!container || items.length === 0) return;

  const section = document.createElement('section');
  section.className = 'store-section store-section-legendary';

  const title = document.createElement('div');
  title.className = 'store-section-title legendary-title';
  const label = document.createElement('span');
  label.textContent = '✦ LEGENDARY WEAPONS ✦';
  title.appendChild(label);

  const sub = document.createElement('span');
  sub.className = 'legendary-subtitle';
  sub.textContent = 'ELITE ARSENAL · GOLD STATUS';
  title.appendChild(sub);
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'store-grid';
  for (const item of items) grid.appendChild(createStoreCard(item, mode));
  section.appendChild(grid);
  container.appendChild(section);
}

function appendCategorySection(container, category, items, mode = 'inventory') {
  if (!container || items.length === 0) return;

  const section = document.createElement('section');
  section.className = 'store-section';

  const title = document.createElement('div');
  title.className = 'store-section-title';
  const label = document.createElement('span');
  label.textContent = category.label;
  title.appendChild(label);

  const equippedItem = STORE_CATALOG[equippedItemId(category.slot)];
  const current = document.createElement('span');
  current.className = 'store-slot-current';
  current.textContent = equippedItem ? `Equipped: ${getItemDisplayName(equippedItem)}` : '';
  title.appendChild(current);
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'store-grid';
  for (const item of items) grid.appendChild(createStoreCard(item, mode));
  section.appendChild(grid);
  container.appendChild(section);
}

function itemsForCategory(type) {
  if (type === 'skin') {
    return SHOP_SKIN_ORDER.map((id) => STORE_CATALOG[id]).filter(Boolean);
  }
  if (type === 'hunterWeapon') {
    return STORE_ITEM_IDS.map((id) => STORE_CATALOG[id])
      .filter((item) => item && !item.legacy && !isLegendaryWeapon(item) && isHunterWeapon(item));
  }
  if (type === 'propWeapon') {
    return STORE_ITEM_IDS.map((id) => STORE_CATALOG[id])
      .filter((item) => item && !item.legacy && !isLegendaryWeapon(item) && isPropWeapon(item));
  }
  return STORE_ITEM_IDS.map((id) => STORE_CATALOG[id]).filter((item) => item && item.type === type && !item.legacy && !isLegendaryWeapon(item));
}

function renderShopCatalog() {
  if (!shopItemsEl) return;
  shopItemsEl.innerHTML = '';

  // Exact Store Display Order:
  // 1. Player Skins (first)
  const skinCategory = STORE_CATEGORIES.find((c) => c.type === 'skin') || { type: 'skin', slot: 'equippedSkin', label: 'Player Skins' };
  const skinItems = itemsForCategory('skin');
  appendCategorySection(shopItemsEl, skinCategory, skinItems, 'shop');

  // 2. Hunter Weapons (second)
  const hunterCategory = STORE_CATEGORIES.find((c) => c.type === 'hunterWeapon') || { type: 'hunterWeapon', label: 'Hunter Weapons' };
  const hunterItems = itemsForCategory('hunterWeapon');
  appendCategorySection(shopItemsEl, hunterCategory, hunterItems, 'shop');

  // 3. Prop Weapons (third)
  const propCategory = STORE_CATEGORIES.find((c) => c.type === 'propWeapon') || { type: 'propWeapon', label: 'Prop Weapons' };
  const propItems = itemsForCategory('propWeapon');
  appendCategorySection(shopItemsEl, propCategory, propItems, 'shop');

  // 4. Legendary Weapons (last — all l. prefixed weapons in gold-styled section)
  const legendaryItems = STORE_ITEM_IDS.map((id) => STORE_CATALOG[id])
    .filter((item) => item && isLegendaryWeapon(item));
  if (legendaryItems.length > 0) {
    appendLegendarySection(shopItemsEl, legendaryItems, 'shop');
  }

  if (!shopItemsEl.children.length) {
    const empty = document.createElement('p');
    empty.className = 'store-empty';
    empty.textContent = 'Store catalog currently unavailable.';
    shopItemsEl.appendChild(empty);
  }
}

function renderDedicatedLoadoutSlots() {
  if (!inventoryLoadoutSlotsEl) return;
  inventoryLoadoutSlotsEl.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'inventory-loadout-heading';
  heading.innerHTML = '<span>Equipped Loadout</span><small>Choose exactly what Key 1 and Key 2 use</small>';
  inventoryLoadoutSlotsEl.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'loadout-slot-grid';

  for (const slotInfo of LOADOUT_SLOT_UI) {
    const card = document.createElement('section');
    card.className = 'loadout-slot-card';
    card.dataset.slot = slotInfo.slot;

    const header = document.createElement('div');
    header.className = 'loadout-slot-header';
    header.innerHTML = `<span class="loadout-slot-key">${slotInfo.keyLabel}</span><h3>${slotInfo.label}</h3>`;
    card.appendChild(header);

    const current = document.createElement('div');
    current.className = 'loadout-slot-current';
    const currentItem = STORE_CATALOG[equippedItemId(slotInfo.slot)];
    current.textContent = `Equipped: ${currentItem ? getItemDisplayName(currentItem) : '—'}`;
    card.appendChild(current);

    const options = document.createElement('div');
    options.className = 'loadout-options';
    const ownedItems = STORE_ITEM_IDS.map((id) => STORE_CATALOG[id])
      .filter((item) => item && item.slot === slotInfo.slot && isOwnedItem(item.id));

    for (const item of ownedItems) {
      const equipped = isEquippedItem(item.id);
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'loadout-equip-button' + (equipped ? ' active' : '') + (item.isLegendary ? ' loadout-legendary' : '');
      option.dataset.item = item.id;
      option.disabled = equipped;
      const itemName = getItemDisplayName(item);
      option.textContent = equipped ? `✓ ${itemName}` : (item.isLegendary ? `★ ${itemName}` : itemName);
      option.title = equipped ? `${itemName} is equipped` : `Equip ${itemName} in ${slotInfo.label}`;
      option.addEventListener('click', () => { if (!equipped) requestEquipItem(item.id); });
      options.appendChild(option);
    }
    if (ownedItems.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'loadout-empty';
      empty.textContent = 'No owned items in this slot.';
      options.appendChild(empty);
    }
    card.appendChild(options);
    grid.appendChild(card);
  }
  inventoryLoadoutSlotsEl.appendChild(grid);
}

function refreshInventoryUi() {
  renderDedicatedLoadoutSlots();
  if (!inventoryItemsEl) return;
  inventoryItemsEl.innerHTML = '';

  // 1. Owned Player Skins (first)
  const skinCategory = STORE_CATEGORIES.find((c) => c.type === 'skin') || { type: 'skin', slot: 'equippedSkin', label: 'Player Skins' };
  const ownedSkins = STARTER_SKIN_IDS.map((id) => STORE_CATALOG[id]).concat(itemsForCategory('skin')).filter((item) => item && isOwnedItem(item.id));
  appendCategorySection(inventoryItemsEl, skinCategory, ownedSkins, 'inventory');

  // 2. Owned Hunter Weapons (second)
  const hunterCategory = STORE_CATEGORIES.find((c) => c.type === 'hunterWeapon') || { type: 'hunterWeapon', label: 'Hunter Weapons' };
  const ownedHunter = itemsForCategory('hunterWeapon').filter((item) => item && isOwnedItem(item.id));
  appendCategorySection(inventoryItemsEl, hunterCategory, ownedHunter, 'inventory');

  // 3. Owned Prop Weapons (third)
  const propCategory = STORE_CATEGORIES.find((c) => c.type === 'propWeapon') || { type: 'propWeapon', label: 'Prop Weapons' };
  const ownedProp = itemsForCategory('propWeapon').filter((item) => item && isOwnedItem(item.id));
  appendCategorySection(inventoryItemsEl, propCategory, ownedProp, 'inventory');

  // 4. Owned Legendary Weapons (last — gold-styled section)
  const ownedLegendary = STORE_ITEM_IDS.map((id) => STORE_CATALOG[id])
    .filter((item) => item && isLegendaryWeapon(item) && isOwnedItem(item.id));
  if (ownedLegendary.length > 0) {
    appendLegendarySection(inventoryItemsEl, ownedLegendary, 'inventory');
  }
}

function refreshStoreUi() {
  if (storeCoinBalance) storeCoinBalance.textContent = `${myCoins} Coins`;
  renderShopCatalog();
  refreshInventoryUi();
  refreshCharacterPreview();
  reanchorCharacterHoverPreview();
  if (preview3dActive && active3dPreviewItem) {
    updatePreviewActionButton();
  }
}

function close3dPreviewModal() {
  preview3dActive = false;
  if (preview3dAnimId) {
    cancelAnimationFrame(preview3dAnimId);
    preview3dAnimId = null;
  }
  closeBuyConfirmModal();
  if (storePreviewModal) storePreviewModal.classList.add('hidden');

  if (preview3dScene) {
    preview3dScene.traverse((obj) => {
      if (obj.geometry) {
        try { obj.geometry.dispose(); } catch (e) {}
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) { try { m.map.dispose(); } catch (e) {} }
            try { m.dispose(); } catch (e) {}
          });
        } else {
          if (obj.material.map) { try { obj.material.map.dispose(); } catch (e) {} }
          try { obj.material.dispose(); } catch (e) {}
        }
      }
    });
    while (preview3dScene.children.length > 0) {
      preview3dScene.remove(preview3dScene.children[0]);
    }
  }

  if (preview3dRenderer) {
    try { preview3dRenderer.dispose(); } catch (e) {}
    if (preview3dRenderer.domElement && preview3dRenderer.domElement.parentNode) {
      preview3dRenderer.domElement.parentNode.removeChild(preview3dRenderer.domElement);
    }
    preview3dRenderer = null;
  }

  preview3dPivot = null;
  preview3dScene = null;
  preview3dCamera = null;
  active3dPreviewItem = null;
}
window.__close3dPreviewModal = close3dPreviewModal;

function closeBuyConfirmModal() {
  if (storeBuyConfirmModal) storeBuyConfirmModal.classList.add('hidden');
}
window.__closeBuyConfirmModal = closeBuyConfirmModal;

function openBuyConfirmModal(item) {
  if (!storeBuyConfirmModal || !item) return;
  const dName = getItemDisplayName(item);
  if (confirmBuyPrompt) confirmBuyPrompt.textContent = `Buy ${dName} for ${item.cost} coins?`;
  if (confirmItemName) confirmItemName.textContent = dName;
  if (confirmItemPrice) confirmItemPrice.textContent = `${item.cost} Coins`;
  storeBuyConfirmModal.classList.remove('hidden');
}

function updatePreviewActionButton() {
  if (!preview3dActionBtn || !active3dPreviewItem) return;
  const item = active3dPreviewItem;
  const equipped = isEquippedItem(item.id);
  const owned = isOwnedItem(item.id);

  if (equipped) {
    preview3dActionBtn.textContent = 'Equipped';
    preview3dActionBtn.disabled = true;
    preview3dActionBtn.className = 'preview-3d-action-btn equipped';
  } else if (owned) {
    preview3dActionBtn.textContent = 'Equip';
    preview3dActionBtn.disabled = false;
    preview3dActionBtn.className = 'preview-3d-action-btn owned';
  } else if (item.cost <= 0) {
    preview3dActionBtn.textContent = 'Included · Equip';
    preview3dActionBtn.disabled = false;
    preview3dActionBtn.className = 'preview-3d-action-btn owned';
  } else {
    preview3dActionBtn.textContent = `Buy — ${item.cost}`;
    preview3dActionBtn.disabled = false;
    preview3dActionBtn.className = 'preview-3d-action-btn';
  }
}

function open3dPreviewModal(item) {
  if (!item || !storePreviewModal) return;
  close3dPreviewModal();

  active3dPreviewItem = item;
  preview3dActive = true;
  hideCharacterHoverPreview();

  const isLeg = item.isLegendary || (typeof item.id === 'string' && item.id.startsWith('l.'));
  if (preview3dBox) preview3dBox.classList.toggle('preview-legendary', isLeg);
  if (preview3dTitle) preview3dTitle.textContent = getItemDisplayName(item);

  if (preview3dBadge) {
    if (isLeg) {
      preview3dBadge.textContent = 'LEGENDARY';
      preview3dBadge.className = 'preview-3d-badge badge-legendary';
    } else if (item.type === 'skin') {
      preview3dBadge.textContent = 'PLAYER SKIN';
      preview3dBadge.className = 'preview-3d-badge badge-standard';
    } else {
      const slotLabel = item.slot === 'primaryGun' ? 'PRIMARY WEAPON'
        : item.slot === 'secondaryGun' ? 'SECONDARY WEAPON'
        : item.slot === 'primaryKnife' ? 'PRIMARY MELEE'
        : item.slot === 'secondaryKnife' ? 'SECONDARY THROWN'
        : 'WEAPON';
      preview3dBadge.textContent = slotLabel;
      preview3dBadge.className = 'preview-3d-badge badge-standard';
    }
  }

  if (preview3dCost) {
    preview3dCost.textContent = item.cost <= 0 ? 'FREE' : `🪙 ${item.cost.toLocaleString()} Coins`;
  }
  if (preview3dStatus) {
    preview3dStatus.textContent = '';
  }
  updatePreviewActionButton();

  storePreviewModal.classList.remove('hidden');
  if (preview3dLoading) {
    preview3dLoading.classList.remove('hidden');
    preview3dLoading.innerHTML = '<div class="preview-spinner"></div><span>Loading 3D Model...</span>';
  }

  const container = preview3dCanvasContainer;
  if (!container) return;
  container.innerHTML = '';

  const rect = container.getBoundingClientRect();
  const width = rect.width || 640;
  const height = rect.height || 380;

  preview3dScene = new THREE.Scene();
  preview3dCamera = new THREE.PerspectiveCamera(45, width / height, 0.05, 1000);

  preview3dRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  preview3dRenderer.setSize(width, height);
  preview3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (THREE.SRGBColorSpace) preview3dRenderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(preview3dRenderer.domElement);

  // Bright AmbientLight + HemisphereLight + DirectionalLight so models are never pitch black or clipped
  const ambient = new THREE.AmbientLight(0xffffff, 1.4);
  preview3dScene.add(ambient);
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555566, 1.2);
  hemiLight.position.set(0, 50, 0);
  preview3dScene.add(hemiLight);
  const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
  keyLight.position.set(6, 12, 10);
  preview3dScene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x88bbff, 1.1);
  fillLight.position.set(-6, -6, -8);
  preview3dScene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 1.0);
  rimLight.position.set(0, 10, -6);
  preview3dScene.add(rimLight);

  preview3dPivot = new THREE.Group();
  preview3dScene.add(preview3dPivot);

  let modelUrl = '';
  if (item.type === 'skin') {
    // Player Skins MUST load from /Skins/Players/<exactFilename>.glb using skinFileForId
    const skinFileName = skinFileForId(item.id) || (item.file ? (item.file.endsWith('.glb') ? item.file : item.file + '.glb') : (item.id + '.glb'));
    modelUrl = `/Skins/Players/${skinFileName}`;
  } else {
    // Weapons MUST load from /Skins/Weapons/<exactFilename>.glb (matching exact filename scanned by server.js, including l. legendary weapons)
    let weaponFileName = item.file || (item.id + '.glb');
    if (!weaponFileName.toLowerCase().endsWith('.glb')) weaponFileName += '.glb';
    modelUrl = `/Skins/Weapons/${weaponFileName}`;
  }

  previewGltfLoader.load(
    modelUrl,
    (gltf) => {
      if (!preview3dActive || active3dPreviewItem !== item) return;
      if (preview3dLoading) preview3dLoading.classList.add('hidden');

      const model = gltf.scene;

      // Critical for rigged SkinnedMesh player skins so Three.js does not cull them out of the preview box
      model.traverse((child) => {
        child.visible = true;
        child.frustumCulled = false;
        if (child.isMesh || child.isSkinnedMesh) {
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => {
              mat.side = THREE.DoubleSide;
              mat.needsUpdate = true;
            });
          }
        }
      });

      // Call model.updateMatrixWorld(true), compute box, get size and center
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Center model at (0, 0, 0) and scale uniformly so largest dimension fits cleanly inside preview camera view
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetDim = 2.1;
      const scale = maxDim > 0.0001 ? targetDim / maxDim : 1;
      model.scale.setScalar(scale);

      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      model.updateMatrixWorld(true);

      preview3dPivot.add(model);

      // Point preview camera at (0, 0, 0) with safe near = 0.05 and far = 1000
      preview3dCamera.near = 0.05;
      preview3dCamera.far = 1000;
      preview3dCamera.position.set(0, 0, 3.2);
      preview3dCamera.lookAt(0, 0, 0);
      preview3dCamera.updateProjectionMatrix();
    },
    undefined,
    (err) => {
      console.warn('[store-360] failed to load:', modelUrl, err);
      if (preview3dLoading) {
        preview3dLoading.innerHTML = '<span style="color: #ff8a7a;">3D Model Preview Unavailable</span>';
      }
    }
  );

  function renderPreview() {
    if (!preview3dActive) return;
    preview3dAnimId = requestAnimationFrame(renderPreview);

    if (preview3dPivot && !isPreview3dDragging) {
      preview3dPivot.rotation.y += 0.012; // Continuous smooth 360-degree rotation
    }

    if (preview3dRenderer && preview3dScene && preview3dCamera) {
      preview3dRenderer.render(preview3dScene, preview3dCamera);
    }
  }
  renderPreview();
}

function openStore() {
  switchStoreTab('shop');
  if (storeOverlay) storeOverlay.classList.remove('hidden');
  if (storeStatus) { storeStatus.textContent = ''; storeStatus.style.color = '#8ee8ff'; }
  refreshStoreUi();
}

function closeStore() {
  close3dPreviewModal();
  hideCharacterHoverPreview();
  if (storeOverlay) storeOverlay.classList.add('hidden');
}

function handleStoreAction(itemId) {
  if (!socket) return;
  if (storeStatus) storeStatus.textContent = '';
  const item = STORE_CATALOG[itemId];
  if (item) {
    open3dPreviewModal(item);
  }
}

let hoverPreviewCard = null;   
let hoverPreviewFrame = 0;     

function populateCharacterHoverPreview(item) {
  if (!characterHoverPreview || !item) return;
  const rarity = storeItemRarity(item);
  const src = itemPreviewSrc(item.id);
  const displayName = getItemDisplayName(item);

  if (chpImage) {
    if (src) {
      chpImage.src = src; chpImage.alt = displayName + ' — full preview'; chpImage.classList.remove('hidden');
      if (chpFallback) chpFallback.classList.add('hidden');
    } else {
      chpImage.removeAttribute('src'); chpImage.classList.add('hidden');
      if (chpFallback) { chpFallback.textContent = STORE_ITEM_ICON[item.id] || '🎭'; chpFallback.classList.remove('hidden'); }
    }
  }
  if (chpTitle) { chpTitle.textContent = displayName; chpTitle.title = displayName; }
  if (chpRarity) chpRarity.textContent = rarity.label;
  if (chpTheme) chpTheme.textContent = item.stats ? rarity.theme + ' ' + item.stats : rarity.theme;
  characterHoverPreview.setAttribute('data-rarity', rarity.key);

  if (chpCost) {
    chpCost.classList.remove('state-owned', 'state-equipped');
    let label;
    if (isEquippedItem(item.id)) { chpCost.classList.add('state-equipped'); label = 'Equipped — active loadout'; }
    else if (isOwnedItem(item.id)) { chpCost.classList.add('state-owned'); label = 'Owned — equip from Inventory'; }
    else if (item.cost <= 0) { label = 'FREE — starter reward'; }
    else if (myCoins < item.cost) { label = item.cost + ' coins — need ' + (item.cost - myCoins) + ' more'; }
    else { label = item.cost + ' coins'; }
    chpCost.textContent = '';
    const coin = document.createElement('span'); coin.className = 'chp-coins'; coin.textContent = '🪙';
    const price = document.createElement('span'); price.textContent = label;
    chpCost.appendChild(coin); chpCost.appendChild(price);
  }
}

function positionCharacterHoverPreview() {
  if (!characterHoverPreview || !hoverPreviewCard || !hoverPreviewCard.isConnected) { hideCharacterHoverPreview(); return; }
  const GAP = 12;
  const popupW = characterHoverPreview.offsetWidth;
  const popupH = characterHoverPreview.offsetHeight;
  const rect = hoverPreviewCard.getBoundingClientRect();

  let bounds = { left: GAP, top: GAP, right: window.innerWidth - GAP, bottom: window.innerHeight - GAP };
  if (storePanelEl && storeOverlay && !storeOverlay.classList.contains('hidden')) {
    const panel = storePanelEl.getBoundingClientRect();
    bounds.left = Math.max(bounds.left, panel.left + 10); bounds.top = Math.max(bounds.top, panel.top + 10);
    bounds.right = Math.min(bounds.right, panel.right - 10); bounds.bottom = Math.min(bounds.bottom, panel.bottom - 10);
  }
  const fits = (x, y) => x >= bounds.left && y >= bounds.top && x + popupW <= bounds.right && y + popupH <= bounds.bottom;
  const cardCenterX = rect.left + rect.width / 2;
  const candidates = [
    { x: cardCenterX - popupW / 2, y: rect.top - popupH - GAP },
    { x: rect.right + GAP, y: rect.top - 24 },
    { x: rect.left - popupW - GAP, y: rect.top - 24 },
    { x: cardCenterX - popupW / 2, y: rect.bottom + GAP }
  ];
  let best = null;
  for (const candidate of candidates) { if (fits(candidate.x, candidate.y)) { best = candidate; break; } }
  if (!best) best = candidates[0];

  const maxX = Math.max(bounds.left, bounds.right - popupW);
  const maxY = Math.max(bounds.top, bounds.bottom - popupH);
  const x = Math.min(Math.max(best.x, bounds.left), maxX);
  const y = Math.min(Math.max(best.y, bounds.top), maxY);
  characterHoverPreview.style.left = Math.round(x) + 'px';
  characterHoverPreview.style.top = Math.round(y) + 'px';
}

function showCharacterHoverPreview(card) {
  if (preview3dActive) return;
  if (!characterHoverPreview || !card) return;
  const item = STORE_CATALOG[card.dataset.item];
  if (!item) return;
  hoverPreviewCard = card;
  populateCharacterHoverPreview(item);
  positionCharacterHoverPreview();
  characterHoverPreview.classList.add('visible');
  characterHoverPreview.setAttribute('aria-hidden', 'false');
}

function hideCharacterHoverPreview() {
  hoverPreviewCard = null;
  if (!characterHoverPreview) return;
  characterHoverPreview.classList.remove('visible');
  characterHoverPreview.setAttribute('aria-hidden', 'true');
}

function scheduleCharacterHoverReposition() {
  if (!hoverPreviewCard || hoverPreviewFrame) return;
  hoverPreviewFrame = window.requestAnimationFrame(() => {
    hoverPreviewFrame = 0;
    positionCharacterHoverPreview();
  });
}

function reanchorCharacterHoverPreview() {
  const card = hoverPreviewCard;
  if (!card) return;
  const itemId = card.dataset.item;
  hideCharacterHoverPreview();
  const container = activeStoreTab === 'inventory' ? inventoryItemsEl : shopItemsEl;
  let next = null;
  if (container && itemId) {
    const safeId = (window.CSS && CSS.escape) ? CSS.escape(itemId) : itemId.replace(/[^a-zA-Z0-9_-]/g, '');
    next = container.querySelector('.store-card[data-item="' + safeId + '"]');
  }
  if (next && next !== card && next.isConnected) showCharacterHoverPreview(next);
}

function bindCharacterHoverPreview() {
  if (!characterHoverPreview) return;
  const containers = [shopItemsEl, inventoryItemsEl].filter(Boolean);
  for (const container of containers) {
    container.addEventListener('mouseover', (event) => {
      const card = event.target instanceof Element ? event.target.closest('.store-card') : null;
      if (!card || !container.contains(card)) return;
      if (card === hoverPreviewCard) return; 
      showCharacterHoverPreview(card);
    });
    container.addEventListener('mousemove', scheduleCharacterHoverReposition);
    container.addEventListener('mouseout', (event) => {
      if (!hoverPreviewCard) return;
      const card = event.target instanceof Element ? event.target.closest('.store-card') : null;
      if (card && card !== hoverPreviewCard) return; 
      const next = event.relatedTarget;
      if (next instanceof Element && hoverPreviewCard.contains(next)) return;
      hideCharacterHoverPreview();
    });
  }
  for (const scroller of [storeTabContentShop, storeTabContentInventory]) {
    if (scroller) scroller.addEventListener('scroll', scheduleCharacterHoverReposition, { passive: true });
  }
  window.addEventListener('resize', scheduleCharacterHoverReposition);
  window.addEventListener('blur', hideCharacterHoverPreview);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideCharacterHoverPreview();
  });
}

function readStoredStarter() {
  let gender = null, skinId = null, locked = false;
  try {
    gender = localStorage.getItem(LS_STARTER_GENDER);
    skinId = localStorage.getItem(LS_STARTER_SKIN);
    locked = localStorage.getItem(LS_GENDER_LOCKED) === 'true';
    if (!skinId) {
      const model = localStorage.getItem(LS_STARTER_MODEL);
      if (model === 'Casual_w.glb') skinId = FEMALE_STARTER_ID;
      else if (model === 'Casual_Character.glb') skinId = MALE_STARTER_ID;
    }
  } catch (err) {}
  if (gender !== 'male' && gender !== 'female') gender = null;
  if (!gender && skinId) gender = skinId === FEMALE_STARTER_ID ? 'female' : 'male';
  if (gender && !skinId) skinId = STARTER_BY_GENDER[gender] ? STARTER_BY_GENDER[gender].id : null;
  if (skinId && !STARTER_SKIN_IDS.includes(skinId)) skinId = null;
  if (gender || skinId) locked = true;
  return { gender, skinId, locked };
}

function persistStarterChoice(gender) {
  const starter = STARTER_BY_GENDER[gender];
  if (!starter) return false;
  starterGender = gender;
  chosenStarterSkinId = starter.id;
  hasChosenStarter = true;
  isGenderLocked = true;
  try {
    localStorage.setItem(LS_STARTER_GENDER, gender);
    localStorage.setItem(LS_STARTER_MODEL, starter.file);
    localStorage.setItem(LS_STARTER_SKIN, starter.id);
    localStorage.setItem(LS_GENDER_LOCKED, 'true');
  } catch (err) {}
  return true;
}

function selectedStarterGender() {
  const checked = starterRadios.find((radio) => radio.checked);
  return checked ? checked.value : null;
}

function reflectStarterSelection() {
  if (isGenderLocked) return;
  const gender = selectedStarterGender();
  const starter = gender ? STARTER_BY_GENDER[gender] : null;
  if (starterConfirmBtn) starterConfirmBtn.disabled = !starter;
  if (starterStatus) {
    starterStatus.textContent = starter ? `Starter selected: ${starter.label}` : 'Tap a card above to preview your starter.';
  }
}

function openStarterSelection() {
  if (!starterOverlay) return;
  const isLocked = isGenderLocked || hasChosenStarter || !!starterGender;
  const target = starterGender || 'male';

  const starterKicker = document.getElementById('starterKicker');
  const starterTitle = document.getElementById('starterTitle');
  const starterSub = document.getElementById('starterSub');
  const genderCardsContainer = document.getElementById('genderCardsContainer');
  const genderCardMale = document.getElementById('genderCardMale');
  const genderCardFemale = document.getElementById('genderCardFemale');
  const genderSelectCopyMale = document.getElementById('genderSelectCopyMale');
  const genderSelectCopyFemale = document.getElementById('genderSelectCopyFemale');
  const starterCloseBtn = document.getElementById('starterCloseBtn');

  if (isLocked && starterGender) {
    if (starterKicker) starterKicker.textContent = 'Character Profile';
    if (starterTitle) starterTitle.innerHTML = 'Your Chosen <span>Character</span>';
    if (starterSub) starterSub.innerHTML = 'Your character choice is permanently locked.';
    if (genderCardsContainer) genderCardsContainer.classList.add('locked-single');

    if (starterGender === 'female') {
      if (genderCardMale) genderCardMale.classList.add('hidden');
      if (genderCardFemale) genderCardFemale.classList.remove('hidden');
      if (genderSelectCopyFemale) genderSelectCopyFemale.innerHTML = '<b>Chosen Character</b>';
    } else {
      if (genderCardFemale) genderCardFemale.classList.add('hidden');
      if (genderCardMale) genderCardMale.classList.remove('hidden');
      if (genderSelectCopyMale) genderSelectCopyMale.innerHTML = '<b>Chosen Character</b>';
    }

    starterRadios.forEach((radio) => {
      radio.checked = radio.value === starterGender;
      radio.disabled = true;
    });

    if (starterStatus) {
      const label = starterGender === 'female' ? 'Female' : 'Male';
      starterStatus.innerHTML = '<span class="starter-locked-msg">Your chosen character: <strong>' + label + '</strong></span>';
    }

    if (starterConfirmBtn) starterConfirmBtn.classList.add('hidden');
    if (starterCloseBtn) starterCloseBtn.classList.remove('hidden');
  } else {
    if (starterKicker) starterKicker.textContent = 'Step 1';
    if (starterTitle) starterTitle.innerHTML = 'Choose Your <span>Character</span>';
    if (starterSub) starterSub.textContent = 'Pick the starter you\'ll enter PropHunt.io as. This choice is permanent and cannot be changed later.';
    if (genderCardsContainer) genderCardsContainer.classList.remove('locked-single');
    if (genderCardMale) genderCardMale.classList.remove('hidden');
    if (genderCardFemale) genderCardFemale.classList.remove('hidden');
    if (genderSelectCopyMale) genderSelectCopyMale.innerHTML = '<b>Select Male</b>';
    if (genderSelectCopyFemale) genderSelectCopyFemale.innerHTML = '<b>Select Female</b>';

    starterRadios.forEach((radio) => {
      radio.disabled = false;
      radio.checked = radio.value === target;
    });

    if (starterConfirmBtn) starterConfirmBtn.classList.remove('hidden');
    if (starterCloseBtn) starterCloseBtn.classList.add('hidden');
    reflectStarterSelection();
  }

  starterOverlay.classList.remove('hidden');
}

function closeStarterSelection() {
  if (starterOverlay) starterOverlay.classList.add('hidden');
}

function confirmStarterSelection() {
  if (isGenderLocked) {
    closeStarterSelection();
    return;
  }
  const gender = selectedStarterGender();
  if (!gender || !persistStarterChoice(gender)) return;
  const starter = STARTER_BY_GENDER[gender];

  if (!myInventory.includes(starter.id)) myInventory.push(starter.id);
  ensureExclusiveStarterInventory();

  // If the player already has a bought non-starter skin equipped, preserve it!
  const savedSkin = readSavedEquippedSkin();
  const hasCustomSkin = savedSkin && !STARTER_SKIN_IDS.includes(savedSkin) && myInventory.includes(savedSkin);
  const activeSkin = hasCustomSkin ? savedSkin : starter.id;
  persistEquippedSkin(activeSkin);

  if (socket) {
    socket.emit('setGender', {
      gender,
      playerId: persistentPlayerId
    });
    socket.emit('equipSkin', {
      skinId: activeSkin,
      gender,
      starterSkin: starter.id,
      model: starter.file,
      playerId: persistentPlayerId
    });
    socket.emit('requestWallet', persistentPlayerId);
  }

  if (players[myId]) {
    players[myId].equippedSkin = activeSkin;
    if (players[myId].loadout) players[myId].loadout.equippedSkin = activeSkin;
    updatePlayerMeshes();
  }

  refreshStoreUi();
  refreshCharacterPreview();
  closeStarterSelection();
}

function prefetchStarterModel() {
  const id = chosenStarterSkinId || defaultEquippedSkinId();
  loadSkinModel(skinFileForId(id)).catch(() => {});
}

function initStarterSelection() {
  const stored = readStoredStarter();
  starterGender = stored.gender;
  chosenStarterSkinId = stored.skinId;
  hasChosenStarter = !!stored.skinId;
  isGenderLocked = !!stored.locked;

  if (chosenStarterSkinId) {
    if (!myInventory.includes(chosenStarterSkinId)) myInventory.push(chosenStarterSkinId);
    ensureExclusiveStarterInventory();

    const savedSkin = readSavedEquippedSkin();
    if (savedSkin && !STARTER_SKIN_IDS.includes(savedSkin)) {
      myLoadout.equippedSkin = savedSkin;
      myEquippedSkin = savedSkin;
    } else if (!myLoadout.equippedSkin || STARTER_SKIN_IDS.includes(myLoadout.equippedSkin)) {
      myLoadout.equippedSkin = chosenStarterSkinId;
      myEquippedSkin = chosenStarterSkinId;
    }
  }

  starterRadios.forEach((radio) => radio.addEventListener('change', reflectStarterSelection));
  if (starterConfirmBtn) starterConfirmBtn.addEventListener('click', confirmStarterSelection);
  const starterCloseBtn = document.getElementById('starterCloseBtn');
  if (starterCloseBtn) starterCloseBtn.addEventListener('click', closeStarterSelection);
  if (btnCharacter) btnCharacter.addEventListener('click', openStarterSelection);
  window.__openStarterSelection = openStarterSelection;
  if (!hasChosenStarter) openStarterSelection();
  prefetchStarterModel();
}

document.getElementById('btn-skins').addEventListener('click', () => {
  if (!isRegistered) { alert('You must register first to access the Store'); return; }
  openStore();
});
if (btnAuth) { btnAuth.addEventListener('click', () => { openAuthMenu(); }); }
if (authCloseBtn) authCloseBtn.addEventListener('click', closeAuthMenu);
if (authRegisterBtn) {
  authRegisterBtn.addEventListener('click', () => {
    if (!socket) return;
    const username = authUsername ? authUsername.value.trim() : '';
    const password = authPassword ? authPassword.value : '';
    if (!username || !password) { showAuthError('Enter a username and password.'); return; }
    socket.emit('registerAccount', {
      username,
      password,
      playerId: persistentPlayerId,
      gender: starterGender,
      genderLocked: isGenderLocked
    });
  });
}
if (authLoginBtn) {
  authLoginBtn.addEventListener('click', () => {
    if (!socket) return;
    const username = authUsername ? authUsername.value.trim() : '';
    const password = authPassword ? authPassword.value : '';
    if (!username || !password) { showAuthError('Enter a username and password.'); return; }
    socket.emit('loginAccount', { username, password });
  });
}
if (storeCloseBtn) storeCloseBtn.addEventListener('click', closeStore);
if (storeTabShop) storeTabShop.addEventListener('click', () => switchStoreTab('shop'));
if (storeTabInventory) storeTabInventory.addEventListener('click', () => switchStoreTab('inventory'));
bindCharacterHoverPreview();

// 360-Degree Interactive 3D Preview Modal & Buy Confirmation Listeners
if (preview3dCloseBtn) preview3dCloseBtn.addEventListener('click', close3dPreviewModal);
if (storePreviewModal) {
  storePreviewModal.addEventListener('click', (e) => {
    if (e.target === storePreviewModal) close3dPreviewModal();
  });
}

if (preview3dActionBtn) {
  preview3dActionBtn.addEventListener('click', () => {
    if (!active3dPreviewItem) return;
    const item = active3dPreviewItem;
    const equipped = isEquippedItem(item.id);
    const owned = isOwnedItem(item.id);

    if (equipped) return;
    if (owned) {
      requestEquipItem(item.id);
      if (preview3dStatus) {
        preview3dStatus.textContent = `${item.name} equipped!`;
        preview3dStatus.style.color = '#8ee8ff';
      }
      updatePreviewActionButton();
      return;
    }

    // Unowned: open two-step buy confirmation dialog on top of 360 preview
    openBuyConfirmModal(item);
  });
}

if (confirmBuyNoBtn) confirmBuyNoBtn.addEventListener('click', closeBuyConfirmModal);
if (storeBuyConfirmModal) {
  storeBuyConfirmModal.addEventListener('click', (e) => {
    if (e.target === storeBuyConfirmModal) closeBuyConfirmModal();
  });
}

if (confirmBuyYesBtn) {
  confirmBuyYesBtn.addEventListener('click', () => {
    if (!active3dPreviewItem) return;
    const item = active3dPreviewItem;
    closeBuyConfirmModal();

    if (myCoins < item.cost) {
      if (preview3dStatus) {
        preview3dStatus.textContent = `Not enough coins! You need ${item.cost} coins (you have ${myCoins}).`;
        preview3dStatus.style.color = '#ff8a7a';
      }
      return;
    }

    if (preview3dStatus) {
      preview3dStatus.textContent = 'Purchasing...';
      preview3dStatus.style.color = '#ffd700';
    }

    const itemCost = (item.cost !== undefined ? item.cost : item.price) || 0;
    const buyPayload = {
      id: item.id,
      itemId: item.id,
      weaponId: item.id,
      skinId: item.id,
      category: item.slot || item.type,
      type: item.type,
      cost: itemCost,
      price: itemCost,
      playerId: persistentPlayerId
    };
    console.log('[buy-client] sending:', JSON.stringify(buyPayload));
    if (item.type === 'skin') socket.emit('buySkin', buyPayload);
    else socket.emit('buyItem', buyPayload);
  });
}

// 360-degree interactive mouse/pointer drag rotation
if (preview3dCanvasContainer) {
  preview3dCanvasContainer.addEventListener('pointerdown', (e) => {
    isPreview3dDragging = true;
    preview3dPointerStart = { x: e.clientX, y: e.clientY };
    try { preview3dCanvasContainer.setPointerCapture(e.pointerId); } catch (err) {}
  });

  preview3dCanvasContainer.addEventListener('pointermove', (e) => {
    if (!isPreview3dDragging || !preview3dPivot) return;
    const dx = e.clientX - preview3dPointerStart.x;
    const dy = e.clientY - preview3dPointerStart.y;
    preview3dPivot.rotation.y += dx * 0.009;
    preview3dPivot.rotation.x = Math.max(-0.6, Math.min(0.6, preview3dPivot.rotation.x + dy * 0.009));
    preview3dPointerStart = { x: e.clientX, y: e.clientY };
  });

  const stopPreviewDrag = (e) => {
    isPreview3dDragging = false;
    try { preview3dCanvasContainer.releasePointerCapture(e.pointerId); } catch (err) {}
  };
  preview3dCanvasContainer.addEventListener('pointerup', stopPreviewDrag);
  preview3dCanvasContainer.addEventListener('pointercancel', stopPreviewDrag);
}

async function syncStoreCatalogFromServer() {
  try {
    const res = await fetch('/api/store-weapons');
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        for (const w of list) {
          const displayName = formatWeaponDisplayName(w.id || w.file) || w.name;
          const isLeg = isLegendaryWeapon(w);
          if (!STORE_CATALOG[w.id]) {
            STORE_CATALOG[w.id] = Object.assign({
              file: w.file || (w.id + '.glb'),
              color: null,
              stats: w.stats || (isLeg ? 'Legendary weaponry.' : 'Standard ordnance.')
            }, w, { name: displayName, isLegendary: isLeg });
          } else {
            if (w.thumb) STORE_CATALOG[w.id].thumb = w.thumb;
            if (w.file) STORE_CATALOG[w.id].file = w.file;
            STORE_CATALOG[w.id].name = displayName;
            if (w.cost !== undefined) STORE_CATALOG[w.id].cost = w.cost;
            STORE_CATALOG[w.id].isLegendary = isLeg;
            if (w.type) STORE_CATALOG[w.id].type = w.type;
            if (w.slot) STORE_CATALOG[w.id].slot = w.slot;
          }
        }
        STORE_ITEM_IDS = Object.keys(STORE_CATALOG);
        refreshStoreUi();
      }
    }
  } catch (e) {}
}
syncStoreCatalogFromServer();
STORE_ITEM_IDS.forEach((itemId) => {
  const btn = document.getElementById(`storeBuy-${itemId}`);
  if (btn) btn.addEventListener('click', () => handleStoreAction(itemId));
});
document.getElementById('btn-leaderboard').addEventListener('click', () => { alert('Leaderboard coming soon!'); });
document.getElementById('btn-respawn').addEventListener('click', () => {
  if (!socket) return;
  socket.emit('respawn');
  hideDeathScreen();
  showHud();
});
if (startMatchBtn) startMatchBtn.addEventListener('click', () => { if (socket && isRoomHost && matchState === 'waiting') socket.emit('startMatch'); });
if (copyRoomCodeBtn) copyRoomCodeBtn.addEventListener('click', async () => {
  const code = currentRoomCode;
  if (!code || code.length !== 4) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }
  copyRoomCodeBtn.textContent = 'Copied!';
  copyRoomCodeBtn.classList.add('copied');
  setTimeout(() => { copyRoomCodeBtn.textContent = 'Copy Code'; copyRoomCodeBtn.classList.remove('copied'); }, 1400);
});

document.getElementById('btn-main-menu').addEventListener('click', leaveMatchToMainMenu);

const btnIgStore = document.getElementById('btn-ig-store');
if (btnIgStore) {
  btnIgStore.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!isRegistered) { alert('You must register first to access the Store'); return; }
    openStore();
  });
}

const btnIgLeave = document.getElementById('btn-ig-leave');
if (btnIgLeave) {
  btnIgLeave.addEventListener('click', (event) => {
    event.stopPropagation();
    leaveMatchToMainMenu();
  });
}

function leaveMatchToMainMenu() {
  if (!socket) return;
  socket.emit('leaveGame');
  hasJoined = false; radarContacts = {}; isDisguised = false; myRole = null; amAlive = true; myHealth = 100;
  hideMatchOver(); stopIntermissionCountdown();
  currentRoomCode = null; isPrivateRoom = false; isRoomHost = false; myIsHost = false;
  setRoomCodeHudText(null);
  if (roomCodeDisplay) roomCodeDisplay.textContent = '—';
  socket.emit('requestWallet', persistentPlayerId);
  showMainMenuRoot();
}

function attachSocketListeners() {
  socket.on('registerResult', (data) => {
    if (data && data.ok) {
      sessionStorage.setItem('propHuntPlayerId', data.playerId);
      if (data.gender) {
        localStorage.setItem(LS_STARTER_GENDER, data.gender);
        const starter = STARTER_BY_GENDER[data.gender];
        if (starter) {
          localStorage.setItem(LS_STARTER_MODEL, starter.file);
          localStorage.setItem(LS_STARTER_SKIN, starter.id);
        }
      }
      if (typeof data.genderLocked === 'boolean') {
        localStorage.setItem(LS_GENDER_LOCKED, data.genderLocked ? 'true' : 'false');
      }
      window.location.reload();
    } else {
      showAuthError((data && data.message) || 'Registration failed.');
    }
  });

  socket.on('loginResult', (data) => {
    if (data && data.ok) {
      sessionStorage.setItem('propHuntPlayerId', data.playerId);
      if (data.gender) {
        localStorage.setItem(LS_STARTER_GENDER, data.gender);
        const starter = STARTER_BY_GENDER[data.gender];
        if (starter) {
          localStorage.setItem(LS_STARTER_MODEL, starter.file);
          localStorage.setItem(LS_STARTER_SKIN, starter.id);
        }
      }
      if (typeof data.genderLocked === 'boolean') {
        localStorage.setItem(LS_GENDER_LOCKED, data.genderLocked ? 'true' : 'false');
      }
      window.location.reload();
    } else {
      showAuthError((data && data.message) || 'Login failed.');
    }
  });

  socket.on('genderResult', (data) => {
    if (data && data.ok && data.gender) {
      starterGender = data.gender;
      hasChosenStarter = true;
      isGenderLocked = true;
      try {
        localStorage.setItem(LS_STARTER_GENDER, data.gender);
        localStorage.setItem(LS_GENDER_LOCKED, 'true');
        const starter = STARTER_BY_GENDER[data.gender];
        if (starter) {
          localStorage.setItem(LS_STARTER_MODEL, starter.file);
          localStorage.setItem(LS_STARTER_SKIN, starter.id);
        }
      } catch (e) {}
    }
  });

  socket.on('walletUpdate', (data) => {
    applyWalletPayload(data);
    if (players[myId] && data) {
      if (typeof data.coins === 'number') players[myId].coins = data.coins;
      if (Array.isArray(data.inventory)) players[myId].inventory = data.inventory.slice();
      if (data.loadout) players[myId].loadout = normalizeMyLoadout(data.loadout, players[myId].inventory);
      if (typeof data.equippedSkin === 'string') players[myId].equippedSkin = data.equippedSkin;
      updatePlayerMeshes();
    }
  });

  socket.on('buyResult', (data) => {
    applyWalletPayload(data);
    if (storeStatus) {
      storeStatus.textContent = data && data.ok ? 'Purchase complete. Equip it from the Inventory tab.' : ((data && data.message) || 'Purchase failed.');
      storeStatus.style.color = data && data.ok ? '#8ee8ff' : '#ff8a7a';
    }
    if (active3dPreviewItem) {
      if (data && data.ok) {
        if (preview3dStatus) {
          preview3dStatus.textContent = 'Purchase successful! Click Equip to equip it.';
          preview3dStatus.style.color = '#8ee8ff';
        }
        updatePreviewActionButton();
      } else {
        if (preview3dStatus) {
          preview3dStatus.textContent = (data && data.message) || 'Purchase failed.';
          preview3dStatus.style.color = '#ff8a7a';
        }
      }
    }
  });

  socket.on('equipResult', (data) => {
    applyWalletPayload(data);
    if (storeStatus) {
      storeStatus.textContent = data && data.ok ? (data.itemId ? `${(STORE_CATALOG[data.itemId] && STORE_CATALOG[data.itemId].name) || 'Item'} equipped.` : 'Item equipped.') : ((data && data.message) || 'Could not equip.');
      storeStatus.style.color = data && data.ok ? '#8ee8ff' : '#ff8a7a';
    }
    if (active3dPreviewItem) {
      updatePreviewActionButton();
    }
    if (data && data.ok) {
      const rawSkin = (data.loadout && data.loadout.equippedSkin) || data.equippedSkin || data.itemId;
      const cleanSkin = cleanSkinId(rawSkin) || rawSkin;
      if (cleanSkin && STORE_CATALOG[cleanSkin] && STORE_CATALOG[cleanSkin].type === 'skin') {
        persistEquippedSkin(cleanSkin);
        loadSkinModel(skinFileForId(cleanSkin)).catch(() => {});
      }
      if (players[myId]) {
        players[myId].equippedSkin = cleanSkin || players[myId].equippedSkin;
        players[myId].skinId = cleanSkin || players[myId].skinId;
        if (data.loadout) players[myId].loadout = normalizeMyLoadout(data.loadout, players[myId].inventory);
      }
      const myMesh = playerMeshes[myId];
      if (myMesh && !players[myId]?.isProp && cleanSkin) {
        attachSkinToPlayer(myId, myMesh, cleanSkin);
      }
      updatePlayerMeshes();
      updateWeaponHud();
      refreshStoreUi();
      refreshCharacterPreview();
    }
  });

  socket.on('init', (data) => {
    myId = data.id; players = data.players; npcs = data.npcs || {}; props = data.props; map = data.map || [];
    isPrivateRoom = data.matchType === 'private';
    isRoomHost = isPrivateRoom && data.hostId === data.id;
    myIsHost = isPrivateRoom && data.isHost === true;
    const joiningAsWaitingSpectator = data.matchState === 'waiting' || players[myId]?.role === 'waiting';
    currentZone = joiningAsWaitingSpectator ? LOBBY_AREA : (data.zone || (data.world && data.world.zones && data.world.zones.find(z => z.id === players[myId]?.zoneId)) || ZONE_DEFINITIONS.oldCityCenter);
    createZoneVisuals(currentZone); createStagingLobbyVisuals(); closeHostSettings();

    const initZone = data.zone || (players[myId] && ZONE_DEFINITIONS[players[myId].zoneId]) || ZONE_DEFINITIONS.oldCityCenter;
    roomSettingsZoneId = initZone.id; lobbyMapName = initZone.name;
    if (typeof data.timeLimit === 'number') selectedTimeLimit = data.timeLimit;
    currentRoomCode = data.roomCode || null;
    if (roomCodeDisplay) roomCodeDisplay.textContent = currentRoomCode ? currentRoomCode : 'Public Match';
    setRoomCodeHudText(currentRoomCode);

    if (typeof data.timeLeft === 'number') timeLeft = data.timeLeft;
    if (typeof data.originalDuration === 'number') originalDuration = data.originalDuration;
    if (data.matchState) matchState = data.matchState;
    updateTimerDisplay();
    if (matchState !== 'ended') hideMatchOver();

    if (data.world) {
      worldWidth = data.world.width; worldHeight = data.world.height;
      if (floorMesh) {
        scene.remove(floorMesh);
        const newGeo = new THREE.PlaneGeometry(worldWidth, worldHeight);
        floorMesh.geometry.dispose(); floorMesh.geometry = newGeo;
        floorMesh.position.set(worldWidth / 2, 0, worldHeight / 2);
        scene.add(floorMesh);
      }
      if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper = new THREE.GridHelper(Math.max(worldWidth, worldHeight), Math.max(worldWidth, worldHeight) / GRID_SIZE, 0x000000, 0x000000);
        gridHelper.material.opacity = 0.08; gridHelper.material.transparent = true;
        gridHelper.position.set(worldWidth / 2, 0.2, worldHeight / 2);
        scene.add(gridHelper);
      }
    }
    updateMapInfo();

    const me = players[myId];
    if (me) {
      localX = me.x; localZ = me.z; myRole = me.role; amAlive = me.alive; myHealth = me.health || 100;
      if (typeof me.coins === 'number') myCoins = me.coins;
      applyLoadoutState(Array.isArray(me.inventory) ? me.inventory : undefined, me.loadout || (typeof data.loadout === 'object' ? data.loadout : null));
      if (typeof me.equippedSkin === 'string') myEquippedSkin = myLoadout.equippedSkin;
      if (typeof me.isRegistered === 'boolean') isRegistered = me.isRegistered;
      if (me.username) myUsername = me.username;
      if (me.displayName) myDisplayName = me.displayName;
      refreshStoreUi(); updateAccountLabel();
      velocityY = 0; isGrounded = true; lastSentX = lastSentY = lastSentZ = null;
      camera.position.set(localX, PLAYER_EYE_HEIGHT, localZ);
      resetFloorTracking();
      const constrained = constrainPosition(localX, localZ, PLAYER_RADIUS);
      localX = constrained.x; localZ = constrained.z;
      camera.position.set(localX, PLAYER_EYE_HEIGHT, localZ);
      resetFloorTracking();
    }

    for (const [pId, pData] of Object.entries(players)) {
      if (pId !== myId) getOrCreatePlayerMesh(pId, pData);
    }
    rebuildMapMeshes(); rebuildPropMeshes(); updatePlayerMeshes(); updateNPCMeshes(); clearTracers();
    resetCombatState(); updateRoleDisplay(); updateHealthDisplay(); updateLobbyStats(); updateLobbyUi();
  });

  socket.on('joinError', (err) => {
    hasJoined = false; currentRoomCode = null; isPrivateRoom = false; isRoomHost = false; myIsHost = false;
    setRoomCodeHudText(null); showMainMenuRoot();
    showJoinError(err && err.message ? err.message : 'Could not join that match.');
    flashRoomCodeError();
  });

  socket.on('hostChanged', (data) => {
    const newHostId = data && data.hostId;
    if (!newHostId) return;
    const iAmNewHost = isPrivateRoom && newHostId === myId;
    isRoomHost = iAmNewHost; myIsHost = iAmNewHost;
    if (players[newHostId]) players[newHostId].isHost = true;
    updateLobbyUi();
  });

  socket.on('playerJoined', (data) => {
    if (!data || !data.id) return;
    players[data.id] = data.player;
    if (data.id !== myId && data.player) {
      console.log('[skin-sync]', data.player.username, 'equippedSkin:', data.player.equippedSkin);
      getOrCreatePlayerMesh(data.id, data.player);
    }
    updatePlayerMeshes(); updateLobbyStats();
  });

  socket.on('lootCollected', (amount) => {
    const popup = document.createElement('div');
    popup.textContent = `+${amount} Coins!`;
    popup.style.position = 'fixed'; popup.style.top = '55%'; popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)'; popup.style.color = '#ffd700';
    popup.style.font = 'bold 36px monospace'; popup.style.textShadow = '0 2px 10px rgba(0,0,0,0.9)';
    popup.style.pointerEvents = 'none'; popup.style.zIndex = '9999'; popup.style.transition = 'all 1.5s ease-out';
    document.body.appendChild(popup);
    requestAnimationFrame(() => { popup.style.top = '40%'; popup.style.opacity = '0'; });
    setTimeout(() => popup.remove(), 1500);
  });

  socket.on('npcAttack', (data) => {
    const npcId = (data && typeof data === 'object') ? (data.npcId || data.id) : data;
    const mesh = npcMeshes[npcId]; const mixer = npcMixers[npcId];
    if (!mesh || !mixer) return;
    const ud = mesh.userData;
    if (!ghoulTemplate || !ghoulTemplate.animations || ghoulTemplate.animations.length === 0) return;

    const attackClip = ghoulTemplate.animations[0];
    if (!attackClip) return;
    const attackAction = mixer.clipAction(attackClip);
    const activeLocomotion = ud.currentAction || ud.activeAction || ud.walkAction;

    attackAction.setLoop(THREE.LoopOnce); attackAction.clampWhenFinished = true;
    attackAction.reset(); attackAction.enabled = true; attackAction.setEffectiveWeight(1.0);
    attackAction.setEffectiveTimeScale(1.0); attackAction.play();

    if (activeLocomotion && activeLocomotion !== attackAction) {
      attackAction.crossFadeFrom(activeLocomotion, 0.2, false);
    }
    ud.attacking = true;
    if (ud.attackFinishedHandler) { mixer.removeEventListener('finished', ud.attackFinishedHandler); ud.attackFinishedHandler = null; }

    ud.attackFinishedHandler = function onAttackFinished(e) {
      if (e.action === attackAction) {
        mixer.removeEventListener('finished', ud.attackFinishedHandler);
        ud.attackFinishedHandler = null; ud.attacking = false;
        if (!ud.isDead) {
          const resumeAction = ud.activeAction || ud.currentAction || ud.walkAction;
          if (resumeAction) {
            resumeAction.reset(); resumeAction.enabled = true; resumeAction.setEffectiveWeight(1.0);
            resumeAction.setEffectiveTimeScale(1.0); resumeAction.play();
            resumeAction.crossFadeFrom(attackAction, 0.2, false);
            ud.currentAction = resumeAction;
          }
        }
      }
    };
    mixer.addEventListener('finished', ud.attackFinishedHandler);
  });

  socket.on('npcDied', (data) => {
    const npcId = (data && typeof data === 'object') ? (data.npcId || data.id) : data;
    const mesh = npcMeshes[npcId]; const mixer = npcMixers[npcId];
    if (!mesh || !mixer) return;
    const ud = mesh.userData;
    ud.isDead = true; ud.attacking = false;
    if (ud.attackFinishedHandler) { mixer.removeEventListener('finished', ud.attackFinishedHandler); ud.attackFinishedHandler = null; }
    if (ud.walkAction) ud.walkAction.stop();
    if (ud.runAction) ud.runAction.stop();
    if (ud.heavyBreatheAction) ud.heavyBreatheAction.stop();
    if (ud.slowBreatheAction) ud.slowBreatheAction.stop();
    const deathAction = ud.deathAction || (ghoulTemplate && ghoulTemplate.animations && ghoulTemplate.animations[1] ? mixer.clipAction(ghoulTemplate.animations[1]) : null);
    if (deathAction) {
      deathAction.setLoop(THREE.LoopOnce); deathAction.clampWhenFinished = true;
      deathAction.reset(); deathAction.enabled = true; deathAction.setEffectiveWeight(1.0);
      deathAction.setEffectiveTimeScale(1.0); deathAction.play();
      ud.currentAction = deathAction; ud.activeAction = deathAction;
    }
  });

  socket.on('stateUpdate', (data) => {
    const wasAlive = amAlive;
    players = data.players; npcs = data.npcs || {}; lootDrops = data.lootDrops || {};
    if (!players[myId]) return;
    const me = players[myId];
    isDisguised = me.isProp;
    myRole = me.role;
    amAlive = me.alive;
    myHealth = me.health != null ? me.health : (me.hp != null ? me.hp : myHealth);
    myIsPropHealing = !!me.isPropHealing;
    myIsPassiveHealing = !!me.isPassiveHealing;
    myIsHealing = !!me.isHealing;
    if (typeof me.healCooldownRemaining === 'number') {
      myHealCooldownRemaining = me.healCooldownRemaining;
    }

    updateRoleDisplay(); updateHealthDisplay();

    if (!wasAlive && amAlive) {
      localX = players[myId].x; localZ = players[myId].z; velocityY = 0; isGrounded = true; lastSentX = lastSentY = lastSentZ = null;
      camera.position.set(localX, PLAYER_EYE_HEIGHT, localZ); resetFloorTracking();
      const constrained = constrainPosition(localX, localZ, PLAYER_RADIUS);
      localX = constrained.x; localZ = constrained.z;
      camera.position.set(localX, PLAYER_EYE_HEIGHT, localZ); resetFloorTracking();
      myHealth = 100; updateHealthDisplay(); hideDeathScreen(); showHud();
    }

    updatePlayerMeshes(); updateNPCMeshes(); updateLootMeshes(); updateLobbyStats();
  });

  socket.on('playerLeft', (id) => {
    delete players[id]; delete radarContacts[id]; removePlayerMesh(id); updateLobbyStats();
  });

  socket.on('playerMoved', (data) => {
    if (!data || !data.id || data.id === myId) return;
    if (!players[data.id]) {
      players[data.id] = data;
    } else {
      Object.assign(players[data.id], data);
    }
    const mesh = getOrCreatePlayerMesh(data.id, players[data.id]);
    if (mesh) {
      mesh.visible = data.alive !== false;
      mesh.frustumCulled = false;
    }
  });

  socket.on('playerSkinUpdated', (data) => {
    if (!data || !data.id) return;
    const rawSkin = data.equippedSkin || data.skinId || (data.player && (data.player.equippedSkin || data.player.skinId));
    if (!rawSkin) return;
    const skin = cleanSkinId(rawSkin) || rawSkin;
    if (players[data.id]) {
      players[data.id].equippedSkin = skin;
      players[data.id].skinId = skin;
      if (players[data.id].loadout) players[data.id].loadout.equippedSkin = skin;
    }
    if (data.id === myId) {
      myEquippedSkin = skin;
      myLoadout.equippedSkin = skin;
      persistEquippedSkin(skin);
      refreshCharacterPreview();
      const myMesh = playerMeshes[myId];
      if (myMesh && !players[myId]?.isProp) {
        attachSkinToPlayer(myId, myMesh, skin);
      }
    } else {
      let mesh = playerMeshes[data.id];
      if (!mesh && players[data.id]) {
        mesh = getOrCreatePlayerMesh(data.id, players[data.id]);
      }
      if (players[data.id]) {
        console.log('[skin-sync]', players[data.id].username, 'equippedSkin:', skin);
      }
      if (mesh && !players[data.id]?.isProp) {
        attachSkinToPlayer(data.id, mesh, skin);
      }
    }
    updatePlayerMeshes();
  });

  socket.on('playerDisguised', (data) => {
    if (!data || !data.id) return;
    if (players[data.id]) {
      players[data.id].isProp = !!data.isProp;
      players[data.id].propId = data.propType || data.propId;
    }
    if (data.id !== myId) {
      removePlayerMesh(data.id);
      if (players[data.id]) {
        getOrCreatePlayerMesh(data.id, players[data.id]);
      }
    }
  });

  socket.on('fireTracer', (tracer) => { spawnTracer(tracer); });
  socket.on('leaderboardUpdate', (entries) => { renderLeaderboard(entries); });
  socket.on('radarData', (data) => {
    radarContacts = {};
    for (const contact of data.realtime || []) radarContacts[contact.id] = contact;
  });

  socket.on('hit', (data) => {
    myHealth = data.health != null ? data.health : (data.hp != null ? data.hp : myHealth);
    damageFlashAlpha = 0.75;
    if (myRole === 'prop' && myIsPropHealing) {
      healInterruptedUntil = performance.now() + 2000;
      myIsPropHealing = false;
      myIsHealing = false;
    }
    cancelHeal();
    if (data.disguiseBroken) { disguiseBreakNotification = performance.now(); isDisguised = false; }
    if (data.wasMelee) damageFlashAlpha = 0.85;
    updateHealthDisplay();
  });

  socket.on('healInterrupted', () => {
    healInterruptedUntil = performance.now() + 2000;
    myIsPropHealing = false;
    myIsHealing = false;
    updateHealthDisplay();
  });

  socket.on('disguiseBroken', (data) => {
    myHealth = data.health != null ? data.health : (data.hp != null ? data.hp : myHealth);
    damageFlashAlpha = 0.8;
    disguiseBreakNotification = performance.now();
    isDisguised = false;
    if (myRole === 'prop' && myIsPropHealing) {
      healInterruptedUntil = performance.now() + 2000;
      myIsPropHealing = false;
      myIsHealing = false;
    }
    cancelHeal();
    updateHealthDisplay();
  });

  socket.on('meleeHit', () => { triggerMeleeHitIndicator(); });
  socket.on('meleeMiss', () => {});
  socket.on('meleeDamaged', () => {
    damageFlashAlpha = 0.85;
    if (myRole === 'prop' && myIsPropHealing) {
      healInterruptedUntil = performance.now() + 2000;
      myIsPropHealing = false;
      myIsHealing = false;
    }
    cancelHeal();
    updateHealthDisplay();
  });

  socket.on('died', () => {
    amAlive = false; radarContacts = {}; isAiming = false; cancelHeal(); isCrouching = false;
    updateWeaponHud(); updateRoleDisplay(); updateHealthDisplay(); showDeathScreen();
  });

  socket.on('timeUpdate', (data) => {
    if (typeof data.timeLeft === 'number') timeLeft = data.timeLeft;
    if (typeof data.timeLimit === 'number') { originalDuration = data.timeLimit; selectedTimeLimit = data.timeLimit; }
    else if (typeof data.originalDuration === 'number') originalDuration = data.originalDuration;
    if (data.state) matchState = data.state;
    if (typeof data.intermissionSeconds === 'number') intermissionSeconds = data.intermissionSeconds;
    if (matchState === 'waiting' && currentZone.id !== LOBBY_AREA.id) { currentZone = LOBBY_AREA; updateMapInfo(); createZoneVisuals(currentZone); }
    updateTimerDisplay(); updateLobbyUi();
  });

  socket.on('roomSettingsChanged', (data) => {
    const zone = data.zone || (data.zoneId && ZONE_DEFINITIONS[data.zoneId]) || ZONE_DEFINITIONS.oldCityCenter;
    roomSettingsZoneId = zone.id; lobbyMapName = zone.name;
    if (typeof data.timeLimit === 'number') {
      selectedTimeLimit = data.timeLimit; originalDuration = data.timeLimit;
      if (matchState === 'waiting') timeLeft = data.timeLimit;
    }
    syncHostSettingsSelects(); updateMapInfo(); updateTimerDisplay(); updateLobbyUi();
  });

  socket.on('matchOver', (data) => {
    cancelHeal(); isCrouching = false;
    const winner = data.winner || 'PROPS'; const lb = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    showMatchOver(winner, lb, data.intermissionSeconds || 10);
  });

  socket.on('matchEnd', (data) => {
    cancelHeal(); isCrouching = false;
    const winner = data.winner || 'PROPS'; const lb = Array.isArray(data.leaderboard) ? data.leaderboard : [];
    showMatchOver(winner, lb, 10);
  });

  socket.on('matchStarted', (data) => {
    hideMatchOver(); hideDeathScreen(); stopIntermissionCountdown(); closeHostSettings();
    matchState = data.state || 'playing';
    if (typeof data.timeLeft === 'number') timeLeft = data.timeLeft;
    if (typeof data.originalDuration === 'number') originalDuration = data.originalDuration;
    if (typeof data.timeLimit === 'number') selectedTimeLimit = data.timeLimit;
    if (data.players) players = data.players;
    const me = players[myId];
    const shouldUseLobby = matchState === 'waiting' || (me && me.role === 'waiting');
    const serverDistrictZone = data.zone || (me && me.zone) || (me && ZONE_DEFINITIONS[me.zoneId]) || ZONE_DEFINITIONS.oldCityCenter;
    currentZone = shouldUseLobby ? LOBBY_AREA : serverDistrictZone;
    updateMapInfo(); createZoneVisuals(currentZone);

    if (me) {
      myRole = me.role; amAlive = me.alive; myHealth = me.health != null ? me.health : 100; isDisguised = me.isProp;
      applyLoadoutState(Array.isArray(me.inventory) ? me.inventory : undefined, me.loadout);
      localX = me.x; localZ = me.z; velocityY = 0; isGrounded = true; lastSentX = lastSentY = lastSentZ = null;
      camera.position.set(localX, PLAYER_EYE_HEIGHT, localZ); resetFloorTracking();
      const constrained = constrainPosition(localX, localZ, PLAYER_RADIUS);
      localX = constrained.x; localZ = constrained.z;
      camera.position.set(localX, PLAYER_EYE_HEIGHT, localZ); resetFloorTracking();
    }

    for (const [pId, pData] of Object.entries(players)) {
      if (pId !== myId) getOrCreatePlayerMesh(pId, pData);
    }
    resetCombatState(); updatePlayerMeshes(); updateRoleDisplay(); updateHealthDisplay(); updateLobbyStats(); showHud(); updateTimerDisplay(); updateLobbyUi();
  });
}

// ----------------------------------------------------
// Keyboard listeners (Fixed to prevent Undefined crashes)
// ----------------------------------------------------
window.addEventListener('keydown', (event) => {
  if (!event.key) return; // Safety check
  const key = event.key.toLowerCase();
  if (key in keys) { keys[key] = true; }
  if (event.code === 'Space') { keys.space = true; if (hasJoined && amAlive) { event.preventDefault(); } }
  if (key === 'e') { tryToggleDisguise(); }
  if (key === 'f' && nearLobbyComputer && myIsHost && !hostSettingsOpen) { event.preventDefault(); openHostSettings(); }
  if ((key === 'c' || key === 'control') && hasJoined && amAlive) { isCrouching = true; }
  if (key === 'h' && hasJoined && amAlive) { triggerPropHeal(); }
  if (key === '1' && hasJoined && amAlive) { switchWeapon('primary'); }
  if (key === '2' && hasJoined && amAlive) { switchWeapon('secondary'); }
  if (key === 'r' && hasJoined && amAlive) { startReload(); }
  if (key === 'g' && hasJoined && amAlive) { handleThrowKnife(); }
});

window.addEventListener('keyup', (event) => {
  if (!event.key) return; // Safety check
  const key = event.key.toLowerCase();
  if (key in keys) { keys[key] = false; }
  if (event.code === 'Space') { keys.space = false; }
  if (key === 'c' || key === 'control') { isCrouching = false; }
});

function resetInputState() {
  keys.w = false; keys.a = false; keys.s = false; keys.d = false; keys.space = false;
  isAiming = false; isCrouching = false; cancelHeal();
}
window.addEventListener('blur', resetInputState);

function onCanvasClick(event) {
  if (event.target.closest('#lockHint') || event.target.closest('#storeOverlay') || event.target.tagName === 'BUTTON') return;
  if (!hasJoined || !amAlive) return;
  if (!mainMenu.classList.contains('hidden') || !deathScreen.classList.contains('hidden')) return;
  if (!controls.isLocked) { controls.lock(); return; }
}
function attachPointerLockClick() { document.addEventListener('click', onCanvasClick); }

document.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !controls || !controls.isLocked || !hasJoined || !amAlive) return;
  if (myRole === 'hunter') {
    event.preventDefault();
    handleShoot();
    // Inside your click-to-fire / shooting handler:
    if (hasJoined && amAlive && !hostSettingsOpen) {
      // Optional check: ensure player is a hunter if your game uses roles (e.g., playerRole === 'hunter')
      if (gunshotAudioReady && gunshotSound) {
        if (gunshotSound.isPlaying) {
          gunshotSound.stop(); // Restart sound rapidly if clicking fast
        }
        try {
          gunshotSound.play();
        } catch (e) {}
      }
    }
  }
  else if (myRole === 'prop') { event.preventDefault(); handleMeleeAttack(); }
});

window.addEventListener('contextmenu', (event) => { event.preventDefault(); });
document.addEventListener('mousedown', (event) => { if (event.button === 2 && controls && controls.isLocked && hasJoined && amAlive && myRole === 'hunter') isAiming = true; });
document.addEventListener('mouseup', (event) => { if (event.button === 2) isAiming = false; });

function handleShoot() {
  if (!socket || !hasJoined || matchState !== 'playing' || myRole !== 'hunter' || !amAlive || isReloading) return;
  const weapon = WEAPONS[equippedWeapon]; const now = performance.now();
  if (now - lastShotTimeByWeapon[equippedWeapon] < weapon.fireRateMs) return;
  if (ammo[equippedWeapon] <= 0) { startReload(); return; }

  lastShotTimeByWeapon[equippedWeapon] = now; ammo[equippedWeapon]--; updateWeaponHud();
  camera.getWorldDirection(tmpDir);
  if (tmpDir.lengthSq() < 0.000001) return;
  socket.emit('shoot', { dx: tmpDir.x, dy: tmpDir.y, dz: tmpDir.z, weaponType: equippedWeapon });
}

function handleMeleeAttack() {
  if (!socket || !hasJoined || matchState !== 'playing' || myRole !== 'prop' || !amAlive) return;
  socket.emit('meleeAttack'); triggerMeleeSwingFeedback();
}

function handleThrowKnife() {
  if (!socket || !hasJoined || matchState !== 'playing' || myRole !== 'prop' || !amAlive) return;
  const now = performance.now();
  if (now - lastKnifeThrowTime < KNIFE_THROW_COOLDOWN_MS) return;
  camera.getWorldDirection(tmpDir);
  if (tmpDir.lengthSq() < 0.000001) return;
  socket.emit('throwKnife', { dx: tmpDir.x, dy: tmpDir.y, dz: tmpDir.z });
  lastKnifeThrowTime = now;
}

function startHeal() {
  triggerPropHeal();
}

function cancelHeal() {
  if (healProgressContainer) healProgressContainer.classList.add('hidden');
  if (healProgressFill) healProgressFill.style.width = '0%';
}

function updateHealProgress() {
  updateHealStatusHud();
}

function switchWeapon(weaponKey) {
  if (!hasJoined || !amAlive || myRole !== 'hunter' || !WEAPONS[weaponKey] || weaponKey === equippedWeapon) return;
  isReloading = false; reloadEndsAt = 0; equippedWeapon = weaponKey; updateWeaponHud();
}

function startReload() {
  if (!hasJoined || !amAlive || myRole !== 'hunter' || isReloading || ammo[equippedWeapon] >= WEAPONS[equippedWeapon].ammo) return;
  isReloading = true; reloadEndsAt = performance.now() + RELOAD_DURATION_MS; updateWeaponHud();
}

function updateReload() {
  if (!isReloading) return;
  if (performance.now() >= reloadEndsAt) {
    ammo[equippedWeapon] = WEAPONS[equippedWeapon].ammo; isReloading = false; reloadEndsAt = 0; updateWeaponHud();
  }
}

function equippedItemId(slot) {
  const id = myLoadout[slot];
  if (STORE_CATALOG[id] && myInventory.includes(id)) return id;
  return slot === 'equippedSkin' ? defaultEquippedSkinId() : DEFAULT_LOADOUT[slot];
}

function equippedItemName(slot) {
  const item = STORE_CATALOG[equippedItemId(slot)];
  return item ? getItemDisplayName(item) : '—';
}

function updateWeaponHud() {
  if (!weaponHud) return;
  const isHunter = myRole === 'hunter';
  const visible = hasJoined && amAlive && matchState === 'playing';
  weaponHud.classList.toggle('hidden', !visible);
  if (!visible) return;

  if (weaponHudName) weaponHudName.textContent = isHunter ? equippedItemName(equippedWeapon === 'secondary' ? 'secondaryGun' : 'primaryGun') : equippedItemName('secondaryKnife');
  if (weaponHudAmmo) {
    weaponHudAmmo.classList.toggle('hidden', !isHunter);
    if (isHunter) {
      const weapon = WEAPONS[equippedWeapon];
      weaponHudAmmo.textContent = `${ammo[equippedWeapon]} / ${weapon.ammo}`;
      weaponHudAmmo.classList.toggle('ammo-low', ammo[equippedWeapon] <= 0);
    }
  }
  if (weaponHudReload) weaponHudReload.classList.toggle('hidden', !(isHunter && isReloading));
  if (weaponHudKnife) weaponHudKnife.textContent = isHunter ? `Melee: ${equippedItemName('primaryKnife')}` : `G throw · LMB melee`;
}

function resetCombatState() {
  isCrouching = false; crouchAmount = 0; cancelHeal(); isReloading = false; reloadEndsAt = 0;
  equippedWeapon = 'primary'; ammo.primary = WEAPONS.primary.ammo; ammo.secondary = WEAPONS.secondary.ammo;
  lastShotTimeByWeapon.primary = 0; lastShotTimeByWeapon.secondary = 0; lastKnifeThrowTime = 0;
  myIsHealing = false; myIsPropHealing = false; myIsPassiveHealing = false;
  myHealCooldownRemaining = 0; healInterruptedUntil = 0;
  if (hudHealthBar) hudHealthBar.classList.remove('healing-pulse');
  if (hunterRegenIcon) hunterRegenIcon.classList.add('hidden');
  if (propHealIndicator) propHealIndicator.classList.add('hidden');
  updateWeaponHud();
}

function tryToggleDisguise() {
  if (!socket || !hasJoined || matchState !== 'playing' || myRole !== 'prop' || !amAlive) return;
  if (isDisguised) { socket.emit('disguise', null); return; }
  const nearestProp = props.find((prop) => {
    const distance = Math.hypot(localX - (prop.x + prop.width / 2), localZ - (prop.y + prop.height / 2));
    return distance <= DISGUISE_RADIUS;
  });
  if (nearestProp) socket.emit('disguise', nearestProp.id);
}

function updateMovement() {
  if (isDisguised || !amAlive || !hasJoined || !players[myId]) return;
  let moveForward = 0, moveRight = 0;
  if (keys.w) moveForward += 1; if (keys.s) moveForward -= 1;
  if (keys.d) moveRight += 1; if (keys.a) moveRight -= 1;
  if (moveForward === 0 && moveRight === 0) return;

  const len = Math.hypot(moveRight, moveForward);
  if (len > 1) { moveRight /= len; moveForward /= len; }

  camera.getWorldDirection(tmpForward); tmpForward.y = 0;
  const fLen = Math.hypot(tmpForward.x, tmpForward.z);
  if (fLen < 0.001) {
    tmpForward.set(0, 0, -1); tmpForward.applyQuaternion(camera.quaternion); tmpForward.y = 0;
    const fLen2 = Math.hypot(tmpForward.x, tmpForward.z);
    if (fLen2 < 0.001) return;
    tmpForward.x /= fLen2; tmpForward.z /= fLen2;
  } else { tmpForward.x /= fLen; tmpForward.z /= fLen; }

  tmpRight.set(-tmpForward.z, 0, tmpForward.x);
  const moveSpeed = isCrouching ? MOVE_SPEED * 0.5 : MOVE_SPEED;
  const dx = (tmpRight.x * moveRight + tmpForward.x * moveForward) * moveSpeed;
  const dz = (tmpRight.z * moveRight + tmpForward.z * moveForward) * moveSpeed;
  const constrained = constrainPosition(camera.position.x + dx, camera.position.z + dz, PLAYER_RADIUS);
  camera.position.x = constrained.x; camera.position.z = constrained.z;
  localX = constrained.x; localZ = constrained.z;
}

function updateVerticalPhysics(dt) {
  if (!camera || !hasJoined || !amAlive || isDisguised || !players[myId]) return;
  updateFloorHeight(dt);
  if (keys.space && isGrounded) { velocityY = JUMP_VELOCITY; isGrounded = false; }
  velocityY -= GRAVITY * dt; jumpOffset += velocityY * dt;
  if (jumpOffset <= 0) { jumpOffset = 0; velocityY = 0; isGrounded = true; }
  camera.position.y = smoothedFloorHeight + getCurrentEyeHeight() + jumpOffset;

  // Track air state and play landing sound cleanly on impact
	if (!isGrounded) {
		wasInAir = true;
	} else if (isGrounded && wasInAir) {
		wasInAir = false;
	if (landingAudioReady && landingSound) {
		if (landingSound.isPlaying) {
			landingSound.stop();
		}
		try {
		// Play immediately on ground contact without mid-air prediction pop
			landingSound.play();
			} catch (e) {}
		}
	}
}

function updateFootsteps(dt) {
  if (!hasJoined || !amAlive || isDisguised) return;

  const isMoving = keys.w || keys.a || keys.s || keys.d;

  if (isMoving && isGrounded) {
    footstepTimer += dt;
    if (footstepTimer >= FOOTSTEP_INTERVAL) {
      footstepTimer = 0;

      // Stop any currently playing footsteps first
      if (footstepSound && footstepSound.isPlaying) footstepSound.stop();
      if (concreteFootstepSound && concreteFootstepSound.isPlaying) concreteFootstepSound.stop();

      try {
        if (isOnConcretePath && concreteAudioReady) {
          concreteFootstepSound.play();
        } else if (footstepAudioReady) {
          footstepSound.play();
        }
      } catch (e) {}
    }
  } else {
    footstepTimer = FOOTSTEP_INTERVAL;
    if (footstepSound && footstepSound.isPlaying) footstepSound.stop();
    if (concreteFootstepSound && concreteFootstepSound.isPlaying) concreteFootstepSound.stop();
  }
}

function sampleFloorHeight(x, z) {
  if (!mapGroup || mapGroup.children.length === 0) return 0;
  rayOrigin.set(x, RAY_START_HEIGHT, z);
  terrainRaycaster.set(rayOrigin, DOWN_VECTOR);
  terrainRaycaster.far = RAY_MAX_DISTANCE;
  const hits = terrainRaycaster.intersectObjects(mapGroup.children, true);

  // --- Surface detection (surface-aware footsteps) ---
  // Read-only: inspects the same first valid hit the floor logic below uses,
  // so the raycast result, floor height, and step-up behaviour are unchanged.
  let groundHit = null;
  for (const hit of hits) {
    if (hit.object && hit.object.visible === false) continue;
    if (hit.object && hit.object.userData && hit.object.userData.type === 'glass') continue;
    groundHit = hit;
    break;
  }
  if (groundHit && groundHit.object && groundHit.object.name &&
      groundHit.object.name.toLowerCase().includes('path_straight')) {
    isOnConcretePath = true;
  } else {
    isOnConcretePath = false;
  }

  for (const hit of hits) {
    if (hit.object && hit.object.visible === false) continue;
    if (hit.object && hit.object.userData && hit.object.userData.type === 'glass') continue;
    return hit.point.y;
  }
  return 0;
}

function updateFloorHeight(dt) {
  currentFloorHeight = sampleFloorHeight(camera.position.x, camera.position.z);
  let target = currentFloorHeight;
  if (isGrounded && target - smoothedFloorHeight > MAX_STEP_UP) target = smoothedFloorHeight;
  const teleported = lastFloorSampleX === null || Math.hypot(camera.position.x - lastFloorSampleX, camera.position.z - lastFloorSampleZ) > 100;
  if (teleported) { smoothedFloorHeight = target; } 
  else {
    const lerpFactor = 1 - Math.exp(-FLOOR_LERP_SPEED * dt);
    smoothedFloorHeight = THREE.MathUtils.lerp(smoothedFloorHeight, target, lerpFactor);
    if (Math.abs(smoothedFloorHeight - target) < 0.001) smoothedFloorHeight = target;
  }
  lastFloorSampleX = camera.position.x; lastFloorSampleZ = camera.position.z;
}

function updateCrouch(dt) {
  const target = isCrouching ? 1 : 0;
  const lerpFactor = 1 - Math.exp(-CROUCH_LERP_SPEED * dt);
  crouchAmount = THREE.MathUtils.lerp(crouchAmount, target, lerpFactor);
  if (Math.abs(crouchAmount - target) < 0.0005) crouchAmount = target;
}

function getCurrentEyeHeight() { return PLAYER_EYE_HEIGHT - (PLAYER_EYE_HEIGHT - CROUCH_EYE_HEIGHT) * crouchAmount; }

function updateAimDownSights(dt) {
  if (!camera) return;
  const canAds = myRole === 'hunter' && hasJoined && amAlive && controls && controls.isLocked;
  const baseFov = Number(window.__gameSettings?.fov || DEFAULT_FOV || 75);
  const targetFov = (isAiming && canAds) ? ADS_FOV : baseFov;
  if (Math.abs(camera.fov - targetFov) < 0.01) {
    if (camera.fov !== targetFov) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
    return;
  }
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-ADS_LERP_SPEED * dt));
  camera.updateProjectionMatrix();
}

let lastSentYaw = null;
function emitMoveIfChanged() {
  if (!socket || !hasJoined || !amAlive || !players[myId]) return;
  const px = camera.position.x, py = camera.position.y, pz = camera.position.z;
  const _dir = new THREE.Vector3();
  camera.getWorldDirection(_dir);
  const yaw = Math.atan2(_dir.x, _dir.z);
  const isMoving = keys.w || keys.a || keys.s || keys.d;
  let yawDiff = Math.abs(yaw - (lastSentYaw !== null ? lastSentYaw : yaw));
  while (yawDiff > Math.PI) yawDiff = Math.abs(yawDiff - Math.PI * 2);
  const yawChanged = lastSentYaw === null || yawDiff > 0.005;
  if (lastSentX === null ||
      Math.abs(px - lastSentX) > 0.001 ||
      Math.abs(py - lastSentY) > 0.001 ||
      Math.abs(pz - lastSentZ) > 0.001 ||
      yawChanged) {
    socket.emit('playerMove', { x: px, y: py, z: pz, rotation: yaw, yaw: yaw, isMoving: isMoving });
    lastSentX = px; lastSentY = py; lastSentZ = pz; lastSentYaw = yaw;
  }
}

function updateDamageFlash() {
  const effectiveAlpha = Math.max(damageFlashAlpha, meleeHitFlashAlpha * 0.85);
  const isMelee = meleeHitFlashAlpha > damageFlashAlpha;
  if (effectiveAlpha <= 0.01) {
    if (damageFlashEl) damageFlashEl.style.background = 'rgba(255,40,30,0)';
    damageFlashAlpha = 0; return;
  }
  if (damageFlashEl) {
    if (isMelee) { damageFlashEl.style.background = `rgba(255, 40, 30, ${effectiveAlpha * 0.5})`; damageFlashEl.style.boxShadow = `inset 0 0 60px rgba(255,255,255,${effectiveAlpha * 0.25})`; }
    else { damageFlashEl.style.background = `rgba(255,40,30,${effectiveAlpha})`; damageFlashEl.style.boxShadow = 'none'; }
  }
  if (damageFlashAlpha > 0) { damageFlashAlpha -= 0.025; if (damageFlashAlpha < 0) damageFlashAlpha = 0; }
}

let disguiseNotifyEl = null;
function ensureDisguiseNotifyEl() {
  if (disguiseNotifyEl) return disguiseNotifyEl;
  disguiseNotifyEl = document.createElement('div');
  disguiseNotifyEl.style.position = 'fixed'; disguiseNotifyEl.style.top = '38%'; disguiseNotifyEl.style.left = '50%';
  disguiseNotifyEl.style.transform = 'translate(-50%, -50%)'; disguiseNotifyEl.style.background = 'rgba(200,30,20,0.92)';
  disguiseNotifyEl.style.color = 'white'; disguiseNotifyEl.style.padding = '10px 18px';
  disguiseNotifyEl.style.borderRadius = '8px'; disguiseNotifyEl.style.font = 'bold 15px monospace';
  disguiseNotifyEl.style.border = '2px solid rgba(255,100,80,0.95)'; disguiseNotifyEl.style.zIndex = '8';
  disguiseNotifyEl.style.pointerEvents = 'none'; disguiseNotifyEl.style.display = 'none';
  disguiseNotifyEl.textContent = '⚠ DISGUISE BROKEN — RUN!';
  document.body.appendChild(disguiseNotifyEl); return disguiseNotifyEl;
}

function updateDisguiseNotification() {
  if (!disguiseBreakNotification) { if (disguiseNotifyEl) disguiseNotifyEl.style.display = 'none'; return; }
  const el = ensureDisguiseNotifyEl();
  const elapsed = performance.now() - disguiseBreakNotification;
  const duration = 2500;
  if (elapsed > duration) { disguiseBreakNotification = 0; el.style.display = 'none'; return; }
  const alpha = elapsed < 300 ? elapsed / 300 : elapsed > duration - 500 ? (duration - elapsed) / 500 : 1;
  el.style.opacity = alpha.toString(); el.style.display = 'block';
}

let meleeHitFlashAlpha = 0;
let meleeSlashEl = null;
let meleeSlashUntil = 0;
let meleeSwingUntil = 0;

function ensureMeleeSlashEl() {
  if (meleeSlashEl) return meleeSlashEl;
  meleeSlashEl = document.createElement('div'); meleeSlashEl.id = 'meleeSlashIndicator';
  meleeSlashEl.style.position = 'fixed'; meleeSlashEl.style.top = '45%'; meleeSlashEl.style.left = '50%';
  meleeSlashEl.style.transform = 'translate(-50%, -50%) scale(0.8)'; meleeSlashEl.style.color = '#ff3b30';
  meleeSlashEl.style.font = 'bold 42px monospace'; meleeSlashEl.style.textShadow = '0 2px 12px rgba(0,0,0,0.9), 0 0 24px rgba(255,59,48,0.7)';
  meleeSlashEl.style.zIndex = '9'; meleeSlashEl.style.pointerEvents = 'none'; meleeSlashEl.style.display = 'none';
  meleeSlashEl.style.opacity = '0'; meleeSlashEl.style.transition = 'opacity 0.08s, transform 0.08s';
  meleeSlashEl.textContent = '⚔ HIT!';
  document.body.appendChild(meleeSlashEl); return meleeSlashEl;
}

function triggerMeleeHitIndicator() {
  meleeHitFlashAlpha = 1.0; const el = ensureMeleeSlashEl();
  el.textContent = '⚔ HIT!'; el.style.display = 'block'; el.style.opacity = '1'; el.style.transform = 'translate(-50%, -50%) scale(1.15)';
  meleeSlashUntil = performance.now() + 320;
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%, -50%) scale(1.0)'; });
}

function triggerMeleeSwingFeedback() {
  const el = ensureMeleeSlashEl();
  if (performance.now() < meleeSlashUntil) return;
  el.textContent = '⚔'; el.style.display = 'block'; el.style.opacity = '0.55'; el.style.transform = 'translate(-50%, -50%) scale(0.95)';
  el.style.color = '#ffffff'; meleeSwingUntil = performance.now() + 120;
  setTimeout(() => {
    if (performance.now() >= meleeSwingUntil && performance.now() >= meleeSlashUntil) {
      el.style.opacity = '0';
      setTimeout(() => { if (performance.now() >= meleeSlashUntil) el.style.display = 'none'; }, 120);
    }
  }, 110);
}

function updateMeleeIndicator() {
  if (meleeSlashUntil && performance.now() > meleeSlashUntil) {
    const el = ensureMeleeSlashEl();
    el.style.opacity = '0'; el.style.transform = 'translate(-50%, -50%) scale(0.9)'; meleeSlashUntil = 0;
    setTimeout(() => { if (!meleeSlashUntil) el.style.display = 'none'; }, 180);
  }
  if (meleeSwingUntil && performance.now() > meleeSwingUntil && !meleeSlashUntil) {
    const el = ensureMeleeSlashEl(); el.style.opacity = '0';
    setTimeout(() => { if (!meleeSlashUntil) el.style.display = 'none'; }, 120);
    meleeSwingUntil = 0;
  }
  if (meleeHitFlashAlpha > 0) { meleeHitFlashAlpha -= 0.09; if (meleeHitFlashAlpha < 0) meleeHitFlashAlpha = 0; }
}

function drawMinimap() {
  if (!minimapCtx || !minimapCanvas) return;
  const ctx = minimapCtx; const W = minimapCanvas.width; const H = minimapCanvas.height;
  const cx = W / 2; const cy = H / 2; const radius = Math.min(cx, cy); const scale = radius / MINIMAP_RANGE;
  const px = localX; const pz = localZ;
  const toX = (wx) => cx + (wx - px) * scale; const toY = (wz) => cy + (wz - pz) * scale;

  ctx.clearRect(0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
  ctx.fillStyle = '#0b0f0c'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120, 200, 140, 0.10)'; ctx.lineWidth = 1;
  for (let r = radius / 3; r < radius; r += radius / 3) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(120, 160, 120, 0.7)'; ctx.lineWidth = 2; ctx.strokeRect(toX(0), toY(0), worldWidth * scale, worldHeight * scale);

  for (const obj of map) {
    ctx.fillStyle = obj.type === 'glass' ? 'rgba(126, 200, 240, 0.55)' : 'rgba(140, 140, 140, 0.85)';
    ctx.fillRect(toX(obj.x), toY(obj.y), obj.width * scale, obj.height * scale);
  }

  for (const id in radarContacts) {
    if (id === myId) continue;
    const c = radarContacts[id];
    if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;
    const dotX = toX(c.x); const dotY = toY(c.y);
    ctx.beginPath(); ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = c.role === 'hunter' ? '#e74c3c' : '#f1c40f'; ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath(); ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'; ctx.lineWidth = 2; ctx.stroke();

  let heading = 0;
  if (camera) {
    camera.getWorldDirection(tmpMinimapDir);
    const fx = tmpMinimapDir.x; const fz = tmpMinimapDir.z;
    if (Math.hypot(fx, fz) > 1e-6) heading = Math.atan2(fx, -fz);
  }

  ctx.save(); ctx.translate(cx, cy); ctx.rotate(heading);
  const fov = Math.PI / 3; const wedgeLen = radius * 0.6;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, wedgeLen, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2); ctx.closePath();
  const wedgeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, wedgeLen);
  wedgeGrad.addColorStop(0, 'rgba(46, 204, 113, 0.35)'); wedgeGrad.addColorStop(1, 'rgba(46, 204, 113, 0)');
  ctx.fillStyle = wedgeGrad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-5, 6); ctx.lineTo(0, 3); ctx.lineTo(5, 6); ctx.closePath();
  ctx.fillStyle = '#2ecc71'; ctx.strokeStyle = '#04150b'; ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function randomizeFountainVelocity(velocities, i) {
  const angle = Math.random() * Math.PI * 2;
  const outwardSpeed = 5 + Math.random() * 15;
  velocities[i] = { x: Math.cos(angle) * outwardSpeed, y: 30 + Math.random() * 18, z: Math.sin(angle) * outwardSpeed };
}

function configureFountainSound(sound, buffer) {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.8);
  sound.setRefDistance(80);
  sound.setMaxDistance(400);
  sound.setDistanceModel('linear');
  sound.setRolloffFactor(1);
}

function createFountain(worldPos, name) {
  const position = worldPos.clone();
  const spawn = new THREE.Vector3(position.x, position.y + FOUNTAIN_SPAWN_OFFSET_Y, position.z);

  // --- Particle system, emitting slightly above the fountain ---
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(FOUNTAIN_PARTICLE_COUNT * 3);
  const velocities = [];
  for (let i = 0; i < FOUNTAIN_PARTICLE_COUNT; i++) {
    positions[i * 3 + 0] = spawn.x;
    positions[i * 3 + 1] = spawn.y;
    positions[i * 3 + 2] = spawn.z;
    randomizeFountainVelocity(velocities, i);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x44aaff,
    size: 2.5,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  scene.add(particles);

  // --- PositionalAudio anchored right at the fountain's position ---
  const anchor = new THREE.Object3D();
  anchor.position.set(position.x, position.y, position.z);
  let sound = null;
  if (audioListener) {
    sound = new THREE.PositionalAudio(audioListener);
    if (fountainAudioBuffer) configureFountainSound(sound, fountainAudioBuffer);
    anchor.add(sound);
  }
  scene.add(anchor);

  const fountain = {
    name: name || 'fountain',
    position,
    spawn,
    basinY: position.y + FOUNTAIN_BASIN_OFFSET_Y,
    geometry,
    particles,
    velocities,
    anchor,
    sound
  };
  fountains.push(fountain);
  return fountain;
}

function updateFountain(dt) {
  for (const fountain of fountains) {
    const positions = fountain.geometry.attributes.position.array;
    const velocities = fountain.velocities;
    const spawn = fountain.spawn;
    for (let i = 0; i < velocities.length; i++) {
      const v = velocities[i]; const o = i * 3;
      v.y -= FOUNTAIN_GRAVITY * dt;
      positions[o + 0] += v.x * dt; positions[o + 1] += v.y * dt; positions[o + 2] += v.z * dt;
      if (positions[o + 1] < fountain.basinY) {
        positions[o + 0] = spawn.x; positions[o + 1] = spawn.y; positions[o + 2] = spawn.z;
        randomizeFountainVelocity(velocities, i);
      }
    }
    fountain.geometry.attributes.position.needsUpdate = true;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(frameClock.getDelta(), MAX_FRAME_DT);

  Object.values(npcMixers).forEach(mixer => mixer.update(dt));
  updateNpcVisuals(dt);
  updatePlayerAnimations(dt);
  updatePlayerMeshes();

  for (const mesh of Object.values(lootMeshes)) {
    mesh.rotation.y += 3 * dt;
    mesh.position.y = 12 + Math.sin(performance.now() * 0.005) * 3;
  }

  if (hasJoined) {
    if (!hostSettingsOpen) {
      updateMovement();
      updateVerticalPhysics(dt);
      updateFootsteps(dt); // <--- Add this call here safely
      emitMoveIfChanged();
    }
  }

  updateLobbyComputerInteraction();
  if (lobbyComputerGroup) {
    lobbyComputerGroup.rotation.y += dt * 0.5;
    if (lobbyComputerCubeMat) lobbyComputerCubeMat.emissiveIntensity = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() * 0.002));
  }

  updateAimDownSights(dt); updateCrouch(dt); updateHealProgress(); updateReload();
  updateDamageFlash(); updateDisguiseNotification(); updateMeleeIndicator(); updateTracers();
  updateDayNightCycle(dt); updateFountain(dt);

  if (renderer && scene && camera) renderer.render(scene, camera);
  if (hasJoined && amAlive) drawMinimap();
}

async function start() {
  try {
    initThree();
    if (loadingOverlay) loadingOverlay.textContent = 'Loading world assets…';
    crateTemplate = await loadCrateModel();
    if (loadingOverlay) loadingOverlay.textContent = 'Loading creatures…';
    ghoulTemplate = await loadGhoulModel();

    attachPointerLockClick();
    hideLoadingOverlay();
    showMainMenuRoot();

    // Connect to current origin if served via HTTP/HTTPS, or fallback to cloud server
    const socketUrl = (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http'))
      ? window.location.origin
      : 'https://ghosttown-prophunt.onrender.com';
    // eslint-disable-next-line no-undef
    socket = io(socketUrl);
    attachSocketListeners();
    initStarterSelection();

    socket.emit('requestWallet', persistentPlayerId);
    animate();
  } catch (err) {
    showLoadingError(err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}