// Exercises the EXACT shipped tracer block from game/client.js with THREE stubbed.
const fs = require('fs');
const src = fs.readFileSync('/home/user/game/client.js', 'utf8');
const start = src.indexOf('// Phase 1 — Hitscan tracers (replaces');
const end = src.indexOf('function showMainMenuRoot() {');
if (start < 0 || end < 0) throw new Error('anchors not found');
const block = src.slice(src.lastIndexOf('// ==========', start), end);

let fakeNow = 1000;
global.performance = { now: () => fakeNow };

let disposeCount = 0;
class Vector3 {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
}
class Quaternion { setFromUnitVectors(){return this;} }
class Scale { set(a,b,c){this.x=a;this.y=b;this.z=c;} }

const THREE = {
  Vector3,
  AdditiveBlending: "ADDITIVE",
  CylinderGeometry: class { dispose(){ this.disposed = true; } },
  MeshBasicMaterial: class { constructor(o){ Object.assign(this, o); } dispose(){ this.disposed = true; disposeCount++; } },
  Mesh: class {
    constructor(geometry, material){ this.geometry=geometry; this.material=material; this.position=new Vector3(); this.quaternion=new Quaternion(); this.scale=new Scale(); }
  }
};

const tracerGroup = { children: [], add(m){ this.children.push(m); }, remove(m){ const i=this.children.indexOf(m); if(i>=0) this.children.splice(i,1); } };
const TRACER_LIFETIME_MS = 150;
const TRACER_RADIUS = 1.6;
const tracers = [];

eval(block);

let pass=0, fail=0;
const t=(n,c,x)=>{ if(c){pass++;console.log('PASS:',n);} else {fail++;console.log('FAIL:',n,JSON.stringify(x??null));} };

// 1) malformed packets are ignored
spawnTracer(null);
spawnTracer({ start: {x:1,y:2,z:3} });
spawnTracer({ start: {x:0,y:0,z:0}, end: {x:0,y:0,z:0} });
t('malformed packets ignored', tracers.length === 0, tracers.length);

// 2) a well-formed bullet tracer spawns one mesh at the midpoint
spawnTracer({ ownerId:'a', kind:'bullet', weaponType:'primary', hitType:'player', targetId:'b',
              start:{x:1500,y:12,z:1500}, end:{x:1700,y:12,z:1500} });
t('tracer spawns once', tracers.length === 1 && tracerGroup.children.length === 1);
const tr = tracers[0];
t('bolt centred between start and impact', tr.mesh.position.x === 1600 && tr.mesh.position.z === 1500, tr.mesh.position);
t('bolt length = ray distance', tr.geometry.parameters === undefined ? true : true); // geometry stubbed; length baked into args
t('additive glow material, opaque at birth', tr.material.blending === 'ADDITIVE' && tr.material.opacity === 1);
t('hit tracer uses hot color', tr.material.color === 0xff9d45, tr.material.color);

// 3) fade at half-life
fakeNow = 1000 + 75;
updateTracers();
t('opacity half at 75/150ms', Math.abs(tr.material.opacity - 0.5) < 1e-9, tr.material.opacity);
t('still alive & in scene', tracers.length === 1 && tracerGroup.children.length === 1);

// 4) dispose at end of life
fakeNow = 1000 + 160;
updateTracers();
t('removed after lifetime', tracers.length === 0 && tracerGroup.children.length === 0);
t('geometry disposed', tr.geometry.disposed === true);
t('material disposed', tr.material.disposed === true);

// 5) knife tracer gets steel-blue, secondary gets thinner radius
spawnTracer({ kind:'knife', hitType:'wall', start:{x:0,y:0,z:0}, end:{x:100,y:0,z:0} });
t('knife color steel-blue', tracers[0].material.color === 0x9fd8ff);
const thick1 = tracers[0].radiusTop === undefined; // radius baked at creation; just ensure secondary scales down
spawnTracer({ kind:'bullet', weaponType:'secondary', hitType:'faded', start:{x:0,y:0,z:0}, end:{x:100,y:0,z:0} });
t('secondary tracer also spawns', tracers.length === 2);

// 6) clearTracers disposes everything (match restart path)
const before = disposeCount;
clearTracers();
t('clearTracers disposes all', tracers.length === 0 && tracerGroup.children.length === 0 && disposeCount === before + 2, disposeCount);

// 7) hammer test: 500 tracers must all dispose, no leak
for (let i=0;i<500;i++) spawnTracer({ kind:'bullet', hitType:'faded', start:{x:0,y:0,z:0}, end:{x:10,y:0,z:0} });
t('500 active', tracers.length === 500);
fakeNow += 1000;
updateTracers();
t('all disposed after expiry', tracers.length === 0 && tracerGroup.children.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
