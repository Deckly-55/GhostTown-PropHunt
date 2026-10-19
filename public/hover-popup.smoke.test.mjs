// Smoke test for the real client.js hover popup against the real index.html.
// jsdom has no layout engine, so we synthesize geometry (rects/sizes) and
// then drive actual mouse events through the shipped code paths.
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const vc = new VirtualConsole(); // swallow jsdom noise (animate() loop etc.)
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  // no `resources` option: external <script src> tags (socket.io, CDN) are not fetched
});
const { window } = dom;

// --- minimal browser globals the module touches at import/start time ---
window.alert = () => {};
const handlers = new Map();
globalThis.io = () => ({
  on: (ev, cb) => handlers.set(ev, cb),
  emit: (ev, ...args) => { (window.__emits ||= []).push([ev, ...args]); }
});
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.navigator = window.navigator;
globalThis.requestAnimationFrame = (cb) => window.requestAnimationFrame(cb);
globalThis.cancelAnimationFrame = (h) => window.cancelAnimationFrame(h);
globalThis.location = window.location;
globalThis.addEventListener = window.addEventListener.bind(window);
globalThis.removeEventListener = window.removeEventListener.bind(window);
globalThis.devicePixelRatio = 1;
globalThis.self = window;
globalThis.matchMedia = window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
// Lenient fetch/Request so three's FileLoader (fountain.mp3, .glb maps) fails
// through its async onError path instead of throwing synchronously on relative URLs.
globalThis.Request = class { constructor(url, init) { this.url = String(url); this.method = (init && init.method) || 'GET'; this.headers = new Headers(); } };
globalThis.fetch = () => Promise.reject(new TypeError('offline test fetch'));
// Generic no-op WebAudio node (Proxy so any API three.js touches just works).
function audioNode() {
  const target = {
    connect() { return audioNode(); }, disconnect() {}, addEventListener() {}, removeEventListener() {},
    start() {}, stop() {},
    gain: { value: 1, setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; }, cancelScheduledValues() { return this; } },
    frequency: { value: 440, setValueAtTime() { return this; }, exponentialRampToValueAtTime() { return this; } }
  };
  return new Proxy(target, {
    get(t, p) { if (p in t) return t[p]; return () => audioNode(); },
    set(t, p, v) { t[p] = v; return true; }
  });
}
class FakeAudioContext {
  constructor() { this.destination = audioNode(); this.state = 'running'; this.sampleRate = 44100; this.listener = {
    positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 },
    forwardX: { value: 0 }, forwardY: { value: 0 }, forwardZ: { value: -1 },
    upX: { value: 0 }, upY: { value: 1 }, upZ: { value: 0 } }; }
  get currentTime() { return 0; }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createGain() { return audioNode(); }
  createPanner() { return audioNode(); }
  createBufferSource() { return audioNode(); }
  createAnalyser() { return audioNode(); }
  createDynamicsCompressor() { return audioNode(); }
  createBuffer(channels, length, rate) { return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => new Float32Array(length) }; }
}
globalThis.AudioContext = FakeAudioContext;
window.AudioContext = FakeAudioContext;
window.OscillatorNode = window.OscillatorNode || class {};
window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:stub');
window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});
// Canvas getContext stub: just enough WebGL for three's renderer to construct
// and survive a few headless animate() frames (all real drawing is a no-op).
window.HTMLCanvasElement.prototype.getContext = function () {
  if (this.__glStub) return this.__glStub;
  const base = {
    canvas: this,
    drawingBufferWidth: 1024,
    drawingBufferHeight: 768,
    getExtension: () => null,
    getParameter: () => 1024,
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getProgramParameter: () => true,
    getShaderParameter: () => true,
    getProgramInfoLog: () => '',
    getShaderInfoLog: () => '',
    getError: () => 0,
    getActiveInfo: () => ({ size: 4, type: 35664, name: 'u' }),
    isContextLost: () => false
  };
  this.__glStub = new Proxy(base, {
    get(t, p) { if (p in t) return t[p]; return () => undefined; },
    set(t, p, v) { t[p] = v; return true; }
  });
  return this.__glStub;
};

// --- synthetic layout ---------------------------------------------------
const VIEWPORT = { w: 1024, h: 768 };
const rects = new WeakMap(); // element -> {left, top, width, height}
function setRect(el, left, top, width, height) { rects.set(el, { left, top, width, height }); }
function rectFor(el) {
  const r = rects.get(el) || { left: 0, top: 0, width: 0, height: 0 };
  return { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height, width: r.width, height: r.height, x: r.left, y: r.top };
}
window.HTMLElement.prototype.getBoundingClientRect = function () { return rectFor(this); };
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get() { return (rects.get(this) || { width: 0 }).width; }, configurable: true });
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get() { return (rects.get(this) || { height: 0 }).height; }, configurable: true });
setRect(window.document.getElementById('characterHoverPreview'), 0, 0, 258, 380);
setRect(window.document.querySelector('.store-panel'), 22, 20, 980, 728);

// --- load the REAL module ------------------------------------------------
await import('./client.js');

// start() is async (awaits stubbed model loads) before attachSocketListeners()
// registers the socket handlers — wait for that without touching client code.
for (let i = 0; i < 200 && !handlers.has('walletUpdate'); i++) {
  await new Promise((r) => setTimeout(r, 10));
}
if (!handlers.has('walletUpdate')) throw new Error('client.js start() never reached attachSocketListeners()');

const doc = window.document;
const $ = (id) => doc.getElementById(id);
const fire = (ev, data) => { const h = handlers.get(ev); if (!h) throw new Error('no handler for ' + ev); h(data); };

// register + give coins so Shop lists populate
fire('walletUpdate', {
  isRegistered: true, username: 'tester', coins: 700,
  inventory: ['standardRifle', 'sidearmPistol', 'fieldBlade', 'throwingKnife', 'Casual_Character'],
  loadout: { equippedSkin: 'Casual_Character', primaryGun: 'standardRifle', secondaryGun: 'sidearmPistol', primaryKnife: 'fieldBlade', secondaryKnife: 'throwingKnife' }
});

// open the store through the real menu button
$('btn-skins').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
if (window.__emits?.some(([e]) => e === 'requestWallet') === false) { /* noop */ }

const shop = $('shopItems');
const cards = [...shop.querySelectorAll('.store-card')];
if (!cards.length) throw new Error('shop rendered no cards');
if ($('storeOverlay').classList.contains('hidden')) throw new Error('store did not open');

// place first three cards: A top-center (flips right), B far-right column (all sides fail → clamped), C owned check n/a
setRect(cards[0], 400, 120, 210, 220);
setRect(cards[1], 760, 400, 210, 220);
setRect(cards[2], 40, 500, 210, 220);

const popup = $('characterHoverPreview');
const panel = rectFor(doc.querySelector('.store-panel'));
const B = { left: panel.left + 10, top: panel.top + 10, right: panel.right - 10, bottom: panel.bottom - 10 };
const pop = () => rectFor(popup); // uses synthetic size; style carries position
const pos = () => ({ x: parseFloat(popup.style.left), y: parseFloat(popup.style.top) });
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok -', msg); };

const move = (el, type) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true }));

// 1. hover card 0 (Beach_Character) → popup shows above-or-flipped, populated
move(cards[0].querySelector('h3'), 'mouseover');
assert(popup.classList.contains('visible'), 'popup .visible on hover over card name');
assert(popup.getAttribute('aria-hidden') === 'false', 'aria-hidden false');
assert($('chpTitle').textContent === 'Beach Character', 'title populated from catalog');
assert($('chpRarity').textContent === 'Common', 'rarity label from cost 500 → Common, got: ' + $('chpRarity').textContent);
assert(popup.getAttribute('data-rarity') === 'common', 'data-rarity set for glow tinting');
assert($('chpTheme').textContent.includes('Sun-bleached'), 'theme desc includes stats blurb');
assert($('chpCost').textContent.includes('500 coins'), 'cost line shows coin price');
assert($('chpImage').getAttribute('src')?.includes('/images/skins/Beach_Character.png'), 'full-body png src set');
let p = pos();
// card0 has no room above (120 - 380 - 12 < 30) → right side: x = 610 + 12 = 622, y = 120 - 24 = 96
assert(p.x === 622 && p.y === 96, `flips right when no room above (x=${p.x}, y=${p.y})`);
assert(p.x >= B.left && p.y >= B.top && p.x + 258 <= B.right && p.y + 380 <= B.bottom, 'inside store-panel bounds');

// 2. move to card 1 (right column, far right, near bottom): all 4 candidates overflow panel → clamped fallback stays in bounds
move(cards[1], 'mouseover');
p = pos();
assert(popup.classList.contains('visible'), 'popup stays visible when switching cards');
assert($('chpTitle').textContent === 'Casual Female 2', 'repopulated for new card');
assert(p.x >= B.left && p.y >= B.top && p.x + 258 <= B.right && p.y + 380 <= B.bottom, `clamped into panel bounds even with no free side (x=${p.x}, y=${p.y})`);

// 3. hover owned-free card 2 (Farmer 600, not owned) — then test "need more coins" math: coins 700 ≥ 600 so just price
move(cards[2], 'mouseover');
assert($('chpTitle').textContent === 'Farmer', 'third card hover works (name/heading target)');
assert($('chpCost').textContent.includes('600 coins'), 'price shown for affordable item');
p = pos();
// card2 at left edge x=40: above fails? y=500-380-12=108 ≥30 and x center 145-129=16 < B.left(32) → above candidate x fails fits? x=16 < 32 → no. right: 250+12=262 ≥ 32, 262+258=520 ≤ 992, y=476, 476+380=856 > 738 → no. left: 40-258-12=-230 no. below: 720+12+380 no. → clamp above candidate: x→32, y→108
assert(p.x === 32 && p.y === 108, `left-edge card clamps horizontally instead of overflowing viewport (x=${p.x}, y=${p.y})`);

// 4. mouseleave hides
move(cards[2], 'mouseout');
assert(!popup.classList.contains('visible'), 'popup hidden on mouseleave');
assert(popup.getAttribute('aria-hidden') === 'true', 'aria-hidden restored');

// 5. re-anchor across re-render: hover card0, then wallet update rebuilds list (node replaced)
move(cards[0], 'mouseover');
assert(popup.classList.contains('visible'), 'visible before re-render');
fire('walletUpdate', { isRegistered: true, coins: 450, inventory: ['standardRifle', 'sidearmPistol', 'fieldBlade', 'throwingKnife', 'Casual_Character'], loadout: null || { equippedSkin: 'Casual_Character', primaryGun: 'standardRifle', secondaryGun: 'sidearmPistol', primaryKnife: 'fieldBlade', secondaryKnife: 'throwingKnife' } });
const cards2 = [...shop.querySelectorAll('.store-card')];
assert(cards2[0] !== cards[0], 'DOM nodes were actually replaced by re-render');
assert(popup.classList.contains('visible'), 'popup survives list re-render (re-anchored)');
assert($('chpCost').textContent.includes('50 more'), `price line refreshed with "need X more" after coins dropped (got: ${$('chpCost').textContent.trim()})`);

// 6. owned-item styling + tab switch hides
fire('walletUpdate', { isRegistered: true, coins: 4000, inventory: ['Beach_Character', 'standardRifle', 'sidearmPistol', 'fieldBlade', 'throwingKnife', 'Casual_Character'], loadout: { equippedSkin: 'Casual_Character', primaryGun: 'standardRifle', secondaryGun: 'sidearmPistol', primaryKnife: 'fieldBlade', secondaryKnife: 'throwingKnife' } });
$('storeTab-inventory').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const invCards = [...$('inventoryItems').querySelectorAll('.store-card')];
const beach = invCards.find((c) => c.dataset.item === 'Beach_Character');
setRect(beach, 400, 120, 210, 220);
move(beach, 'mouseover');
assert($('chpCost').classList.contains('state-owned') || $('chpCost').classList.contains('state-equipped'), 'owned/equipped state class on cost row in Inventory');
assert(/Owned|Equipped/.test($('chpCost').textContent), 'cost row shows ownership status');
$('storeTab-shop').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert(!popup.classList.contains('visible'), 'tab switch hides popup');

// 7. legendary tier check via King (1500 → epic? no: 1500 <= 1500 → Epic; Astronaut 3000 → Legendary)
const shopCards = [...shop.querySelectorAll('.store-card')];
const astronaut = shopCards.find((c) => c.dataset.item === 'Astronaut');
setRect(astronaut, 300, 400, 210, 220);
move(astronaut, 'mouseover');
assert($('chpRarity').textContent === 'Legendary', 'Astronaut (3000) → Legendary tier');
assert(popup.getAttribute('data-rarity') === 'legendary', 'legendary glow attribute');
move(astronaut, 'mouseout');

// 8. close store hides popup
move($('characterHoverPreview') ? doc.querySelector('#shopItems .store-card') : shop, 'mouseover');
$('storeCloseBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert(!popup.classList.contains('visible'), 'closeStore hides popup');
assert($('storeOverlay').classList.contains('hidden'), 'store closed');

// 9. swatch CSS contains the contain+padding fix and popup CSS present
const css = doc.querySelector('style')?.textContent || fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
assert(/\.store-swatch img\.item-preview-img\s*{[^}]*object-fit:\s*contain/s.test(css), 'card img uses object-fit: contain');
assert(/\.store-swatch\.sw-image\s*{/.test(css), '.sw-image taller framed slot present');
assert(/#characterHoverPreview\s*{[^}]*backdrop-filter/s.test(css), 'popup has blurred dark background');
assert(/#characterHoverPreview\.visible\s*{/.test(css), '.visible reveal state present');

console.log('---');
console.log(process.exitCode ? 'SMOKE TEST: FAILURES ABOVE' : 'SMOKE TEST: ALL PASS');
window.close();
process.exit(process.exitCode || 0);
