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
const PLAYER_HEIGHT_3D = 22;
const PLAYER_EYE_HEIGHT = 12;

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

  standardRifle: { id: 'standardRifle', name: 'Assault Rifle',      cost: 0,    type: 'primaryGun',      slot: 'primaryGun',      color: null,      tracer: 0xffe27a, stats: 'Dmg 25 · 5 rds · dependable all-rounder.' },
  shotgun:       { id: 'shotgun',       name: 'Combat Shotgun',     cost: 700,  type: 'primaryGun',      slot: 'primaryGun',      color: null,      tracer: 0xffd08a, stats: 'Dmg 25 · 5 rds · heavy close-range profile.' },
  vulcanRifle:   { id: 'vulcanRifle',   name: 'VK-47 Vulcan',       cost: 800,  type: 'primaryGun',      slot: 'primaryGun',      color: null,      tracer: 0xff8c42, stats: 'Dmg 25 · 5 rds · molten-ember tracer.' },
  longshotMk2:   { id: 'longshotMk2',   name: 'Longshot Mk II',     cost: 1200, type: 'primaryGun',      slot: 'primaryGun',      color: null,      tracer: 0x9fd8ff, stats: 'Dmg 25 · 5 rds · cold-blue tracer.' },

  sidearmPistol: { id: 'sidearmPistol', name: 'Pistol',             cost: 0,    type: 'secondaryGun',   slot: 'secondaryGun',    color: null,      tracer: 0xffe27a, stats: 'Dmg 12.5 · 12 rds · fast and reliable.' },
  revolver:      { id: 'revolver',      name: 'Revolver',            cost: 700,  type: 'secondaryGun',   slot: 'secondaryGun',    color: null,      tracer: 0xffc27a, stats: 'Dmg 12.5 · 12 rds · hard-hitting hand cannon.' },
  viperSMG:      { id: 'viperSMG',      name: 'Viper SMG',          cost: 600,  type: 'secondaryGun',   slot: 'secondaryGun',    color: null,      tracer: 0xa2ff9f, stats: 'Dmg 12.5 · 12 rds · toxic-green tracer.' },

  fieldBlade:    { id: 'fieldBlade',    name: 'Field Blade',        cost: 0,    type: 'primaryKnife',   slot: 'primaryKnife',    color: null,      tracer: null,      stats: 'Trusted close-range melee blade.' },
  carbonCleaver: { id: 'carbonCleaver', name: 'Carbon Cleaver',     cost: 400,  type: 'primaryKnife',   slot: 'primaryKnife',    color: null,      tracer: null,      stats: 'Featherweight carbon melee cleaver.' },
  throwingKnife: { id: 'throwingKnife', name: 'Throwing Knife',     cost: 0,    type: 'secondaryKnife', slot: 'secondaryKnife',  color: null,      tracer: 0x9fd8ff, stats: 'Balanced Prop throwing knife.' },
  phantomDagger: { id: 'phantomDagger', name: 'Phantom Dagger',     cost: 650,  type: 'secondaryKnife', slot: 'secondaryKnife',  color: null,      tracer: 0xd8a2ff, stats: 'Haunting violet throw trail.' }
};

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

const SHOP_SKIN_ORDER = [
  'Beach_Character', 'Casual_w2', 'Farmer', 'Hoodie_Character', 'Worker', 'Worker_w',
  'Adventurer', 'Business_Man', 'Adventurer_w', 'Punk', 'Suit_w', 'Medieval_w',
  'Soldier_w', 'Punk_w', 'Swat', 'King', 'Witch_w', 'Sci_Fi_Character_w', 'Astronaut'
];

const LOADOUT_SLOTS = ['equippedSkin', 'primaryGun', 'secondaryGun', 'primaryKnife', 'secondaryKnife'];
const DEFAULT_LOADOUT = {
  equippedSkin: MALE_STARTER_ID,
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
  return guaranteedStarterSkinId();
}

const STORE_CATEGORIES = [
  { type: 'skin',           slot: 'equippedSkin',   label: 'Skins' },
  { type: 'primaryGun',     slot: 'primaryGun',     label: 'Primary Weapons' },
  { type: 'secondaryGun',   slot: 'secondaryGun',   label: 'Secondary Weapons' },
  { type: 'primaryKnife',   slot: 'primaryKnife',   label: 'Primary Knives' },
  { type: 'secondaryKnife', slot: 'secondaryKnife', label: 'Secondary Knives' }
];

const STORE_ITEM_IDS = Object.keys(STORE_CATALOG);

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
const groundColliders = [];
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

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambientLight);

  hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x6b4630, 0.5);
  hemisphereLight.position.set(0, 100, 0);
  scene.add(hemisphereLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
  directionalLight.position.set(120, 200, 80);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.bias = -0.0005;
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
  groundColliders.push(floorMesh);

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
        clone.matrixAutoUpdate = false;
        clone.traverse(child => {
          child.matrixAutoUpdate = false;
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;
          }
        });
        clone.updateMatrix();
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

      // Disable matrixAutoUpdate on static town objects and collect ground paths for footsteps
      myCustomMap.traverse((node) => {
        node.matrixAutoUpdate = false;
        if (node.isMesh) {
          node.castShadow = false;
          node.receiveShadow = true;
          if (node.name && node.name.toLowerCase().includes('path')) {
            groundColliders.push(node);
          }
        }
      });
      myCustomMap.updateMatrixWorld(true);
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
const skinGLTFLoader = new GLTFLoader();
const skinModelCache = {};
const skinModelPromises = {};

const CHARACTER_TARGET_HEIGHT = PLAYER_HEIGHT_3D;
const CHARACTER_RUN_SPEED = 55;
const CHARACTER_WALK_SPEED = 3;
const CHARACTER_ANIM_FADE = 0.2;

const playerMixers = {};

function skinFileForId(skinId) {
  if (typeof skinId === 'string' && /\.glb$/i.test(skinId)) return skinId;
  const item = STORE_CATALOG[skinId];
  if (item && item.file) return item.file;
  return STORE_CATALOG[MALE_STARTER_ID].file;
}

function loadSkinModel(skinFile) {
  const file = skinFile || STORE_CATALOG[MALE_STARTER_ID].file;
  if (skinModelCache[file]) return Promise.resolve(skinModelCache[file]);
  if (skinModelPromises[file]) return skinModelPromises[file];

  skinModelPromises[file] = new Promise((resolve, reject) => {
    skinGLTFLoader.load(file, (gltf) => {
        const modelScene = gltf.scene;
        const box = new THREE.Box3().setFromObject(modelScene);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // BULLETPROOF SCALING: Ignore broken skeleton bounds.
        // If the model is > 50 units, it was exported in cm. If < 5, it's in meters.
        let scale = 12; // Default for 1.8m models
        if (size.y > 50 && size.y < 500) {
            scale = CHARACTER_TARGET_HEIGHT / size.y;
        } else if (size.y > 0.5 && size.y < 5) {
            scale = CHARACTER_TARGET_HEIGHT / size.y;
        }

        modelScene.traverse((node) => {
          if (node.isMesh || node.isSkinnedMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            node.frustumCulled = false; // Prevent disappearing when looking away
            if (node.material) {
              node.material.transparent = false; // Fix invisible glass-bugged materials
              node.material.depthWrite = true;
            }
          }
        });

        const template = {
          file,
          scene: modelScene,
          animations: gltf.animations || [],
          scale,
          footOffset: 0 // Force feet to strictly stay at floor origin
        };
        skinModelCache[file] = template;
        delete skinModelPromises[file];
        resolve(template);
      }, undefined, (error) => {
        delete skinModelPromises[file];
        reject(error);
      });
  });

  return skinModelPromises[file];
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

function setupCharacterAnimations(id, group, template) {
  const animations = template.animations;
  if (!animations || animations.length === 0) return;

  const mixer = new THREE.AnimationMixer(group);
  const ud = group.userData;

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
  mixer.stopAllAction();
  if (mixer.getRoot()) mixer.uncacheRoot(mixer.getRoot());
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

function attachSkinToPlayer(id, holder, skinId) {
  const file = skinFileForId(skinId);
  if (holder.userData.skinFile === file || holder.userData.pendingSkinFile === file) return;
  holder.userData.pendingSkinFile = file;

  loadSkinModel(file)
    .then((template) => {
      if (playerMeshes[id] !== holder || holder.userData.pendingSkinFile !== file) return;
      holder.userData.pendingSkinFile = null;

      if (holder.userData.model) {
        holder.remove(holder.userData.model);
        holder.userData.model = null;
      }

      const model = SkeletonUtils.clone(template.scene);
      model.scale.setScalar(template.scale);
      model.position.y = template.footOffset || 0; // Fixes clipping through floor
      model.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          node.frustumCulled = false;
        }
      });

      holder.add(model);
      holder.userData.model = model;
      holder.userData.skinFile = file;
      holder.userData.placeholder = false;

      if (holder.userData.fallbackMesh) {
        holder.remove(holder.userData.fallbackMesh);
        if (holder.userData.fallbackMesh.geometry) holder.userData.fallbackMesh.geometry.dispose();
        if (holder.userData.fallbackMesh.material) holder.userData.fallbackMesh.material.dispose();
        holder.userData.fallbackMesh = null;
      }

      setupCharacterAnimations(id, holder, template);
    })
    .catch(() => {
      if (holder.userData.pendingSkinFile === file) holder.userData.pendingSkinFile = null;
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
  if (!player) return DEFAULT_LOADOUT.equippedSkin;
  let id = (player.loadout && player.loadout.equippedSkin) || player.equippedSkin;
  if (typeof id !== 'string' || !id) id = DEFAULT_LOADOUT.equippedSkin;
  if (id === 'default') id = MALE_STARTER_ID;
  return STORE_CATALOG[id] ? id : DEFAULT_LOADOUT.equippedSkin;
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

function getOrCreatePlayerMesh(id, player) {
  let mesh = playerMeshes[id];
  const isMe = id === myId;

  const disguised = player.isProp && player.propId;
  const boxColor = resolveDisguiseColor(player);
  const skinId = resolvePlayerSkinId(player);

  const wantsCharacter = !disguised;
  const isCharacter = !!(mesh && mesh.userData && mesh.userData.isCharacter);

  if (mesh && isCharacter !== wantsCharacter) {
    removePlayerMesh(id);
    mesh = null;
  }

  if (!mesh) {
    if (disguised) {
      const prop = props.find((pp) => pp.id === player.propId);
      const w = prop ? prop.width : 40;
      const d = prop ? prop.height : 40;
      const geo = new THREE.BoxGeometry(w, PROP_HEIGHT, d);
      const mat = new THREE.MeshStandardMaterial({
        color: boxColor,
        metalness: skinId === 'steelProp' ? 0.75 : 0.05,
        roughness: skinId === 'steelProp' ? 0.28 : 0.8
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.isCharacter = false;
    } else {
      mesh = new THREE.Group();
      mesh.userData.isCharacter = true;
      mesh.userData.skinFile = null;
      mesh.userData.pendingSkinFile = null;
      mesh.userData.model = null;

      const geo = new THREE.CylinderGeometry(PLAYER_RADIUS_3D, PLAYER_RADIUS_3D, PLAYER_HEIGHT_3D, 16);
      const mat = new THREE.MeshStandardMaterial({ color: resolveMeshColor(player), roughness: 0.6 });
      const fallback = new THREE.Mesh(geo, mat);
      fallback.position.y = PLAYER_HEIGHT_3D / 2;
      fallback.castShadow = true;
      fallback.receiveShadow = true;
      mesh.add(fallback);
      mesh.userData.fallbackMesh = fallback;

      if (isMe) {
        const outlineGeo = new THREE.TorusGeometry(PLAYER_RADIUS_3D + 1, 1, 8, 24);
        const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const ring = new THREE.Mesh(outlineGeo, outlineMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = PLAYER_HEIGHT_3D + 1;
        mesh.add(ring);
        mesh.userData.ring = ring;
      }
    }
    mesh.userData.id = id;
    playerMeshes[id] = mesh;
    playerGroup.add(mesh);
  } else if (!wantsCharacter) {
    if (mesh.material && mesh.material.color) mesh.material.color.setHex(boxColor);
  }

  if (wantsCharacter) {
    attachSkinToPlayer(id, mesh, skinId);
    if (mesh.userData.fallbackMesh && mesh.userData.fallbackMesh.material) {
      mesh.userData.fallbackMesh.material.color.setHex(resolveMeshColor(player));
    }
  }

  if (isMe) mesh.visible = false;
  else mesh.visible = !!player.alive;

  return mesh;
}

function removePlayerMesh(id) {
  const mesh = playerMeshes[id];
  if (!mesh) return;
  disposePlayerMixer(id);
  playerGroup.remove(mesh);
  mesh.traverse((node) => {
    if (node.isMesh || node.isSkinnedMesh) {
      if (node.geometry) node.geometry.dispose();
      if (node.userData && node.userData.disposableMaterial && node.material) {
        node.material.dispose();
      }
    }
  });
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

    const mesh = getOrCreatePlayerMesh(id, player);
    if (!player.alive) {
      mesh.visible = false;
      continue;
    }

    const remoteEyeHeight = isMe ? (camera ? camera.position.y : PLAYER_EYE_HEIGHT) : (typeof player.y === 'number' ? player.y : PLAYER_EYE_HEIGHT);
    const verticalOffset = remoteEyeHeight - PLAYER_EYE_HEIGHT;

    if (mesh.userData.isCharacter) {
      const ud = mesh.userData;
      if (ud.lastPos) {
        const dtSec = Math.max(0.001, (nowMs - ud.lastPosTime) / 1000);
        const inst = Math.hypot(px - ud.lastPos.x, pz - ud.lastPos.z) / dtSec;
        ud.speed = (ud.speed || 0) * 0.6 + inst * 0.4;
      } else {
        ud.speed = 0;
      }
      ud.lastPos = { x: px, z: pz };
      ud.lastPosTime = nowMs;

      mesh.position.set(px, verticalOffset, pz);
      if (isMe && camera) {
        mesh.rotation.y = camera.rotation.y + Math.PI;
      } else if (ud.speed > CHARACTER_WALK_SPEED && ud.prevFacing) {
        const dx = px - ud.prevFacing.x;
        const dz = pz - ud.prevFacing.z;
        if (dx * dx + dz * dz > 0.0001) mesh.rotation.y = Math.atan2(dx, dz);
      }
      ud.prevFacing = { x: px, z: pz };
    } else {
      mesh.position.set(px, PROP_HEIGHT / 2 + verticalOffset, pz);
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
  } else {
    hudHealthBar.classList.add('hidden');
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
  opts.gender = starterGender || (starterId === FEMALE_STARTER_ID ? 'female' : 'male');
  socket.emit('joinGame', opts);
  hideMainMenu();
  hideDeathScreen();
  hideMatchOver();
  showHud();
  if (lockHint && !controls.isLocked) {
    lockHint.classList.remove('hidden');
  }
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
  const source = (loadout && typeof loadout === 'object') ? loadout : {};
  const normalized = {};
  for (const slot of LOADOUT_SLOTS) {
    let wanted = typeof source[slot] === 'string' ? source[slot] : DEFAULT_LOADOUT[slot];
    if (slot === 'equippedSkin' && wanted === 'default') wanted = MALE_STARTER_ID;
    normalized[slot] = (STORE_CATALOG[wanted] && owned.has(wanted)) ? wanted
      : (slot === 'equippedSkin' ? defaultEquippedSkinId() : DEFAULT_LOADOUT[slot]);
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
  if (Array.isArray(inventory)) {
    const set = new Set(inventory);
    for (const id of DEFAULT_INVENTORY) set.add(id);
    set.add(guaranteedStarterSkinId());
    myInventory = Array.from(set);
  }
  ensureExclusiveStarterInventory();
  myLoadout = normalizeMyLoadout(loadout, myInventory);
  myEquippedSkin = myLoadout.equippedSkin;
}

function applyWalletPayload(data) {
  if (!data) return;
  if (typeof data.coins === 'number') myCoins = data.coins;
  if (data.loadout || data.inventory !== undefined || typeof data.equippedSkin === 'string') {
    applyLoadoutState(data.inventory, data.loadout || { equippedSkin: data.equippedSkin });
  }
  if (typeof data.isRegistered === 'boolean') isRegistered = data.isRegistered;
  if (data.username !== undefined) myUsername = data.username || null;
  if (typeof data.displayName === 'string' && data.displayName) {
    myDisplayName = data.displayName;
  } else if (isRegistered && myUsername) {
    myDisplayName = myUsername;
  } else {
    myDisplayName = 'Guest_' + String(persistentPlayerId).slice(-4);
  }
  refreshStoreUi();
  updateAccountLabel();
  updateWeaponHud();
}

function updateAccountLabel() {
  if (menuAccountLabel) {
    menuAccountLabel.textContent = isRegistered ? ('Signed in as ' + (myUsername || myDisplayName)) : ('Playing as ' + myDisplayName);
  }
  if (btnAuth) btnAuth.textContent = isRegistered ? 'Account' : 'Register / Login';
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
  return myInventory.includes(itemId);
}

function isEquippedItem(itemId) {
  const item = STORE_CATALOG[itemId];
  return !!(item && myLoadout[item.slot] === itemId);
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
      if (nameEl) nameEl.textContent = item ? item.name : '—';
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
  const item = STORE_CATALOG[itemId];
  if (item && item.type === 'skin') socket.emit('equipSkin', itemId);
  else socket.emit('equipItem', itemId);
}

function requestBuyItem(itemId) {
  if (!socket) return;
  const item = STORE_CATALOG[itemId];
  if (item && item.type === 'skin') socket.emit('buySkin', itemId);
  else socket.emit('buyItem', itemId);
}

function itemPreviewSrc(itemOrId) {
  const item = STORE_CATALOG[itemOrId];
  if (!item) return '';
  const dir = item.type === 'skin' ? 'skins' : 'weapons';
  return `/images/${dir}/${item.id}.png`;
}

function createStoreSwatch(item) {
  const swatch = document.createElement('div');
  swatch.className = 'store-swatch ' + (STORE_SWATCH_CLASS[item.id] || '');
  swatch.classList.add('sw-image');
  const img = document.createElement('img');
  img.className = 'item-preview-img';
  img.src = itemPreviewSrc(item.id);
  img.alt = item.name;
  img.loading = 'lazy';
  swatch.appendChild(img);
  return swatch;
}

function createStoreCard(item, mode = 'shop') {
  const card = document.createElement('div');
  card.className = 'store-card';
  card.dataset.item = item.id;
  card.appendChild(createStoreSwatch(item));

  const heading = document.createElement('h3');
  heading.textContent = item.name;
  card.appendChild(heading);

  const desc = document.createElement('p');
  desc.className = 'store-desc';
  desc.textContent = item.stats || '';
  card.appendChild(desc);

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.item = item.id;

  if (mode === 'inventory') {
    const equipped = isEquippedItem(item.id);
    const badge = document.createElement('span');
    badge.className = 'equipped-badge' + (equipped ? ' visible' : ' hidden');
    badge.textContent = 'Equipped';
    card.appendChild(badge);
    button.className = 'store-action ' + (equipped ? 'equipped' : 'owned');
    button.disabled = equipped;
    button.textContent = equipped ? 'Equipped' : 'Equip';
    button.addEventListener('click', () => {
      if (!equipped) requestEquipItem(item.id);
    });
  } else {
    const owned = isOwnedItem(item.id);
    button.id = `storeBuy-${item.id}`;
    if (item.cost <= 0) {
      button.className = 'store-action ' + (owned ? 'equipped' : 'owned');
      button.disabled = owned;
      button.textContent = owned ? 'Owned · Inventory' : 'Included';
    } else {
      button.className = 'store-action' + (owned ? ' equipped' : '');
      button.disabled = owned;
      button.textContent = owned ? 'Owned' : `Buy — ${item.cost}`;
    }
    button.addEventListener('click', () => handleStoreAction(item.id));
  }

  card.appendChild(button);
  return card;
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
  current.textContent = equippedItem ? `Equipped: ${equippedItem.name}` : '';
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
  return STORE_ITEM_IDS.map((id) => STORE_CATALOG[id]).filter((item) => item && item.type === type && !item.legacy);
}

function renderShopCatalog() {
  if (!shopItemsEl) return;
  shopItemsEl.innerHTML = '';
  for (const category of STORE_CATEGORIES) {
    const items = itemsForCategory(category.type).filter((item) => !isOwnedItem(item.id));
    appendCategorySection(shopItemsEl, category, items, 'shop');
  }
  if (!shopItemsEl.children.length) {
    const empty = document.createElement('p');
    empty.className = 'store-empty';
    empty.textContent = 'You own everything in the store. Check the Inventory tab to equip it.';
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
    current.textContent = `Equipped: ${currentItem ? currentItem.name : '—'}`;
    card.appendChild(current);

    const options = document.createElement('div');
    options.className = 'loadout-options';
    const ownedItems = itemsForCategory(slotInfo.type).filter((item) => isOwnedItem(item.id));

    for (const item of ownedItems) {
      const equipped = isEquippedItem(item.id);
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'loadout-equip-button' + (equipped ? ' active' : '');
      option.dataset.item = item.id;
      option.disabled = equipped;
      option.textContent = equipped ? `✓ ${item.name}` : item.name;
      option.title = equipped ? `${item.name} is equipped` : `Equip ${item.name} in ${slotInfo.label}`;
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
  for (const category of STORE_CATEGORIES) {
    const pool = category.type === 'skin' ? STARTER_SKIN_IDS.map((id) => STORE_CATALOG[id]).concat(itemsForCategory('skin')) : itemsForCategory(category.type);
    const ownedItems = pool.filter((item) => item && isOwnedItem(item.id));
    appendCategorySection(inventoryItemsEl, category, ownedItems, 'inventory');
  }
}

function refreshStoreUi() {
  if (storeCoinBalance) storeCoinBalance.textContent = `${myCoins} Coins`;
  renderShopCatalog();
  refreshInventoryUi();
  refreshCharacterPreview();
  reanchorCharacterHoverPreview();
}

function openStore() {
  switchStoreTab('shop');
  if (storeOverlay) storeOverlay.classList.remove('hidden');
  if (storeStatus) { storeStatus.textContent = ''; storeStatus.style.color = '#8ee8ff'; }
  refreshStoreUi();
}

function closeStore() {
  hideCharacterHoverPreview();
  if (storeOverlay) storeOverlay.classList.add('hidden');
}

function handleStoreAction(itemId) {
  if (!socket) return;
  if (storeStatus) storeStatus.textContent = '';
  if (isOwnedItem(itemId)) {
    if (storeStatus) { storeStatus.textContent = 'Already owned — equip it from Inventory.'; storeStatus.style.color = '#8ee8ff'; }
    return;
  }
  if (myCoins < (STORE_CATALOG[itemId] ? STORE_CATALOG[itemId].cost : 0)) {
    setStoreStatus('Not enough coins.', '#ff8a7a');
    return;
  }
  requestBuyItem(itemId);
}

let hoverPreviewCard = null;   
let hoverPreviewFrame = 0;     

function populateCharacterHoverPreview(item) {
  if (!characterHoverPreview || !item) return;
  const rarity = storeItemRarity(item);
  const src = itemPreviewSrc(item.id);

  if (chpImage) {
    if (src) {
      chpImage.src = src; chpImage.alt = item.name + ' — full preview'; chpImage.classList.remove('hidden');
      if (chpFallback) chpFallback.classList.add('hidden');
    } else {
      chpImage.removeAttribute('src'); chpImage.classList.add('hidden');
      if (chpFallback) { chpFallback.textContent = STORE_ITEM_ICON[item.id] || '🎭'; chpFallback.classList.remove('hidden'); }
    }
  }
  if (chpTitle) { chpTitle.textContent = item.name; chpTitle.title = item.name; }
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
  let gender = null, skinId = null;
  try {
    gender = localStorage.getItem(LS_STARTER_GENDER);
    skinId = localStorage.getItem(LS_STARTER_SKIN);
    if (!skinId) {
      const model = localStorage.getItem(LS_STARTER_MODEL);
      if (model === 'Casual_w.glb') skinId = FEMALE_STARTER_ID;
      else if (model === 'Casual_Character.glb') skinId = MALE_STARTER_ID;
    }
  } catch (err) {}
  if (gender !== 'male' && gender !== 'female') gender = null;
  if (!gender && skinId) gender = skinId === FEMALE_STARTER_ID ? 'female' : 'male';
  if (gender && !skinId) skinId = STARTER_BY_GENDER[gender].id;
  if (skinId && !STARTER_SKIN_IDS.includes(skinId)) skinId = null;
  return { gender, skinId };
}

function persistStarterChoice(gender) {
  const starter = STARTER_BY_GENDER[gender];
  if (!starter) return false;
  starterGender = gender;
  chosenStarterSkinId = starter.id;
  hasChosenStarter = true;
  try {
    localStorage.setItem(LS_STARTER_GENDER, gender);
    localStorage.setItem(LS_STARTER_MODEL, starter.file);
    localStorage.setItem(LS_STARTER_SKIN, starter.id);
  } catch (err) {}
  return true;
}

function selectedStarterGender() {
  const checked = starterRadios.find((radio) => radio.checked);
  return checked ? checked.value : null;
}

function reflectStarterSelection() {
  const gender = selectedStarterGender();
  const starter = gender ? STARTER_BY_GENDER[gender] : null;
  if (starterConfirmBtn) starterConfirmBtn.disabled = !starter;
  if (starterStatus) {
    starterStatus.textContent = starter ? `Starter selected: ${starter.label}` : 'Tap a card above to preview your starter.';
  }
}

function openStarterSelection() {
  if (!starterOverlay) return;
  const target = starterGender || 'male';
  starterRadios.forEach((radio) => { radio.checked = radio.value === target; });
  reflectStarterSelection();
  starterOverlay.classList.remove('hidden');
}

function closeStarterSelection() {
  if (starterOverlay) starterOverlay.classList.add('hidden');
}

function confirmStarterSelection() {
  const gender = selectedStarterGender();
  if (!persistStarterChoice(gender)) return;
  const starter = STARTER_BY_GENDER[gender];

  if (!myInventory.includes(starter.id)) myInventory.push(starter.id);
  ensureExclusiveStarterInventory();
  myLoadout.equippedSkin = starter.id;
  myEquippedSkin = starter.id;

  if (socket) {
    socket.emit('equipSkin', { skinId: starter.id, gender, starterSkin: starter.id, model: starter.file, playerId: persistentPlayerId });
    socket.emit('requestWallet', persistentPlayerId);
  }

  if (players[myId]) {
    players[myId].equippedSkin = starter.id;
    if (players[myId].loadout) players[myId].loadout.equippedSkin = starter.id;
    updatePlayerMeshes();
  }

  refreshStoreUi();
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

  if (chosenStarterSkinId) {
    if (!myInventory.includes(chosenStarterSkinId)) myInventory.push(chosenStarterSkinId);
    ensureExclusiveStarterInventory();
    if (!myLoadout.equippedSkin || STARTER_SKIN_IDS.includes(myLoadout.equippedSkin)) {
      myLoadout.equippedSkin = chosenStarterSkinId;
      myEquippedSkin = chosenStarterSkinId;
    }
  }

  starterRadios.forEach((radio) => radio.addEventListener('change', reflectStarterSelection));
  if (starterConfirmBtn) starterConfirmBtn.addEventListener('click', confirmStarterSelection);
  if (btnCharacter) btnCharacter.addEventListener('click', openStarterSelection);
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
    socket.emit('registerAccount', { username, password, playerId: persistentPlayerId });
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
  showMainMenuRoot();
}

function attachSocketListeners() {
  socket.on('registerResult', (data) => {
    if (data && data.ok) { sessionStorage.setItem('propHuntPlayerId', data.playerId); window.location.reload(); }
    else { showAuthError((data && data.message) || 'Registration failed.'); }
  });

  socket.on('loginResult', (data) => {
    if (data && data.ok) { sessionStorage.setItem('propHuntPlayerId', data.playerId); window.location.reload(); }
    else { showAuthError((data && data.message) || 'Login failed.'); }
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
  });

  socket.on('equipResult', (data) => {
    applyWalletPayload(data);
    if (storeStatus) {
      storeStatus.textContent = data && data.ok ? (data.itemId ? `${(STORE_CATALOG[data.itemId] && STORE_CATALOG[data.itemId].name) || 'Item'} equipped.` : 'Item equipped.') : ((data && data.message) || 'Could not equip.');
      storeStatus.style.color = data && data.ok ? '#8ee8ff' : '#ff8a7a';
    }
    if (data && data.ok) {
      const newSkin = (data.loadout && data.loadout.equippedSkin) || data.equippedSkin;
      if (newSkin) loadSkinModel(skinFileForId(newSkin)).catch(() => {});
      if (players[myId]) {
        players[myId].equippedSkin = newSkin || players[myId].equippedSkin;
        if (data.loadout) players[myId].loadout = normalizeMyLoadout(data.loadout, players[myId].inventory);
        updatePlayerMeshes();
        updateWeaponHud();
      }
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
    players[data.id] = data.player;
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
    isDisguised = players[myId].isProp; myRole = players[myId].role; amAlive = players[myId].alive;
    myHealth = players[myId].health != null ? players[myId].health : myHealth;

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

  socket.on('fireTracer', (tracer) => { spawnTracer(tracer); });
  socket.on('leaderboardUpdate', (entries) => { renderLeaderboard(entries); });
  socket.on('radarData', (data) => {
    radarContacts = {};
    for (const contact of data.realtime || []) radarContacts[contact.id] = contact;
  });

  socket.on('hit', (data) => {
    myHealth = data.health; damageFlashAlpha = 0.75; cancelHeal();
    if (data.disguiseBroken) { disguiseBreakNotification = performance.now(); isDisguised = false; }
    if (data.wasMelee) damageFlashAlpha = 0.85;
    updateHealthDisplay();
  });

  socket.on('disguiseBroken', (data) => {
    myHealth = data.health; damageFlashAlpha = 0.8; disguiseBreakNotification = performance.now();
    isDisguised = false; cancelHeal(); updateHealthDisplay();
  });

  socket.on('meleeHit', () => { triggerMeleeHitIndicator(); });
  socket.on('meleeMiss', () => {});
  socket.on('meleeDamaged', () => { damageFlashAlpha = 0.85; cancelHeal(); });

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
  if (key === 'h' && hasJoined && amAlive) { startHeal(); }
  if (key === '1' && hasJoined && amAlive) { switchWeapon('primary'); }
  if (key === '2' && hasJoined && amAlive) { switchWeapon('secondary'); }
  if (key === 'r' && hasJoined && amAlive) { startReload(); }
  if (key === 'g' && hasJoined && amAlive) { handleThrowKnife(); }
  if (isHealing && (key === 'w' || key === 'a' || key === 's' || key === 'd' || event.code === 'Space')) { cancelHeal(); }
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
  if (!socket || !hasJoined || matchState !== 'playing' || !amAlive || myHealth >= 100 || isHealing) return;
  isHealing = true; healStartedAt = performance.now();
  if (healProgressContainer) healProgressContainer.classList.remove('hidden');
  updateHealProgress();
}

function cancelHeal() {
  if (!isHealing) return;
  isHealing = false; healStartedAt = 0;
  if (healProgressContainer) healProgressContainer.classList.add('hidden');
  if (healProgressFill) healProgressFill.style.width = '0%';
}

function updateHealProgress() {
  if (!isHealing) return;
  if (keys.w || keys.a || keys.s || keys.d || keys.space) { cancelHeal(); return; }
  const elapsed = performance.now() - healStartedAt;
  const progress = Math.min(1, elapsed / HEAL_CHANNEL_MS);
  if (healProgressFill) healProgressFill.style.width = (progress * 100) + '%';
  if (progress >= 1) { socket.emit('requestHeal'); cancelHeal(); }
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
  return item ? item.name : '—';
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
  if (!groundColliders || groundColliders.length === 0) return 0;
  rayOrigin.set(x, RAY_START_HEIGHT, z);
  terrainRaycaster.set(rayOrigin, DOWN_VECTOR);
  terrainRaycaster.far = RAY_MAX_DISTANCE;
  const hits = terrainRaycaster.intersectObjects(groundColliders, false);

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
  const moved = lastFloorSampleX === null || Math.hypot(camera.position.x - lastFloorSampleX, camera.position.z - lastFloorSampleZ) > 0.05;
  if (moved) {
    currentFloorHeight = sampleFloorHeight(camera.position.x, camera.position.z);
  }
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
  const targetFov = (isAiming && canAds) ? ADS_FOV : DEFAULT_FOV;
  if (Math.abs(camera.fov - targetFov) < 0.01) {
    if (camera.fov !== targetFov) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
    return;
  }
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-ADS_LERP_SPEED * dt));
  camera.updateProjectionMatrix();
}

function emitMoveIfChanged() {
  if (!socket || !hasJoined || !amAlive || isDisguised || !players[myId]) return;
  const px = camera.position.x, py = camera.position.y, pz = camera.position.z;
  if (lastSentX === null || Math.abs(px - lastSentX) > 0.001 || Math.abs(py - lastSentY) > 0.001 || Math.abs(pz - lastSentZ) > 0.001) {
    socket.emit('playerMove', { x: px, y: py, z: pz });
    lastSentX = px; lastSentY = py; lastSentZ = pz;
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

    // eslint-disable-next-line no-undef
    socket = io('https://ghosttown-prophunt.onrender.com');
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