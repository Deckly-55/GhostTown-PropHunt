const fs = require('fs');
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

app.use('/public/Skins/Players', express.static(path.join(__dirname, 'public', 'Skins', 'Players')));
app.use('/Skins/Players', express.static(path.join(__dirname, 'public', 'Skins', 'Players')));
app.use('/Skins/Weapons', express.static(path.join(__dirname, 'public', 'Skins', 'Weapons')));
app.use('/public/Skins/Weapons', express.static(path.join(__dirname, 'public', 'Skins', 'Weapons')));
app.use('/store/weapons', express.static(path.join(__dirname, 'public', 'store', 'weapons')));
app.use('/public/store/weapons', express.static(path.join(__dirname, 'public', 'store', 'weapons')));
app.use(express.static(path.join(__dirname, 'public', 'Skins', 'Players')));
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/store-weapons', (req, res) => {
  const list = Object.values(STORE_ITEMS).filter(it => it && it.type !== 'skin' && !it.legacy);
  res.json(list);
});

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
  Casual_w: { id: 'Casual_w', name: 'Casual Female', file: 'Casual_w.glb', cost: 0, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },

  // — Store Catalog: 19 skins ordered by price (ascending) —
  Beach_Character: { id: 'Beach_Character', name: 'Beach Character', file: 'Beach_Character.glb', cost: 500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Casual_w2: { id: 'Casual_w2', name: 'Casual Female 2', file: 'Casual_w2.glb', cost: 500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Farmer: { id: 'Farmer', name: 'Farmer', file: 'Farmer.glb', cost: 600, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Hoodie_Character: { id: 'Hoodie_Character', name: 'Hoodie Character', file: 'Hoodie_Character.glb', cost: 600, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Worker: { id: 'Worker', name: 'Worker', file: 'Worker.glb', cost: 600, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Worker_w: { id: 'Worker_w', name: 'Worker Female', file: 'Worker_w.glb', cost: 600, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Adventurer: { id: 'Adventurer', name: 'Adventurer', file: 'Adventurer.glb', cost: 650, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Business_Man: { id: 'Business_Man', name: 'Business Man', file: 'Business_Man.glb', cost: 700, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Adventurer_w: { id: 'Adventurer_w', name: 'Adventurer Female', file: 'Adventurer_w.glb', cost: 750, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Punk: { id: 'Punk', name: 'Punk', file: 'Punk.glb', cost: 800, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Suit_w: { id: 'Suit_w', name: 'Suit Female', file: 'Suit_w.glb', cost: 800, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Medieval_w: { id: 'Medieval_w', name: 'Medieval Female', file: 'Medieval_w.glb', cost: 850, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Soldier_w: { id: 'Soldier_w', name: 'Soldier Female', file: 'Soldier_w.glb', cost: 850, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Punk_w: { id: 'Punk_w', name: 'Punk Female', file: 'Punk_w.glb', cost: 900, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Swat: { id: 'Swat', name: 'SWAT', file: 'Swat.glb', cost: 950, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  King: { id: 'King', name: 'King', file: 'King.glb', cost: 1500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Witch_w: { id: 'Witch_w', name: 'Witch Female', file: 'Witch_w.glb', cost: 1500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Sci_Fi_Character_w: { id: 'Sci_Fi_Character_w', name: 'Sci-Fi Character Female', file: 'Sci_Fi_Character_w.glb', cost: 2500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },
  Astronaut: { id: 'Astronaut', name: 'Astronaut', file: 'Astronaut.glb', cost: 3000, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null },

  // — Legacy compatibility (old accounts) —
  default: { id: 'default', name: 'Standard Uniform', file: 'Casual_Character.glb', cost: 0, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null, legacy: true },
  shadowHunter: { id: 'shadowHunter', name: 'Shadow Hunter Skin', file: 'Casual_Character.glb', cost: 500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null, legacy: true },
  steelProp: { id: 'steelProp', name: 'Steel Prop Crate', file: 'Casual_w.glb', cost: 500, type: 'skin', slot: 'equippedSkin', profile: null, tracer: null, legacy: true },

  // — 11 Legendary Weapons (Gold/Legendary tier) —
  'l.arcSidearm': { id: 'l.arcSidearm', name: 'Arc Sidearm', file: 'l.arcSidearm.glb', thumb: '/store/weapons/l.arcsidearm.png', cost: 2200, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffd700, isLegendary: true },
  'l.eclipseRifle': { id: 'l.eclipseRifle', name: 'Eclipse Rifle', file: 'l.eclipseRifle.glb', thumb: '/store/weapons/l.eclipserifle.png', cost: 2500, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd700, isLegendary: true },
  'l.hyperionMK2': { id: 'l.hyperionMK2', name: 'Hyperion MK-II', file: 'l.hyperionMK2.glb', thumb: '/store/weapons/l.hyperionmk2.png', cost: 2800, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd700, isLegendary: true },
  'l.ionStriker': { id: 'l.ionStriker', name: 'Ion Striker', file: 'l.ionStriker.glb', thumb: '/store/weapons/l.ionstriker.png', cost: 2600, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x66ccff, isLegendary: true },
  'l.nova7Blaster': { id: 'l.nova7Blaster', name: 'Nova-7 Blaster', file: 'l.nova7Blaster.glb', thumb: '/store/weapons/l.nova7blaster.png', cost: 2700, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xff6600, isLegendary: true },
  'l.photonRipper': { id: 'l.photonRipper', name: 'Photon Ripper', file: 'l.photonRipper.glb', thumb: '/store/weapons/l.photonripper.png', cost: 2500, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null, isLegendary: true },
  'l.railghostX1': { id: 'l.railghostX1', name: 'Railghost X1', file: 'l.railghostX1.glb', thumb: '/store/weapons/l.railghostx1.png', cost: 3000, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x00ffff, isLegendary: true },
  'l.spectreXCarbine': { id: 'l.spectreXCarbine', name: 'Spectre-X Carbine', file: 'l.spectreXCarbine.glb', thumb: '/store/weapons/l.spectrexcarbine.png', cost: 2500, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd700, isLegendary: true },
  'l.vanguardPulseAR': { id: 'l.vanguardPulseAR', name: 'Vanguard Pulse AR', file: 'l.vanguardPulseAR.glb', thumb: '/store/weapons/l.vanguardpulsear.png', cost: 2750, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd700, isLegendary: true },
  'l.voidLance': { id: 'l.voidLance', name: 'Void Lance', file: 'l.voidLance.glb', thumb: '/store/weapons/l.voidlance.png', cost: 2600, type: 'propWeapon', slot: 'secondaryKnife', profile: 'thrown', tracer: 0xcc66ff, isLegendary: true },
  'l.volt9Auto': { id: 'l.volt9Auto', name: 'Volt-9 Auto', file: 'l.volt9Auto.glb', thumb: '/store/weapons/l.volt9auto.png', cost: 2400, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffd700, isLegendary: true },

  // — 42 Standard Weapons —
  alleySweeper: { id: 'alleySweeper', name: 'Alley Sweeper', file: 'alleySweeper.glb', thumb: '/store/weapons/alleySweeper.png', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffe27a },
  ammopistol: { id: 'ammopistol', name: 'Ammo Pistol', file: 'ammopistol.glb', thumb: '/store/weapons/ammopistol.png', cost: 500, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a },
  ammoshotgun: { id: 'ammoshotgun', name: 'Ammo Shotgun', file: 'ammoshotgun.glb', thumb: '/store/weapons/ammoshotgun.png', cost: 700, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd08a },
  ammosniper: { id: 'ammosniper', name: 'Ammo Sniper', file: 'ammosniper.glb', thumb: '/store/weapons/ammosniper.png', cost: 950, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },
  Arrow: { id: 'Arrow', name: 'Arrow', file: 'Arrow.glb', thumb: '/store/weapons/Arrow.png', cost: 500, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },
  blackoutAR: { id: 'blackoutAR', name: 'Blackout AR', file: 'blackoutAR.glb', thumb: '/store/weapons/blackoutAR.png', cost: 850, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffe27a },
  bloodfangDagger: { id: 'bloodfangDagger', name: 'Bloodfang Dagger', file: 'bloodfangDagger.glb', thumb: '/store/weapons/bloodfangDagger.png', cost: 600, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  bonecrusher: { id: 'bonecrusher', name: 'Bonecrusher', file: 'bonecrusher.glb', thumb: '/store/weapons/bonecrusher.png', cost: 750, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  breacher12G: { id: 'breacher12G', name: 'Breacher 12G', file: 'breacher12G.glb', thumb: '/store/weapons/breacher12G.png', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd08a },
  cryptkeeperAuto: { id: 'cryptkeeperAuto', name: 'Cryptkeeper Auto', file: 'cryptkeeperAuto.glb', thumb: '/store/weapons/cryptkeeperAuto.png', cost: 900, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffe27a },
  cursedCleaver: { id: 'cursedCleaver', name: 'Cursed Cleaver', file: 'cursedCleaver.glb', thumb: '/store/weapons/cursedCleaver.png', cost: 700, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  duskbreakerAR: { id: 'duskbreakerAR', name: 'Duskbreaker AR', file: 'duskbreakerAR.glb', thumb: '/store/weapons/duskbreakerAR.png', cost: 850, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xff8c42 },
  fieldBlade: { id: 'fieldBlade', name: 'Field Blade', file: 'fieldBlade.glb', thumb: '/store/weapons/fieldBlade.png', cost: 0, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  ghostblade: { id: 'ghostblade', name: 'Ghostblade', file: 'ghostblade.glb', thumb: '/store/weapons/ghostblade.png', cost: 850, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  graveyardPump: { id: 'graveyardPump', name: 'Graveyard Pump', file: 'graveyardPump.glb', thumb: '/store/weapons/graveyardPump.png', cost: 750, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd08a },
  grimHarvester: { id: 'grimHarvester', name: 'Grim Harvester', file: 'grimHarvester.glb', thumb: '/store/weapons/grimHarvester.png', cost: 950, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  hellhoundMK3: { id: 'hellhoundMK3', name: 'Hellhound MK-III', file: 'hellhoundMK3.glb', thumb: '/store/weapons/hellhoundMK3.png', cost: 950, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xff8c42 },
  hollowPointMK4: { id: 'hollowPointMK4', name: 'Hollow Point MK-IV', file: 'hollowPointMK4.glb', thumb: '/store/weapons/hollowPointMK4.png', cost: 900, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffe27a },
  ironJudge44: { id: 'ironJudge44', name: 'Iron Judge .44', file: 'ironJudge44.glb', thumb: '/store/weapons/ironJudge44.png', cost: 750, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a },
  ironPry: { id: 'ironPry', name: 'Iron Pry', file: 'ironPry.glb', thumb: '/store/weapons/ironPry.png', cost: 450, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  marshCarver: { id: 'marshCarver', name: 'Marsh Carver', file: 'marshCarver.glb', thumb: '/store/weapons/marshCarver.png', cost: 650, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  militiaCarbine: { id: 'militiaCarbine', name: 'Militia Carbine', file: 'militiaCarbine.glb', thumb: '/store/weapons/militiaCarbine.png', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffe27a },
  nightshadePistol: { id: 'nightshadePistol', name: 'Nightshade Tactical', file: 'nightshadePistol.glb', thumb: '/store/weapons/nightshadePistol.png', cost: 650, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a },
  nightwatchDMR: { id: 'nightwatchDMR', name: 'Nightwatch DMR', file: 'nightwatchDMR.glb', thumb: '/store/weapons/nightwatchDMR.png', cost: 900, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },
  outlawRevolver: { id: 'outlawRevolver', name: 'Outlaw Six-Shooter', file: 'outlawRevolver.glb', thumb: '/store/weapons/outlawRevolver.png', cost: 700, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a },
  paleRider: { id: 'paleRider', name: 'Pale Rider', file: 'paleRider.glb', thumb: '/store/weapons/paleRider.png', cost: 800, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a },
  Quiver: { id: 'Quiver', name: 'Quiver', file: 'Quiver.glb', thumb: '/store/weapons/Quiver.png', cost: 600, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },
  reapersEye: { id: 'reapersEye', name: "Reaper's Eye", file: 'reapersEye.glb', thumb: '/store/weapons/reapersEye.png', cost: 1000, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xff8c42 },
  rustbolt308: { id: 'rustbolt308', name: 'Rustbolt .308', file: 'rustbolt308.glb', thumb: '/store/weapons/rustbolt308.png', cost: 850, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffe27a },
  rustyJaw: { id: 'rustyJaw', name: 'Rusty Jaw', file: 'rustyJaw.glb', thumb: '/store/weapons/rustyJaw.png', cost: 500, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  rustyShiv: { id: 'rustyShiv', name: 'Rusty Shiv', file: 'rustyShiv.glb', thumb: '/store/weapons/rustyShiv.png', cost: 400, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  shadow45: { id: 'shadow45', name: 'Shadow .45', file: 'shadow45.glb', thumb: '/store/weapons/shadow45.png', cost: 600, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a },
  shadowFang: { id: 'shadowFang', name: 'Shadow Fang', file: 'shadowFang.glb', thumb: '/store/weapons/shadowFang.png', cost: 800, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  silentStalker: { id: 'silentStalker', name: 'Silent Stalker', file: 'silentStalker.glb', thumb: '/store/weapons/silentStalker.png', cost: 750, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },
  skullcracker: { id: 'skullcracker', name: 'Skullcracker', file: 'skullcracker.glb', thumb: '/store/weapons/skullcracker.png', cost: 750, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  slaughterhouseCleaver: { id: 'slaughterhouseCleaver', name: 'Slaughterhouse Cleaver', file: 'slaughterhouseCleaver.glb', thumb: '/store/weapons/slaughterhouseCleaver.png', cost: 850, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  timberRipper: { id: 'timberRipper', name: 'Timber Ripper', file: 'timberRipper.glb', thumb: '/store/weapons/timberRipper.png', cost: 700, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  trackersEdge: { id: 'trackersEdge', name: "Tracker's Edge", file: 'trackersEdge.glb', thumb: '/store/weapons/trackersEdge.png', cost: 650, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null },
  watchman9mm: { id: 'watchman9mm', name: 'Watchman 9mm', file: 'watchman9mm.glb', thumb: '/store/weapons/watchman9mm.png', cost: 550, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a },
  whisperingRecurve: { id: 'whisperingRecurve', name: 'Whispering Recurve', file: 'whisperingRecurve.glb', thumb: '/store/weapons/whisperingRecurve.png', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },
  widowmaker: { id: 'widowmaker', name: 'Widowmaker', file: 'widowmaker.glb', thumb: '/store/weapons/widowmaker.png', cost: 950, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },
  wraithLongshot: { id: 'wraithLongshot', name: 'Wraith Longshot', file: 'wraithLongshot.glb', thumb: '/store/weapons/wraithLongshot.png', cost: 1100, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff },

  // — Legacy weapon aliases (for legacy account loadouts) —
  standardRifle: { id: 'standardRifle', name: 'Militia Carbine', file: 'militiaCarbine.glb', thumb: '/store/weapons/militiaCarbine.png', cost: 0, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffe27a, legacy: true },
  shotgun: { id: 'shotgun', name: 'Graveyard Pump', file: 'graveyardPump.glb', thumb: '/store/weapons/graveyardPump.png', cost: 700, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xffd08a, legacy: true },
  vulcanRifle: { id: 'vulcanRifle', name: 'Hellhound MK-III', file: 'hellhoundMK3.glb', thumb: '/store/weapons/hellhoundMK3.png', cost: 800, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0xff8c42, legacy: true },
  longshotMk2: { id: 'longshotMk2', name: 'Nightwatch DMR', file: 'nightwatchDMR.glb', thumb: '/store/weapons/nightwatchDMR.png', cost: 1200, type: 'hunterWeapon', slot: 'primaryGun', profile: 'primary', tracer: 0x9fd8ff, legacy: true },
  sidearmPistol: { id: 'sidearmPistol', name: 'Watchman 9mm', file: 'watchman9mm.glb', thumb: '/store/weapons/watchman9mm.png', cost: 0, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffe27a, legacy: true },
  revolver: { id: 'revolver', name: 'Outlaw Six-Shooter', file: 'outlawRevolver.glb', thumb: '/store/weapons/outlawRevolver.png', cost: 700, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xffc27a, legacy: true },
  viperSMG: { id: 'viperSMG', name: 'Cryptkeeper Auto', file: 'cryptkeeperAuto.glb', thumb: '/store/weapons/cryptkeeperAuto.png', cost: 600, type: 'hunterWeapon', slot: 'secondaryGun', profile: 'secondary', tracer: 0xa2ff9f, legacy: true },
  carbonCleaver: { id: 'carbonCleaver', name: 'Cursed Cleaver', file: 'cursedCleaver.glb', thumb: '/store/weapons/cursedCleaver.png', cost: 400, type: 'propWeapon', slot: 'primaryKnife', profile: 'melee', tracer: null, legacy: true },
  throwingKnife: { id: 'throwingKnife', name: 'Throwing Knife', file: 'Arrow.glb', thumb: '/store/weapons/Arrow.png', cost: 0, type: 'propWeapon', slot: 'secondaryKnife', profile: 'thrown', tracer: 0x9fd8ff, legacy: true },
  phantomDagger: { id: 'phantomDagger', name: 'Bloodfang Dagger', file: 'bloodfangDagger.glb', thumb: '/store/weapons/bloodfangDagger.png', cost: 650, type: 'propWeapon', slot: 'secondaryKnife', profile: 'thrown', tracer: 0xd8a2ff, legacy: true }
};

// Scan public/Skins/Weapons/ (for .glb models) and public/store/weapons/ (for .png thumbnails)
// and register every standard and legendary weapon in STORE_ITEMS so purchases and equips validate and save properly.
const WEAPONS_MODELS_DIR = path.join(__dirname, 'public', 'Skins', 'Weapons');
const WEAPONS_THUMBS_DIR = path.join(__dirname, 'public', 'store', 'weapons');

function formatWeaponDisplayName(id) {
  if (!id || typeof id !== 'string') return '';
  let clean = id.replace(/^.*[\\\/]/, '').replace(/\.glb$/i, '');
  if (clean.toLowerCase().startsWith('l.')) {
    clean = clean.slice(2);
  }
  const key = clean.toLowerCase();
  const map = {
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
  if (map[key]) return map[key];

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

function getWeaponSpecs(id) {
  const isLegendary = id.startsWith('l.');
  const s = isLegendary ? id.slice(2) : id;
  const lower = s.toLowerCase();

  // Legendary weapons (high-tier pricing)
  if (id === 'l.arcSidearm') return { slot: 'secondaryGun', type: 'hunterWeapon', profile: 'secondary', tracer: 0xffd700, cost: 2200 };
  if (id === 'l.volt9Auto') return { slot: 'secondaryGun', type: 'hunterWeapon', profile: 'secondary', tracer: 0xffd700, cost: 2400 };
  if (id === 'l.photonRipper') return { slot: 'primaryKnife', type: 'propWeapon', profile: 'melee', tracer: null, cost: 2500 };
  if (id === 'l.voidLance') return { slot: 'secondaryKnife', type: 'propWeapon', profile: 'thrown', tracer: 0xcc66ff, cost: 2600 };
  if (id === 'l.eclipseRifle') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0xffd700, cost: 2500 };
  if (id === 'l.spectreXCarbine') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0xffd700, cost: 2500 };
  if (id === 'l.ionStriker') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0x66ccff, cost: 2600 };
  if (id === 'l.nova7Blaster') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0xff6600, cost: 2700 };
  if (id === 'l.vanguardPulseAR') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0xffd700, cost: 2750 };
  if (id === 'l.hyperionMK2') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0xffd700, cost: 2800 };
  if (id === 'l.railghostX1') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0x00ffff, cost: 3000 };
  if (id === 'l.plasmaMortar') return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0x00ffcc, cost: 2800 };
  if (id === 'l.novaFrag') return { slot: 'secondaryKnife', type: 'propWeapon', profile: 'thrown', tracer: 0xff9900, cost: 2500 };
  if (isLegendary) return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0xffd700, cost: 2500 };

  // Standard knives & melee (Prop weapons: knives, daggers, cleavers, shivs, katana, machete, axe, baseball bat, crowbar, sickle, sledge hammer, wrench)
  if (lower.includes('dagger') || lower.includes('blade') || lower.includes('cleaver') ||
    lower.includes('shiv') || lower.includes('jaw') || lower.includes('crusher') ||
    lower.includes('pry') || lower.includes('harvester') || lower.includes('cracker') ||
    lower.includes('ripper') || lower.includes('edge') || lower.includes('fang') || lower.includes('carver') ||
    lower.includes('katana') || lower.includes('machete') || lower.includes('axe') || lower.includes('bat') ||
    lower.includes('crowbar') || lower.includes('sickle') || lower.includes('hammer') || lower.includes('wrench')) {
    const costMap = {
      bloodfangDagger: 600, bonecrusher: 750, cursedCleaver: 700, fieldBlade: 0,
      ghostblade: 850, grimHarvester: 950, ironPry: 450, marshCarver: 650,
      rustyJaw: 500, rustyShiv: 400, shadowFang: 800, skullcracker: 750,
      slaughterhouseCleaver: 850, timberRipper: 700, trackersEdge: 650
    };
    return { slot: 'primaryKnife', type: 'propWeapon', profile: 'melee', tracer: null, cost: costMap[id] !== undefined ? costMap[id] : 600 };
  }

  // Standard secondary guns (pistols / revolvers / sidearms)
  if (lower.includes('pistol') || lower.includes('revolver') || lower.includes('judge') ||
    lower.includes('rider') || lower.includes('45') || lower.includes('9mm')) {
    const costMap = {
      ammopistol: 500, ironJudge44: 750, nightshadePistol: 650, outlawRevolver: 700,
      paleRider: 800, shadow45: 600, watchman9mm: 550
    };
    return { slot: 'secondaryGun', type: 'hunterWeapon', profile: 'secondary', tracer: 0xffc27a, cost: costMap[id] !== undefined ? costMap[id] : 600 };
  }

  // Standard primary guns (rifles / shotguns / snipers / SMGs / bows / crossbows)
  const costMap = {
    alleySweeper: 800, ammoshotgun: 700, ammosniper: 950, Arrow: 500, blackoutAR: 850,
    breacher12G: 800, cryptkeeperAuto: 900, duskbreakerAR: 850, graveyardPump: 750,
    hellhoundMK3: 950, hollowPointMK4: 900, militiaCarbine: 800, nightwatchDMR: 900,
    pulseShredderX9: 850, Quiver: 600, reapersEye: 1000, rustbolt308: 850,
    silentStalker: 750, whisperingRecurve: 800, widowmaker: 950, wraithLongshot: 1100
  };
  return { slot: 'primaryGun', type: 'hunterWeapon', profile: 'primary', tracer: 0xffe27a, cost: costMap[id] !== undefined ? costMap[id] : 800 };
}

function scanAndRegisterWeapons() {
  try {
    if (fs.existsSync(WEAPONS_MODELS_DIR)) {
      const glbFiles = fs.readdirSync(WEAPONS_MODELS_DIR).filter(f => f.toLowerCase().endsWith('.glb'));
      const thumbFiles = fs.existsSync(WEAPONS_THUMBS_DIR) ? fs.readdirSync(WEAPONS_THUMBS_DIR) : [];
      const thumbMap = new Map();
      for (const tf of thumbFiles) {
        thumbMap.set(tf.toLowerCase(), tf);
      }

      let standardCount = 0;
      let legendaryCount = 0;

      for (const file of glbFiles) {
        const id = file.replace(/\.glb$/i, '');
        const isLegendary = id.startsWith('l.');
        const specs = getWeaponSpecs(id);
        const name = formatWeaponDisplayName(id);

        const expectedThumb = `${id.toLowerCase()}.png`;
        const matchedThumb = thumbMap.get(expectedThumb) || `${id}.png`;
        const thumbUrl = `/store/weapons/${matchedThumb}`;

        const cost = (specs && specs.cost !== undefined) ? specs.cost : 800;

        if (!STORE_ITEMS[id]) {
          STORE_ITEMS[id] = {
            id,
            name,
            file,
            thumb: thumbUrl,
            cost,
            price: cost,
            type: specs.type,
            slot: specs.slot,
            profile: specs.profile,
            tracer: specs.tracer,
            isLegendary
          };
        } else {
          STORE_ITEMS[id].file = file;
          STORE_ITEMS[id].name = name;
          STORE_ITEMS[id].thumb = thumbUrl;
          if (isLegendary) STORE_ITEMS[id].isLegendary = true;
          if (STORE_ITEMS[id].cost === undefined) STORE_ITEMS[id].cost = cost;
          STORE_ITEMS[id].price = (STORE_ITEMS[id].price !== undefined) ? STORE_ITEMS[id].price : STORE_ITEMS[id].cost;
          if (specs.type) STORE_ITEMS[id].type = specs.type;
          if (specs.slot) STORE_ITEMS[id].slot = specs.slot;
          if (specs.profile) STORE_ITEMS[id].profile = specs.profile;
          if (specs.tracer !== undefined) STORE_ITEMS[id].tracer = specs.tracer;
        }

        if (isLegendary) {
          legendaryCount++;
        } else {
          standardCount++;
        }
      }

      console.log(`[server] Registered ${standardCount} standard and ${legendaryCount} legendary weapons (${glbFiles.length} total) from public/Skins/Weapons/ with zero errors`);
    }
  } catch (err) {
    console.error('[server] Error scanning weapons:', err);
  }
}
scanAndRegisterWeapons();

// Guarantee every item in STORE_ITEMS defines both cost and price
for (const item of Object.values(STORE_ITEMS)) {
  if (item && typeof item === 'object') {
    if (item.price === undefined && item.cost !== undefined) item.price = item.cost;
    if (item.cost === undefined && item.price !== undefined) item.cost = item.price;
  }
}

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

function cleanItemId(rawId) {
  if (!rawId) return null;
  if (typeof rawId === 'object') {
    rawId = rawId.itemId || rawId.id || rawId.weaponId || rawId.skinId || rawId.item || rawId.file || rawId.name || rawId.model || null;
  }
  if (!rawId || typeof rawId !== 'string') return null;
  let s = rawId.trim().split('?')[0].split('#')[0];
  const parts = s.split(/[\/\\]/);
  s = parts[parts.length - 1];
  return s.replace(/\.(glb|png|jpg|jpeg|webp)$/i, '').trim();
}

function normalizeLookupKey(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase()
    .split('?')[0].split('#')[0]
    .split(/[\/\\]/).pop()
    .replace(/\.(glb|png|jpg|jpeg|webp)$/i, '')
    .replace(/^l\./, '')
    .replace(/[\s\-_.]/g, '');
}

function findStoreItem(rawId) {
  if (!rawId) return null;
  if (typeof rawId === 'object') {
    rawId = rawId.itemId || rawId.id || rawId.weaponId || rawId.skinId || rawId.item || rawId.file || rawId.name || rawId.model || null;
  }
  if (!rawId || typeof rawId !== 'string') return null;
  rawId = rawId.trim();

  // 1. Direct key match
  if (STORE_ITEMS[rawId]) return STORE_ITEMS[rawId];

  // 2. Cleaned id match
  const clean = cleanItemId(rawId) || rawId;
  if (STORE_ITEMS[clean]) return STORE_ITEMS[clean];
  if (!clean.startsWith('l.') && STORE_ITEMS['l.' + clean]) return STORE_ITEMS['l.' + clean];
  if (clean.startsWith('l.') && STORE_ITEMS[clean.slice(2)]) return STORE_ITEMS[clean.slice(2)];

  // 3. Normalized / case-insensitive search
  const norm = normalizeLookupKey(rawId);
  if (!norm) return null;

  const isLegInput = clean.toLowerCase().startsWith('l.') || rawId.toLowerCase().startsWith('l.');

  for (const [key, item] of Object.entries(STORE_ITEMS)) {
    const isLegItem = key.startsWith('l.') || (item && item.isLegendary);
    if (isLegInput && !isLegItem) continue; // if caller explicitly requested legendary, prefer legendary
    if (normalizeLookupKey(key) === norm) return item;
    if (item.file && normalizeLookupKey(item.file) === norm) return item;
    if (item.name && normalizeLookupKey(item.name) === norm) return item;
    if (item.id && normalizeLookupKey(item.id) === norm) return item;
  }

  // Fallback: match without requiring legendary filter
  for (const [key, item] of Object.entries(STORE_ITEMS)) {
    if (normalizeLookupKey(key) === norm) return item;
    if (item.file && normalizeLookupKey(item.file) === norm) return item;
    if (item.name && normalizeLookupKey(item.name) === norm) return item;
    if (item.id && normalizeLookupKey(item.id) === norm) return item;
  }

  return null;
}

function itemForId(itemId) {
  return findStoreItem(itemId);
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

  // If source carries a valid equipped skin, ensure it is preserved in inventory
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const eq = (source.loadout && source.loadout.equippedSkin) || source.equippedSkin;
    if (typeof eq === 'string' && STORE_ITEMS[eq] && STORE_ITEMS[eq].type === 'skin') {
      set.add(eq);
    }
  }

  // Resolve the single starter this account owns.
  let keep = preferredStarter;
  if (!keep && source && typeof source === 'object' && !Array.isArray(source)) {
    if (source.gender === 'female') keep = FEMALE_STARTER_ID;
    else if (source.gender === 'male') keep = MALE_STARTER_ID;
    else {
      const eq = (source.loadout && source.loadout.equippedSkin) || source.equippedSkin;
      if (typeof eq === 'string' && STARTER_SKIN_IDS.includes(eq)) keep = eq;
    }
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
    if (slot === 'equippedSkin') {
      // In server.js, NEVER overwrite a player's equippedSkin with the default Male/Female skin
      // unless equippedSkin is genuinely empty/null or explicitly set to default.
      if (STORE_ITEMS[finalWanted] && STORE_ITEMS[finalWanted].type === 'skin' && finalWanted !== 'default') {
        normalized[slot] = finalWanted;
        owned.add(finalWanted);
      } else {
        normalized[slot] = fallbackFor(slot);
      }
    } else {
      normalized[slot] = (STORE_ITEMS[finalWanted] && owned.has(finalWanted)) ? finalWanted : fallbackFor(slot);
    }
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
  let gender = (doc && typeof doc.gender === 'string') ? doc.gender.toLowerCase() : null;
  let genderLocked = !!(doc && doc.genderLocked);
  if (gender !== 'male' && gender !== 'female') gender = null;
  if (!gender && doc) {
    const starterId = (doc.loadout && doc.loadout.equippedSkin) || doc.equippedSkin;
    if (starterId === FEMALE_STARTER_ID) { gender = 'female'; }
    else if (starterId === MALE_STARTER_ID) { gender = 'male'; }
    else if (Array.isArray(doc.inventory)) {
      if (doc.inventory.includes(FEMALE_STARTER_ID) && !doc.inventory.includes(MALE_STARTER_ID)) gender = 'female';
      else if (doc.inventory.includes(MALE_STARTER_ID) && !doc.inventory.includes(FEMALE_STARTER_ID)) gender = 'male';
    }
  }
  return {
    coins: (doc && typeof doc.coins === 'number') ? doc.coins : 0,
    inventory,
    loadout,
    // Top-level mirror kept in the document for older clients / tools:
    equippedSkin: loadout.equippedSkin,
    isRegistered: !!(doc && doc.isRegistered),
    username: (doc && doc.username) || null,
    gender,
    genderLocked
  };
}

// The document shape created for brand-new accounts.
// chosenStarterInput can be gender string, skin id, or object containing gender.
function buildDefaultPlayerDoc(playerId, chosenStarterInput, isExplicit = false) {
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
  const resolvedGender = chosenId === FEMALE_STARTER_ID ? 'female' : 'male';
  const hasGenderChoice = isExplicit || !!chosenStarterInput;
  return {
    _id: playerId,
    coins: 0,
    inventory: Array.from(inventorySet),
    loadout,
    equippedSkin: chosenId,
    gender: hasGenderChoice ? resolvedGender : null,
    genderLocked: hasGenderChoice,
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
  const defaultDoc = buildDefaultPlayerDoc(playerId, chosenId, !!chosenStarterInput);
  await dbPlayers.updateOne(
    { _id: playerId },
    { $setOnInsert: defaultDoc },
    { upsert: true }
  );
}

// Writes a normalized wallet back to the database (lazy schema migration).
function persistNormalizedWallet(playerId, parsed) {
  if (!dbPlayers || !playerId || !parsed) return Promise.resolve();
  const updateFields = {
    coins: parsed.coins,
    inventory: parsed.inventory,
    loadout: parsed.loadout,
    equippedSkin: parsed.equippedSkin
  };
  if (parsed.gender) updateFields.gender = parsed.gender;
  if (typeof parsed.genderLocked === 'boolean') updateFields.genderLocked = parsed.genderLocked;
  return dbPlayers.updateOne(
    { _id: playerId },
    {
      $set: updateFields
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
  const coins = player.coins || 0;
  const ownedSkins = inventory.filter(id => STORE_ITEMS[id] && STORE_ITEMS[id].type === 'skin');
  const ownedWeapons = inventory.filter(id => STORE_ITEMS[id] && STORE_ITEMS[id].type !== 'skin');
  socket.emit('walletUpdate', {
    coins,
    inventory,
    ownedSkins,
    ownedWeapons,
    ownedItems: inventory,
    loadout,
    // Mirror of loadout.equippedSkin for legacy client logic:
    equippedSkin: loadout.equippedSkin,
    equippedItems: loadout,
    isRegistered: !!player.isRegistered,
    username: player.username || null,
    displayName: player.displayName || accountDisplayName(player, player.playerId),
    gender: player.gender || null,
    genderLocked: !!player.genderLocked
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

const DEFAULT_HUNTER_FOG_DISTANCE = 550;
const DEFAULT_PROP_FOG_DISTANCE = 200;

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

  const code = isPrivate ? roomName.slice('private_'.length) : null;
  const privateRoom = code ? privateRooms.get(code) : null;
  const hunterFogDistance = (privateRoom && privateRoom.hunterFogDistance) || DEFAULT_HUNTER_FOG_DISTANCE;
  const propFogDistance = (privateRoom && privateRoom.propFogDistance) || DEFAULT_PROP_FOG_DISTANCE;

  const rs = {
    state: 'waiting',
    timeLeft: isPrivate ? durationSec : GLOBAL_LOBBY_SECONDS,
    timeLimit: durationSec,
    originalDuration: durationSec,
    zoneId: zone.id,
    hostId: isPrivate ? hostId : null,
    resetTimeout: null,
    intermissionSeconds: INTERMISSION_SECONDS,
    hunterFogDistance,
    propFogDistance
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
function resetPlayerHealState(player) {
  if (!player) return;
  player.lastDamagedAt = 0;
  player.lastAttackedAt = 0;
  player.isPropHealing = false;
  player.isPassiveHealing = false;
  player.healCooldownUntil = 0;
  player.healStartedAt = 0;
  player.healEndTime = 0;
}
function movePlayerToLobby(player, index) {
  const spawn = lobbySpawn(index); player.x = spawn.x; player.z = spawn.z; player.y = PLAYER_EYE_LEVEL;
  player.role = 'waiting'; player.alive = true; player.isProp = false; player.propId = null;
  player.health = PROP_MAX_HEALTH; player.hp = PROP_MAX_HEALTH; player.npcStrikes = 0; player.disguiseBrokenAt = 0;
  resetPlayerHealState(player);
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
    player.hp = player.health;
    player.npcStrikes = 0;
    player.disguiseBrokenAt = 0;
    resetPlayerHealState(player);

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
    state: rs.state,
    hunterFogDistance: rs.hunterFogDistance || DEFAULT_HUNTER_FOG_DISTANCE,
    propFogDistance: rs.propFogDistance || DEFAULT_PROP_FOG_DISTANCE
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
    state: rs.state,
    hunterFogDistance: rs.hunterFogDistance || DEFAULT_HUNTER_FOG_DISTANCE,
    propFogDistance: rs.propFogDistance || DEFAULT_PROP_FOG_DISTANCE
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
  const item = itemForId(resolved);
  return item ? item.id : (cleanItemId(resolved) || DEFAULT_SKIN_ID);
}

function publicPlayerPayload(player, id) {
  if (!player) return player;
  // Shallow copy so mutating the wire packet never touches the live player.
  const packet = Object.assign({}, player);
  if (id && !packet.id) packet.id = id;
  const equippedSkin = safeEquippedSkinId(player);
  packet.loadout = Object.assign(
    {},
    (player.loadout && typeof player.loadout === 'object') ? player.loadout : DEFAULT_LOADOUT,
    { equippedSkin }
  );
  // Top-level mirrors so client logic can always read it directly.
  packet.equippedSkin = equippedSkin;
  packet.skinId = equippedSkin;
  packet.username = player.username || player.displayName || 'Survivor';
  packet.role = player.role || 'waiting';
  packet.x = typeof player.x === 'number' ? player.x : 0;
  packet.y = typeof player.y === 'number' ? player.y : PLAYER_EYE_LEVEL;
  packet.z = typeof player.z === 'number' ? player.z : 0;
  packet.position = { x: packet.x, y: packet.y, z: packet.z };
  packet.rotation = (typeof player.rotation === 'number') ? player.rotation : ((typeof player.yaw === 'number') ? player.yaw : 0);
  packet.yaw = packet.rotation;
  packet.propType = player.propId || player.propType || null;
  packet.propId = player.propId || null;
  packet.isProp = !!player.isProp;
  packet.equippedWeapon = (packet.loadout && (packet.loadout.primaryGun || packet.loadout.equippedWeapon)) || 'standardGun';
  packet.alive = player.alive !== false;
  packet.isMoving = !!player.isMoving;

  const now = Date.now();
  const currentHealth = typeof player.health === 'number' ? player.health : (player.role === 'hunter' ? HUNTER_MAX_HEALTH : PROP_MAX_HEALTH);
  const roundedHealth = Math.round(currentHealth * 10) / 10;
  packet.health = roundedHealth;
  packet.hp = roundedHealth;
  packet.maxHp = player.role === 'hunter' ? HUNTER_MAX_HEALTH : PROP_MAX_HEALTH;
  packet.isHealing = player.role === 'prop' ? !!player.isPropHealing : !!player.isPassiveHealing;
  packet.isPropHealing = !!player.isPropHealing;
  packet.isPassiveHealing = !!player.isPassiveHealing;
  packet.healCooldownRemaining = (player.healCooldownUntil && player.healCooldownUntil > now)
    ? Math.max(0, Math.ceil((player.healCooldownUntil - now) / 1000))
    : 0;

  return packet;
}

function getRoomPlayers(roomName) {
  const roomPlayers = {};
  for (const [id, player] of Object.entries(players)) {
    if (player.roomName === roomName) {
      if (!player.id) player.id = id;
      roomPlayers[id] = publicPlayerPayload(player, id);
    }
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
  const roomPlayers = getRoomPlayers(roomName);
  const payload = { players: roomPlayers, npcs: serializeNPCs(), lootDrops };
  for (const [id, pl] of Object.entries(roomPlayers)) {
    if (!payload[id]) payload[id] = pl;
  }
  return payload;
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

const HUNTER_PASSIVE_HEAL_RATE = 6; // +6 HP/sec
const HUNTER_PASSIVE_HEAL_DELAY_MS = 2000; // 2000ms delay after taking damage or attacking
const PROP_ACTIVE_HEAL_RATE = 4; // +4 HP/sec
const PROP_ACTIVE_HEAL_DURATION_MS = 6000; // up to 6 seconds
const PROP_ACTIVE_HEAL_COOLDOWN_MS = 18000; // 18 seconds cooldown

const WEAPON_PROFILES = {
  primary: { name: 'Primary', damage: 25, ammo: 5, fireRateMs: 800 },
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
    equippedSkin: DEFAULT_LOADOUT.equippedSkin,
    gender: null,
    genderLocked: false
  };
}

function getWallet(socketId) {
  if (!wallets[socketId]) wallets[socketId] = defaultWallet();
  return wallets[socketId];
}

function applyWalletToPlayer(player, socketId) {
  const w = getWallet(socketId);
  player.coins = w.coins;
  // If player or wallet carries an active non-starter equippedSkin, preserve it across wallet refresh!
  const currentSkin = (player && (player.equippedSkin || (player.loadout && player.loadout.equippedSkin)))
    || (w && (w.equippedSkin || (w.loadout && w.loadout.equippedSkin)));
  if (currentSkin && STORE_ITEMS[currentSkin] && STORE_ITEMS[currentSkin].type === 'skin' && currentSkin !== 'default') {
    if (!w.inventory.includes(currentSkin)) w.inventory.push(currentSkin);
    if (!w.loadout) w.loadout = Object.assign({}, DEFAULT_LOADOUT);
    w.loadout.equippedSkin = currentSkin;
    w.equippedSkin = currentSkin;
  }
  player.inventory = normalizeInventory(w); // wallet object → keeps a single starter
  // Phase 3: the full five-slot loadout travels with the player object, so
  // every spawn (join, match start, respawn) automatically materialises the
  // player's equipped skin + weapon models.
  player.loadout = normalizeLoadout(w.loadout, player.inventory, player.equippedSkin);
  player.equippedSkin = player.loadout.equippedSkin; // legacy mirror for old client code
  player.isRegistered = w.isRegistered || false;
  player.username = w.username || null;
  player.displayName = player.isRegistered ? player.username : guestDisplayName(player.playerId);
  player.gender = w.gender || null;
  player.genderLocked = !!w.genderLocked;
}

function syncWalletFromPlayer(player, socketId) {
  const currentSkin = player.equippedSkin || (player.loadout && player.loadout.equippedSkin);
  const inventory = normalizeInventory(player); // player object → keeps a single starter
  if (currentSkin && STORE_ITEMS[currentSkin] && !inventory.includes(currentSkin)) {
    inventory.push(currentSkin);
  }
  const loadout = normalizeLoadout(player.loadout, inventory, currentSkin);
  wallets[socketId] = {
    coins: player.coins || 0,
    inventory,
    loadout,
    equippedSkin: loadout.equippedSkin,
    isRegistered: player.isRegistered || false,
    username: player.username || null,
    displayName: player.displayName || guestDisplayName(player.playerId),
    gender: player.gender || null,
    genderLocked: !!player.genderLocked
  };
}

// Snapshot of a wallet-ish object (live player OR in-memory wallet) in the
// shape the client expects for buyResult / equipResult payloads.
function walletPayloadFields(target) {
  const inventory = normalizeInventory(target); // target object → keeps a single starter
  const loadout = normalizeLoadout(target && target.loadout, inventory, target && target.equippedSkin);
  const coins = (target && target.coins) || 0;
  const ownedSkins = inventory.filter(id => STORE_ITEMS[id] && STORE_ITEMS[id].type === 'skin');
  const ownedWeapons = inventory.filter(id => STORE_ITEMS[id] && STORE_ITEMS[id].type !== 'skin');
  return {
    coins,
    inventory,
    ownedSkins,
    ownedWeapons,
    ownedItems: inventory,
    loadout,
    equippedSkin: loadout.equippedSkin,
    equippedItems: loadout,
    gender: (target && target.gender) || null,
    genderLocked: !!(target && target.genderLocked)
  };
}

// Applies a freshly-read parsed wallet onto a live target (player or wallet).
function applyParsedWallet(target, parsed) {
  target.coins = parsed.coins;
  target.inventory = parsed.inventory.slice();
  target.loadout = Object.assign({}, parsed.loadout);
  target.equippedSkin = parsed.loadout.equippedSkin;
  if (parsed.gender) target.gender = parsed.gender;
  if (typeof parsed.genderLocked === 'boolean') target.genderLocked = parsed.genderLocked;
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
          const liveSkin = players[socket.id] && safeEquippedSkinId(players[socket.id]);
          const hasExplicitSkin = liveSkin && STORE_ITEMS[liveSkin] && STORE_ITEMS[liveSkin].type === 'skin';
          const defaultDoc = buildDefaultPlayerDoc(playerId, hasExplicitSkin ? liveSkin : null, hasExplicitSkin);
          await dbPlayers.insertOne(defaultDoc).catch(() => { });
          doc = defaultDoc;
        }
        walletData = parseWalletDoc(doc);
        if (players[socket.id]) {
          const liveSkin = safeEquippedSkinId(players[socket.id]);
          if (liveSkin && STORE_ITEMS[liveSkin] && !STARTER_SKIN_IDS.includes(liveSkin)) {
            if (!walletData.inventory.includes(liveSkin)) walletData.inventory.push(liveSkin);
            if (!walletData.loadout) walletData.loadout = Object.assign({}, DEFAULT_LOADOUT);
            walletData.loadout.equippedSkin = liveSkin;
            walletData.equippedSkin = liveSkin;
          }
        }
        // Lazy migration: legacy docs (coins + inventory + top-level
        // equippedSkin) are upgraded to the full loadout schema on first read.
        if (!doc.loadout || !Array.isArray(doc.inventory) || doc.inventory.length !== walletData.inventory.length) {
          await persistNormalizedWallet(playerId, walletData);
        }
      } else {
        walletData = defaultWallet();
        if (players[socket.id]) {
          const liveSkin = safeEquippedSkinId(players[socket.id]);
          if (liveSkin && STORE_ITEMS[liveSkin] && !STARTER_SKIN_IDS.includes(liveSkin)) {
            if (!walletData.inventory.includes(liveSkin)) walletData.inventory.push(liveSkin);
            if (!walletData.loadout) walletData.loadout = Object.assign({}, DEFAULT_LOADOUT);
            walletData.loadout.equippedSkin = liveSkin;
            walletData.equippedSkin = liveSkin;
          }
        }
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

      const existingDoc = await dbPlayers.findOne({ _id: playerId });
      let registerGender = (existingDoc && existingDoc.gender) || null;
      let registerLocked = existingDoc ? !!existingDoc.genderLocked : false;

      if (!registerGender) {
        const payloadGender = (payload && (payload.gender || payload.starterGender));
        if (payloadGender === 'male' || payloadGender === 'female') {
          registerGender = payloadGender;
          registerLocked = true;
        } else {
          const res = resolveStarterId(payload);
          if (res === FEMALE_STARTER_ID) { registerGender = 'female'; registerLocked = true; }
          else if (res === MALE_STARTER_ID) { registerGender = 'male'; registerLocked = true; }
        }
      }
      const chosenStarterForRegister = registerGender === 'female' ? FEMALE_STARTER_ID : MALE_STARTER_ID;
      const updateSet = { username, password, isRegistered: true };
      if (!existingDoc || !existingDoc.genderLocked) {
        if (registerGender) {
          updateSet.gender = registerGender;
          updateSet.genderLocked = true;
          registerLocked = true;
        }
      }

      await dbPlayers.updateOne(
        { _id: playerId },
        {
          $set: updateSet,
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
            equippedSkin: chosenStarterForRegister,
            gender: registerGender,
            genderLocked: registerLocked
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
      ).catch(() => { });

      if (players[socket.id]) {
        players[socket.id].username = username;
        players[socket.id].isRegistered = true;
        players[socket.id].displayName = username;
        if (registerGender) players[socket.id].gender = registerGender;
        players[socket.id].genderLocked = registerLocked;
        if (players[socket.id].roomName) {
          io.to(players[socket.id].roomName).emit('stateUpdate', buildStateUpdatePayload(players[socket.id].roomName));
          broadcastLeaderboard(players[socket.id].roomName);
        }
      }
      if (wallets[socket.id]) {
        wallets[socket.id].username = username;
        wallets[socket.id].isRegistered = true;
        wallets[socket.id].displayName = username;
        if (registerGender) wallets[socket.id].gender = registerGender;
        wallets[socket.id].genderLocked = registerLocked;
      }

      socket.emit('registerResult', {
        ok: true,
        username,
        isRegistered: true,
        displayName: username,
        playerId,
        gender: registerGender,
        genderLocked: registerLocked
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
        isRegistered: true,
        gender: account.gender || null,
        genderLocked: !!account.genderLocked
      });
    } catch (e) {
      socket.emit('loginResult', { ok: false, message: 'Login failed.' });
    }
  });

  const handleJoinGame = async (data) => {
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
          // Ensure the chosen starter is in inventory
          if (!walletData.inventory.includes(chosenStarterId)) {
            walletData.inventory = normalizeInventory(walletData.inventory, chosenStarterId);
          }

          let activeSkin = (walletData.loadout && walletData.loadout.equippedSkin) || walletData.equippedSkin;

          // If client explicitly sent a valid skin, respect client's choice
          const incomingSkin = (data && (data.equippedSkin || data.skinId));
          const cleanItem = incomingSkin ? itemForId(incomingSkin) : null;
          const cleanIncoming = cleanItem ? cleanItem.id : cleanItemId(incomingSkin);
          if (cleanIncoming && STORE_ITEMS[cleanIncoming] && STORE_ITEMS[cleanIncoming].type === 'skin') {
            activeSkin = cleanIncoming;
            if (!walletData.inventory.includes(cleanIncoming)) walletData.inventory.push(cleanIncoming);
          }

          // Locked gender handling:
          if (walletData.genderLocked && walletData.gender) {
            const lockedStarter = walletData.gender === 'female' ? FEMALE_STARTER_ID : MALE_STARTER_ID;
            // If the active skin is a starter skin, it MUST be the locked starter skin
            if (STARTER_SKIN_IDS.includes(activeSkin)) {
              activeSkin = lockedStarter;
            }
          } else {
            // First time joining or not locked yet
            if (STARTER_SKIN_IDS.includes(activeSkin) && activeSkin !== chosenStarterId && !cleanIncoming) {
              activeSkin = chosenStarterId;
            }
            if (chosenStarterId && !walletData.genderLocked) {
              walletData.gender = chosenStarterId === FEMALE_STARTER_ID ? 'female' : 'male';
              walletData.genderLocked = true;
            }
          }

          // If activeSkin is invalid or empty, default to chosen starter
          if (!activeSkin || !STORE_ITEMS[activeSkin] || activeSkin === 'default') {
            activeSkin = chosenStarterId;
          }

          walletData.loadout.equippedSkin = activeSkin;
          walletData.equippedSkin = activeSkin;
          await persistNormalizedWallet(playerId, walletData);
        } else {
          let initialSkin = chosenStarterId;
          const incomingSkin = (data && (data.equippedSkin || data.skinId));
          const cleanItem = incomingSkin ? itemForId(incomingSkin) : null;
          const cleanIncoming = cleanItem ? cleanItem.id : (incomingSkin && typeof incomingSkin === 'string' ? cleanItemId(incomingSkin) : null);
          if (cleanIncoming && STORE_ITEMS[cleanIncoming] && STORE_ITEMS[cleanIncoming].type === 'skin') {
            initialSkin = cleanIncoming;
          }
          const hasGender = !!data.gender || !!data.starterSkin;
          const newDoc = buildDefaultPlayerDoc(playerId, chosenStarterId, hasGender);
          await dbPlayers.insertOne(newDoc).catch(() => { });
          walletData = parseWalletDoc(newDoc);
          if (cleanIncoming && !walletData.inventory.includes(cleanIncoming)) {
            walletData.inventory.push(cleanIncoming);
            walletData.loadout.equippedSkin = cleanIncoming;
            walletData.equippedSkin = cleanIncoming;
          }
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
        privateRooms.set(roomCode, {
          roomName,
          zoneId: zone.id,
          hunterFogDistance: DEFAULT_HUNTER_FOG_DISTANCE,
          propFogDistance: DEFAULT_PROP_FOG_DISTANCE
        });
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
      id: socket.id,
      x: spawnX,
      y: PLAYER_EYE_LEVEL,
      z: spawnZ,
      rotation: 0,
      yaw: 0,
      isMoving: false,
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
      hp: playerHealth,
      lastDamagedAt: 0,
      lastAttackedAt: 0,
      isPropHealing: false,
      isPassiveHealing: false,
      healCooldownUntil: 0,
      healEndTime: 0,
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

    const incomingSkin = (data && (data.equippedSkin || data.skinId));
    if (incomingSkin) {
      const item = itemForId(incomingSkin);
      const cleanId = item ? item.id : cleanItemId(incomingSkin);
      if (cleanId && STORE_ITEMS[cleanId] && STORE_ITEMS[cleanId].type === 'skin' && cleanId !== 'default') {
        players[socket.id].equippedSkin = cleanId;
        players[socket.id].skinId = cleanId;
        players[socket.id].loadout.equippedSkin = cleanId;
        if (!players[socket.id].inventory.includes(cleanId)) {
          players[socket.id].inventory.push(cleanId);
        }
        if (wallets[socket.id]) {
          wallets[socket.id].equippedSkin = cleanId;
          if (wallets[socket.id].loadout) wallets[socket.id].loadout.equippedSkin = cleanId;
          if (Array.isArray(wallets[socket.id].inventory) && !wallets[socket.id].inventory.includes(cleanId)) {
            wallets[socket.id].inventory.push(cleanId);
          }
        }
      }
    }

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
      matchState: roomState.state,
      hunterFogDistance: roomState.hunterFogDistance || DEFAULT_HUNTER_FOG_DISTANCE,
      propFogDistance: roomState.propFogDistance || DEFAULT_PROP_FOG_DISTANCE
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
      player: publicPlayerPayload(players[socket.id], socket.id)
    });
    socket.broadcast.to(roomName).emit('playerSkinUpdated', {
      id: socket.id,
      playerId: players[socket.id].playerId,
      equippedSkin: safeEquippedSkinId(players[socket.id]),
      skinId: safeEquippedSkinId(players[socket.id]),
      loadout: players[socket.id].loadout,
      player: publicPlayerPayload(players[socket.id], socket.id)
    });

    broadcastLeaderboard(roomName);
    sendRadarAfterStateChange();
  };

  socket.on('joinGame', handleJoinGame);
  socket.on('createRoom', (data) => handleJoinGame(Object.assign({ matchType: 'private', zone: 'oldCityCenter' }, (typeof data === 'object' && data) ? data : {})));
  socket.on('joinRoom', (data) => handleJoinGame(Object.assign({ matchType: 'private' }, (typeof data === 'string') ? { roomCode: data } : (data || {}))));

  socket.on('playerMove', (data) => {
    const player = players[socket.id];
    if (!player || !player.alive) return;
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

    const rot = (typeof data.rotation === 'number') ? data.rotation : ((typeof data.yaw === 'number') ? data.yaw : (player.rotation || 0));
    player.rotation = rot;
    player.yaw = rot;
    player.isMoving = !!data.isMoving;

    // Fast direct broadcast to all other clients in room for smooth real-time interpolation
    const movePacket = {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z,
      position: { x: player.x, y: player.y, z: player.z },
      rotation: player.rotation,
      yaw: player.rotation,
      isMoving: player.isMoving,
      role: player.role,
      isProp: !!player.isProp,
      propType: player.propId || null,
      equippedSkin: safeEquippedSkinId(player),
      skinId: safeEquippedSkinId(player),
      equippedWeapon: (player.loadout && (player.loadout.primaryGun || player.loadout.equippedWeapon)) || 'standardGun',
      alive: player.alive !== false
    };
    socket.to(player.roomName).emit('playerMoved', movePacket);

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
    io.to(player.roomName).emit('playerDisguised', {
      id: socket.id,
      isProp: !!player.isProp,
      propId: player.propId || null,
      propType: player.propId || null
    });
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
    player.lastAttackedAt = Date.now();
    player.isPassiveHealing = false;

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

    if (attacker.role === 'hunter') {
      attacker.lastAttackedAt = Date.now();
      attacker.isPassiveHealing = false;
    }

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
      target.hp = target.health;
      target.lastDamagedAt = Date.now();
      if (target.role === 'hunter') {
        target.isPassiveHealing = false;
      } else if (target.role === 'prop' && target.isPropHealing) {
        target.isPropHealing = false;
        target.healCooldownUntil = Date.now() + PROP_ACTIVE_HEAL_COOLDOWN_MS;
        io.to(id).emit('healInterrupted');
      }
      hitAny = true;

      if (target.health <= 0) {
        target.health = 0;
        target.hp = 0;
        target.alive = false;
        target.isProp = false;
        target.propId = null;
        resetPlayerHealState(target);
        killedSomething = true;

        attacker.score = (attacker.score || 0) + HUNTER_KILL_SCORE;
        attacker.coins = (attacker.coins || 0) + HUNTER_KILL_COINS;
        syncWalletFromPlayer(attacker, socket.id);
        if (dbPlayers && attacker.playerId) {
          dbPlayers.updateOne({ _id: attacker.playerId }, { $inc: { coins: HUNTER_KILL_COINS } }).catch(() => { });
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
            ).catch(() => { });
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

  function handlePropHealRequest(socketId) {
    const player = players[socketId];
    const roomState = player ? getRoomState(player.roomName) : null;
    if (!player || !roomState || roomState.state !== 'playing' || !player.alive) return;
    if (player.role !== 'prop') return;
    if (player.health >= PROP_MAX_HEALTH) return;
    if (player.isPropHealing) return;
    const now = Date.now();
    if (player.healCooldownUntil && now < player.healCooldownUntil) return;

    player.isPropHealing = true;
    player.healStartedAt = now;
    player.healEndTime = now + PROP_ACTIVE_HEAL_DURATION_MS;
    io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
  }

  socket.on('requestHeal', () => {
    handlePropHealRequest(socket.id);
  });

  socket.on('requestPropHeal', () => {
    handlePropHealRequest(socket.id);
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
    player.hp = PROP_MAX_HEALTH;
    player.npcStrikes = 0;
    player.disguiseBrokenAt = 0;
    resetPlayerHealState(player);

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

    if (data.hunterFogDistance != null) {
      const parsedHunter = Number.parseInt(data.hunterFogDistance, 10);
      if (!Number.isNaN(parsedHunter) && parsedHunter >= 150 && parsedHunter <= 3000) {
        rs.hunterFogDistance = parsedHunter;
      }
    }
    if (data.propFogDistance != null) {
      const parsedProp = Number.parseInt(data.propFogDistance, 10);
      if (!Number.isNaN(parsedProp) && parsedProp >= 50 && parsedProp <= 3000) {
        rs.propFogDistance = parsedProp;
      }
    }

    const code = roomName.slice('private_'.length);
    const privateRoom = privateRooms.get(code);
    if (privateRoom) {
      privateRoom.zoneId = zone.id;
      privateRoom.hunterFogDistance = rs.hunterFogDistance;
      privateRoom.propFogDistance = rs.propFogDistance;
    }

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
      timeLeft: rs.timeLeft,
      hunterFogDistance: rs.hunterFogDistance,
      propFogDistance: rs.propFogDistance
    });
    broadcastTimeUpdate(roomName);
  });

  async function handleStorePurchase(socket, payload, requiredType = null) {
    console.log('[buy-hit]', payload);
    const player = players[socket.id];
    const target = player || getWallet(socket.id);
    if (!target) return;

    let payloadPlayerId = null;
    const candidates = [];
    if (typeof payload === 'string') {
      candidates.push(payload);
    } else if (payload && typeof payload === 'object') {
      [payload.id, payload.itemId, payload.weaponId, payload.skinId, payload.item, payload.file, payload.name, payload.model].forEach(c => {
        if (c && typeof c === 'string') candidates.push(c);
      });
      payloadPlayerId = payload.playerId || null;
    }

    let item = null;
    for (const cand of candidates) {
      const trimmed = cand.trim();
      const clean = cleanItemId(trimmed) || trimmed;
      if (STORE_ITEMS[trimmed]) { item = STORE_ITEMS[trimmed]; break; }
      if (STORE_ITEMS[clean]) { item = STORE_ITEMS[clean]; break; }
      if (!clean.startsWith('l.') && STORE_ITEMS['l.' + clean]) { item = STORE_ITEMS['l.' + clean]; break; }
      if (clean.startsWith('l.') && STORE_ITEMS[clean.slice(2)]) { item = STORE_ITEMS[clean.slice(2)]; break; }

      // Check all 53 weapons and store items: exact match or case-insensitive ignoring .glb
      const candNorm = clean.replace(/\.glb$/i, '').toLowerCase();
      const candRawNorm = trimmed.replace(/\.glb$/i, '').toLowerCase();
      for (const [key, storeIt] of Object.entries(STORE_ITEMS)) {
        if (!storeIt) continue;
        const keyNorm = key.replace(/\.glb$/i, '').toLowerCase();
        const idNorm = (storeIt.id || '').replace(/\.glb$/i, '').toLowerCase();
        const fileNorm = (storeIt.file || '').replace(/\.glb$/i, '').toLowerCase();
        if (keyNorm === candNorm || keyNorm === candRawNorm ||
            idNorm === candNorm || idNorm === candRawNorm ||
            fileNorm === candNorm || fileNorm === candRawNorm) {
          item = storeIt;
          break;
        }
        const keyNoL = keyNorm.replace(/^l\./, '');
        const candNoL = candNorm.replace(/^l\./, '');
        if (keyNoL === candNoL) {
          item = storeIt;
          break;
        }
      }
      if (item) break;

      const found = findStoreItem(trimmed) || findStoreItem(clean);
      if (found) { item = found; break; }
    }

    const currentTargetCoins = (target && typeof target.coins === 'number') ? target.coins : 0;

    if (!item) {
      console.log('[buy-server]', payload, 'found: false', 'coinsBefore:', currentTargetCoins, 'coinsAfter:', currentTargetCoins);
      socket.emit('buyResult', Object.assign({
        ok: false,
        message: 'Unknown item.'
      }, walletPayloadFields(target)));
      return;
    }

    const itemPrice = (typeof item.price === 'number') ? item.price : ((typeof item.cost === 'number') ? item.cost : 0);

    if (itemPrice <= 0) {
      console.log('[buy-server]', payload, 'found:', !!item, 'coinsBefore:', currentTargetCoins, 'coinsAfter:', currentTargetCoins);
      socket.emit('buyResult', Object.assign({
        ok: false,
        message: item.type === 'skin' ? 'Starter skins are free — equip them instead.' : 'Default items are permanently owned — equip them instead.'
      }, walletPayloadFields(target)));
      return;
    }

    if (!Array.isArray(target.inventory)) target.inventory = DEFAULT_INVENTORY.slice();

    const playerId = payloadPlayerId ||
      target.playerId ||
      (player && player.playerId) ||
      (wallets[socket.id] && wallets[socket.id].playerId) ||
      null;

    if (playerId) {
      target.playerId = playerId;
      if (wallets[socket.id]) wallets[socket.id].playerId = playerId;
      if (player) player.playerId = playerId;
    }

    let currentCoins = (target && typeof target.coins === 'number') ? target.coins : 0;

    if (dbPlayers && playerId) {
      try {
        await ensurePlayerDoc(playerId);
        const existingDoc = await dbPlayers.findOne({ _id: playerId });
        if (existingDoc) {
          if (typeof existingDoc.coins === 'number') {
            currentCoins = Math.max(currentCoins, existingDoc.coins);
            target.coins = currentCoins;
          }
          if (Array.isArray(existingDoc.inventory) && (existingDoc.inventory.includes(item.id) || normalizeInventory(existingDoc.inventory).includes(item.id))) {
            target.inventory = normalizeInventory(existingDoc.inventory);
            console.log('[buy-server]', payload, 'found:', !!item, 'coinsBefore:', currentCoins, 'coinsAfter:', currentCoins);
            socket.emit('buyResult', Object.assign({ ok: false, message: 'Already owned.' }, walletPayloadFields(target)));
            emitWallet(socket, target);
            return;
          }
        }
      } catch (err) {
        console.error('[server] Error reading player doc for purchase:', err);
      }
    }

    const ownedAlready = normalizeInventory(target).includes(item.id) ||
      (Array.isArray(target.inventory) && target.inventory.includes(item.id));
    if (ownedAlready) {
      console.log('[buy-server]', payload, 'found:', !!item, 'coinsBefore:', currentCoins, 'coinsAfter:', currentCoins);
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Already owned.' }, walletPayloadFields(target)));
      return;
    }

    if (currentCoins < itemPrice) {
      console.log('[buy-server]', payload, 'found:', !!item, 'coinsBefore:', currentCoins, 'coinsAfter:', currentCoins);
      socket.emit('buyResult', Object.assign({ ok: false, message: 'Not enough coins.' }, walletPayloadFields(target)));
      return;
    }

    const before = currentCoins;
    const newCoins = currentCoins - itemPrice;
    const after = newCoins;

    target.coins = newCoins;
    if (!target.inventory.includes(item.id)) {
      target.inventory.push(item.id);
    }
    target.inventory = normalizeInventory(target);
    target.loadout = normalizeLoadout(target.loadout, target.inventory);
    target.equippedSkin = target.loadout.equippedSkin;

    const ownedWeapons = target.inventory.filter(id => STORE_ITEMS[id] && STORE_ITEMS[id].type !== 'skin');
    target.ownedWeapons = ownedWeapons;

    if (player) {
      player.coins = newCoins;
      player.inventory = target.inventory.slice();
      player.ownedWeapons = ownedWeapons.slice();
      player.loadout = Object.assign({}, target.loadout);
      player.equippedSkin = target.equippedSkin;
      syncWalletFromPlayer(player, socket.id);
    }
    if (wallets[socket.id]) {
      wallets[socket.id].coins = newCoins;
      wallets[socket.id].inventory = target.inventory.slice();
      wallets[socket.id].ownedWeapons = ownedWeapons.slice();
      wallets[socket.id].loadout = Object.assign({}, target.loadout);
      wallets[socket.id].equippedSkin = target.equippedSkin;
      if (playerId) wallets[socket.id].playerId = playerId;
    }

    if (dbPlayers && playerId) {
      try {
        await dbPlayers.updateOne(
          { _id: playerId },
          {
            $set: {
              coins: newCoins,
              inventory: target.inventory,
              ownedWeapons: ownedWeapons,
              loadout: target.loadout,
              equippedSkin: target.equippedSkin
            }
          },
          { upsert: true }
        );
      } catch (dbErr) {
        console.error('[server] MongoDB error during purchase save:', dbErr);
      }
    }

    console.log('[buy-server]', payload, 'found:', !!item, 'coinsBefore:', before, 'coinsAfter:', after);

    const payloadResult = Object.assign({
      ok: true,
      itemId: item.id
    }, walletPayloadFields(target));

    socket.emit('buyResult', payloadResult);
    emitWallet(socket, target);
  }

  socket.on('buyItem', async (payload) => {
    console.log('[buy-hit]', payload);
    await handleStorePurchase(socket, payload);
  });

  socket.on('storeBuy', async (payload) => {
    console.log('[buy-hit]', payload);
    await handleStorePurchase(socket, payload);
  });

  socket.on('equipItem', async (payload) => {
    const player = players[socket.id];
    const target = player || getWallet(socket.id);
    if (!target) return;

    let rawId = null;
    let payloadPlayerId = null;
    if (typeof payload === 'string') {
      rawId = payload;
    } else if (payload && typeof payload === 'object') {
      rawId = payload.itemId || payload.id || payload.weaponId || payload.skinId || payload.item || payload.file || payload.name || payload.model || null;
      payloadPlayerId = payload.playerId || null;
    }

    const clean = cleanItemId(rawId) || rawId;
    const item = findStoreItem(rawId) || findStoreItem(clean) || itemForId(clean) || itemForId(rawId);
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

    // Ownership gate: the item must already be in the inventory or be a free default item.
    const isFree = FREE_WEAPON_IDS.includes(item.id) || (typeof item.cost === 'number' && item.cost <= 0) || (typeof item.price === 'number' && item.price <= 0);
    const isOwned = isFree || normalizeInventory(target).includes(item.id) || (Array.isArray(target.inventory) && target.inventory.includes(item.id));
    if (!isOwned) {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Item not owned.' }, walletPayloadFields(target)));
      return;
    }

    const playerId = payloadPlayerId ||
      target.playerId ||
      (player && player.playerId) ||
      (wallets[socket.id] && wallets[socket.id].playerId) ||
      null;

    if (playerId) {
      target.playerId = playerId;
      if (wallets[socket.id]) wallets[socket.id].playerId = playerId;
      if (player) player.playerId = playerId;
    }

    if (dbPlayers && playerId) {
      try {
        await ensurePlayerDoc(playerId);
        const update = { [`loadout.${slot}`]: item.id };
        if (slot === 'equippedSkin') update.equippedSkin = item.id; // legacy mirror
        await dbPlayers.updateOne(
          { _id: playerId },
          { $set: update },
          { upsert: true }
        );
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
      if (item.type === 'skin' || slot === 'equippedSkin') {
        player.equippedSkin = item.id;
        if (player.loadout) player.loadout.equippedSkin = item.id;
        io.to(player.roomName).emit('playerSkinUpdated', {
          id: socket.id,
          playerId: player.playerId,
          equippedSkin: item.id,
          skinId: item.id,
          loadout: player.loadout,
          player: publicPlayerPayload(player, socket.id)
        });
      }
      io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    }
  });


  socket.on('setGender', async (payload) => {
    const rawGender = payload && typeof payload === 'object' ? (payload.gender || payload.starterGender) : payload;
    const requestedGender = typeof rawGender === 'string' ? rawGender.trim().toLowerCase() : null;
    if (requestedGender !== 'male' && requestedGender !== 'female') {
      socket.emit('genderResult', { ok: false, message: 'Invalid character gender.' });
      return;
    }
    const playerId = (payload && typeof payload === 'object' && payload.playerId) ||
      (players[socket.id] && players[socket.id].playerId) ||
      (wallets[socket.id] && wallets[socket.id].playerId);

    const target = players[socket.id] || wallets[socket.id] || getWallet(socket.id);
    const starterId = requestedGender === 'female' ? FEMALE_STARTER_ID : MALE_STARTER_ID;

    if (dbPlayers && playerId) {
      try {
        const doc = await dbPlayers.findOne({ _id: playerId });
        if (doc && doc.genderLocked) {
          if (doc.gender && doc.gender !== requestedGender) {
            socket.emit('genderResult', { ok: false, message: 'Character choice is permanently locked.', gender: doc.gender, genderLocked: true });
            return;
          }
          // Already locked to requestedGender
          socket.emit('genderResult', { ok: true, gender: doc.gender, genderLocked: true });
          return;
        }

        await ensurePlayerDoc(playerId, starterId);
        const updateRes = await dbPlayers.updateOne(
          { _id: playerId, $or: [{ genderLocked: { $ne: true } }, { gender: requestedGender }] },
          {
            $set: { gender: requestedGender, genderLocked: true },
            $addToSet: { inventory: starterId }
          }
        );
        if (updateRes.matchedCount === 0) {
          socket.emit('genderResult', { ok: false, message: 'Character choice is permanently locked.' });
          return;
        }
        const fresh = parseWalletDoc(await dbPlayers.findOne({ _id: playerId }));
        applyParsedWallet(target, fresh);
        target.gender = requestedGender;
        target.genderLocked = true;
        if (players[socket.id]) {
          players[socket.id].gender = requestedGender;
          players[socket.id].genderLocked = true;
        }
        emitWallet(socket, target);
        socket.emit('genderResult', { ok: true, gender: requestedGender, genderLocked: true });
      } catch (err) {
        socket.emit('genderResult', { ok: false, message: 'Database error locking character choice.' });
      }
    } else {
      if (target.genderLocked && target.gender && target.gender !== requestedGender) {
        socket.emit('genderResult', { ok: false, message: 'Character choice is permanently locked.', gender: target.gender, genderLocked: true });
        return;
      }
      target.gender = requestedGender;
      target.genderLocked = true;
      if (!target.inventory.includes(starterId)) target.inventory.push(starterId);
      if (players[socket.id]) {
        players[socket.id].gender = requestedGender;
        players[socket.id].genderLocked = true;
      }
      emitWallet(socket, target);
      socket.emit('genderResult', { ok: true, gender: requestedGender, genderLocked: true });
    }
  });

  socket.on('equipSkin', async (skinId) => {
    // Dedicated skin equip path required by the character skin system.
    // Validates ownership before updating loadout.equippedSkin.
    const player = players[socket.id];
    const target = player || wallets[socket.id];
    if (!target) return;

    // Accept either raw string id or object { skinId, id, equippedSkin, gender }
    let rawId = null;
    let requestedGender = null;
    if (typeof skinId === 'string') rawId = skinId;
    else if (skinId && typeof skinId === 'object') {
      rawId = skinId.skinId || skinId.id || skinId.equippedSkin || skinId.skin || null;
      if (typeof skinId.gender === 'string') {
        const g = skinId.gender.trim().toLowerCase();
        if (g === 'male' || g === 'female') requestedGender = g;
      }
    }

    const item = itemForId(rawId);
    if (!item || item.type !== 'skin') {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Unknown skin.' }, walletPayloadFields(target)));
      return;
    }

    if (!Array.isArray(target.inventory)) target.inventory = DEFAULT_INVENTORY.slice();

    // Starter skin identification
    const isStarter = STARTER_SKIN_IDS.includes(item.id) || (typeof item.cost === 'number' && item.cost <= 0) || (typeof item.price === 'number' && item.price <= 0);

    const playerId = (typeof skinId === 'object' && skinId && skinId.playerId) ||
      target.playerId ||
      (player && player.playerId) ||
      (wallets[socket.id] && wallets[socket.id].playerId) ||
      null;

    // Gender Lock enforcement: reject any attempt to switch gender once locked
    if (dbPlayers && playerId) {
      const existingDoc = await dbPlayers.findOne({ _id: playerId });
      if (existingDoc && existingDoc.genderLocked && existingDoc.gender) {
        const currentLockedGender = existingDoc.gender;
        if (requestedGender && requestedGender !== currentLockedGender) {
          socket.emit('equipResult', Object.assign({ ok: false, message: 'Character choice is permanently locked.' }, walletPayloadFields(target)));
          return;
        }
        if (isStarter) {
          const expectedStarter = currentLockedGender === 'female' ? FEMALE_STARTER_ID : MALE_STARTER_ID;
          if (item.id !== expectedStarter) {
            socket.emit('equipResult', Object.assign({ ok: false, message: 'Character choice is permanently locked.' }, walletPayloadFields(target)));
            return;
          }
        }
      }
    } else if (target && target.genderLocked && target.gender) {
      const currentLockedGender = target.gender;
      if (requestedGender && requestedGender !== currentLockedGender) {
        socket.emit('equipResult', Object.assign({ ok: false, message: 'Character choice is permanently locked.' }, walletPayloadFields(target)));
        return;
      }
      if (isStarter) {
        const expectedStarter = currentLockedGender === 'female' ? FEMALE_STARTER_ID : MALE_STARTER_ID;
        if (item.id !== expectedStarter) {
          socket.emit('equipResult', Object.assign({ ok: false, message: 'Character choice is permanently locked.' }, walletPayloadFields(target)));
          return;
        }
      }
    }

    // Ownership gate: must be a starter skin, free skin, or already owned in inventory
    const isOwned = isStarter || normalizeInventory(target).includes(item.id) || (Array.isArray(target.inventory) && target.inventory.includes(item.id));
    if (!isOwned) {
      socket.emit('equipResult', Object.assign({ ok: false, message: 'Skin not owned.' }, walletPayloadFields(target)));
      return;
    }

    if (dbPlayers && playerId) {
      try {
        await ensurePlayerDoc(playerId, item.id);
        const updateFields = { 'loadout.equippedSkin': item.id, equippedSkin: item.id };
        const chosenGender = requestedGender || (item.id === FEMALE_STARTER_ID ? 'female' : (item.id === MALE_STARTER_ID ? 'male' : null));
        if (chosenGender) {
          const doc = await dbPlayers.findOne({ _id: playerId });
          if (!doc || !doc.genderLocked) {
            updateFields.gender = chosenGender;
            updateFields.genderLocked = true;
          }
        }
        const updateOp = { $set: updateFields };
        if (isStarter) {
          updateOp.$addToSet = { inventory: item.id };
        }
        await dbPlayers.updateOne(
          { _id: playerId },
          updateOp,
          { upsert: true }
        );
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
      const chosenGender = requestedGender || (item.id === FEMALE_STARTER_ID ? 'female' : (item.id === MALE_STARTER_ID ? 'male' : null));
      if (chosenGender && !target.genderLocked) {
        target.gender = chosenGender;
        target.genderLocked = true;
      }
    }

    if (player) {
      player.equippedSkin = item.id;
      player.skinId = item.id;
      if (player.loadout) player.loadout.equippedSkin = item.id;
      syncWalletFromPlayer(player, socket.id);
    }

    socket.emit('equipResult', Object.assign({
      ok: true,
      itemId: item.id,
      slot: 'equippedSkin'
    }, walletPayloadFields(target)));
    emitWallet(socket, target);
    if (player && player.roomName) {
      player.equippedSkin = item.id;
      if (player.loadout) player.loadout.equippedSkin = item.id;
      io.to(player.roomName).emit('playerSkinUpdated', {
        id: socket.id,
        playerId: player.playerId,
        equippedSkin: item.id,
        skinId: item.id,
        loadout: player.loadout,
        player: publicPlayerPayload(player, socket.id)
      });
      io.to(player.roomName).emit('stateUpdate', buildStateUpdatePayload(player.roomName));
    }
  });

  socket.on('buySkin', async (payload) => {
    console.log('[buy-hit]', payload);
    await handleStorePurchase(socket, payload);
  });

  socket.on('leaveGame', () => {
    const player = players[socket.id];
    if (!player) return;

    const roomName = player.roomName;
    socket.leave(roomName);
    syncWalletFromPlayer(player, socket.id);
    if (dbPlayers && player.playerId) {
      persistNormalizedWallet(player.playerId, wallets[socket.id]).catch(() => { });
    }
    delete players[socket.id];
    reassignHostIfNeeded(roomName, socket.id);
    cleanupEmptyRoom(roomName);

    io.to(roomName).emit('playerLeft', socket.id);
    sendRadarAfterStateChange();
    broadcastLeaderboard(roomName);
    emitWallet(socket, wallets[socket.id]);
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const roomName = player.roomName;
      syncWalletFromPlayer(player, socket.id);
      if (dbPlayers && player.playerId) {
        persistNormalizedWallet(player.playerId, wallets[socket.id]).catch(() => { });
      }
      delete players[socket.id];
      delete wallets[socket.id];
      reassignHostIfNeeded(roomName, socket.id);
      cleanupEmptyRoom(roomName);

      io.to(roomName).emit('playerLeft', socket.id);
      sendRadarAfterStateChange();
      broadcastLeaderboard(roomName);
    } else {
      delete wallets[socket.id];
    }
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
  victim.hp = victim.health;
  victim.lastDamagedAt = Date.now();
  if (victim.role === 'hunter') {
    victim.isPassiveHealing = false;
  } else if (victim.role === 'prop' && victim.isPropHealing) {
    victim.isPropHealing = false;
    victim.healCooldownUntil = Date.now() + PROP_ACTIVE_HEAL_COOLDOWN_MS;
    if (hit.victimId && io && io.to) {
      io.to(hit.victimId).emit('healInterrupted');
    }
  }

  if (ctx.isKnife) {
    io.to(hit.victimId).emit('hit', { health: Math.max(0, victim.health) });

    if (victim.health <= 0) {
      victim.health = 0;
      victim.hp = 0;
      victim.alive = false;
      victim.isProp = false;
      victim.propId = null;
      victim.isPropHealing = false;
      victim.isPassiveHealing = false;
      victim.healCooldownUntil = 0;

      if (killer) {
        killer.score = (killer.score || 0) + HUNTER_KILL_SCORE;
        killer.coins = (killer.coins || 0) + HUNTER_KILL_COINS;
        syncWalletFromPlayer(killer, ctx.ownerId);
        if (dbPlayers && killer.playerId) {
          dbPlayers.updateOne({ _id: killer.playerId }, { $inc: { coins: HUNTER_KILL_COINS } }).catch(() => { });
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
    victim.hp = 0;
    victim.isPropHealing = false;
    victim.isPassiveHealing = false;
    victim.healCooldownUntil = 0;

    if (killer) {
      killer.score = (killer.score || 0) + HUNTER_KILL_SCORE;
      killer.coins = (killer.coins || 0) + HUNTER_KILL_COINS;
      syncWalletFromPlayer(killer, ctx.ownerId);
      if (dbPlayers && killer.playerId) {
        dbPlayers.updateOne({ _id: killer.playerId }, { $inc: { coins: HUNTER_KILL_COINS } }).catch(() => { });
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
    target.hp = target.health;
    target.lastDamagedAt = Date.now();
    if (target.role === 'hunter') {
      target.isPassiveHealing = false;
    } else if (target.role === 'prop' && target.isPropHealing) {
      target.isPropHealing = false;
      target.healCooldownUntil = Date.now() + PROP_ACTIVE_HEAL_COOLDOWN_MS;
      io.to(npc.targetId).emit('healInterrupted');
    }
    const lethal = target.npcStrikes >= 6 || target.health <= 0;

    npcDamageRooms.add(target.roomName);
    io.to(target.roomName).emit('npcAttack', { npcId: npc.id });

    if (lethal) {
      target.health = 0;
      target.hp = 0;
      target.alive = false;
      target.isProp = false;
      target.propId = null;
      target.npcStrikes = 0;
      resetPlayerHealState(target);

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
          ).catch(() => { });
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

function tickHealing(dt, now) {
  for (const player of Object.values(players)) {
    if (!player || !player.alive) {
      if (player) {
        player.isPropHealing = false;
        player.isPassiveHealing = false;
      }
      continue;
    }
    const rs = getRoomState(player.roomName);
    if (!rs || rs.state !== 'playing') {
      player.isPropHealing = false;
      player.isPassiveHealing = false;
      continue;
    }

    if (player.role === 'hunter') {
      const maxHp = HUNTER_MAX_HEALTH;
      const canPassiveHeal = player.health < maxHp &&
        (now - (player.lastDamagedAt || 0) >= HUNTER_PASSIVE_HEAL_DELAY_MS) &&
        (now - (player.lastAttackedAt || 0) >= HUNTER_PASSIVE_HEAL_DELAY_MS);

      if (canPassiveHeal) {
        player.isPassiveHealing = true;
        player.health = Math.min(maxHp, player.health + HUNTER_PASSIVE_HEAL_RATE * dt);
        player.hp = player.health;
      } else {
        player.isPassiveHealing = false;
      }
    } else if (player.role === 'prop') {
      const maxHp = PROP_MAX_HEALTH;
      if (player.isPropHealing) {
        const timeRemaining = Math.max(0, (player.healEndTime || now) - (now - dt * 1000));
        const effectiveDt = Math.min(dt, timeRemaining / 1000);
        player.health = Math.min(maxHp, player.health + PROP_ACTIVE_HEAL_RATE * effectiveDt);
        player.hp = player.health;

        if (player.health >= maxHp || now >= (player.healEndTime || 0)) {
          player.health = Math.min(maxHp, player.health);
          player.hp = player.health;
          player.isPropHealing = false;
          player.healCooldownUntil = now + PROP_ACTIVE_HEAL_COOLDOWN_MS;
        }
      }
    }
  }
}

let lastHealingTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - lastHealingTick) / 1000);
  lastHealingTick = now;

  tickHealing(dt, now);
  tickNPCs();
  tickLoot();

  const activeRooms = new Set();
  Object.values(players).forEach(p => {
    if (p.roomName) activeRooms.add(p.roomName);
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
        dbPlayers.updateOne({ _id: player.playerId }, { $inc: { coins: PROP_SURVIVAL_COINS } }).catch(() => { });
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