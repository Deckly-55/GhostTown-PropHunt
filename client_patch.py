from pathlib import Path
p=Path('/home/user/uploads/client.js'); s=p.read_text()
s=s.replace("const PLAYER_RADIUS = 15; // server collision radius (world units)", """const PLAYER_RADIUS = 15; // server collision radius (world units)
const ZONE_DEFINITIONS = {
  oldCityCenter: { id: 'oldCityCenter', name: 'The Old City Center', minX: 0, maxX: 3000, minZ: 0, maxZ: 3000 },
  historicRuralEdge: { id: 'historicRuralEdge', name: 'The Historic & Rural Edge', minX: 0, maxX: 3000, minZ: 3000, maxZ: 7000 },
  industrialWorkingDistrict: { id: 'industrialWorkingDistrict', name: 'The Industrial Working District', minX: 3000, maxX: 6000, minZ: 0, maxZ: 3000 },
  miningForgeHub: { id: 'miningForgeHub', name: 'The Mining & Forge Hub', minX: 6000, maxX: 9000, minZ: 0, maxZ: 7000 },
  massiveTransitCorridor: { id: 'massiveTransitCorridor', name: 'The Massive Transit Corridor', minX: 3000, maxX: 6000, minZ: 3000, maxZ: 7000 },
  giantSouthernBorder: { id: 'giantSouthernBorder', name: 'The Giant Southern Border', minX: 0, maxX: 9000, minZ: 7000, maxZ: 9000 }
};
let currentZone = ZONE_DEFINITIONS.oldCityCenter;
let zoneVisualGroup = null;""")
# insert functions before initThree
needle="function initThree() {"
func="""function createZoneVisuals(zone) {
  if (!scene) return;
  if (zoneVisualGroup) scene.remove(zoneVisualGroup);
  zoneVisualGroup = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const h = 180;
  const makeWall = (w, d, x, z) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); mesh.position.set(x, h / 2, z); zoneVisualGroup.add(mesh); };
  makeWall(zone.maxX - zone.minX, h, (zone.minX + zone.maxX) / 2, zone.minZ);
  makeWall(zone.maxX - zone.minX, h, (zone.minX + zone.maxX) / 2, zone.maxZ);
  const sideA = new THREE.Mesh(new THREE.PlaneGeometry(zone.maxZ - zone.minZ, h), material); sideA.position.set(zone.minX, h/2, (zone.minZ+zone.maxZ)/2); sideA.rotation.y = Math.PI/2; zoneVisualGroup.add(sideA);
  const sideB = sideA.clone(); sideB.position.x = zone.maxX; zoneVisualGroup.add(sideB);
  // Billboard sign: canvas texture, centered precisely over this district.
  const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 220;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='rgba(5,20,35,0.78)'; ctx.fillRect(10,10,1580,200); ctx.strokeStyle='#8ee8ff'; ctx.lineWidth=8; ctx.strokeRect(10,10,1580,200); ctx.fillStyle='#ffffff'; ctx.font='bold 72px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(zone.name,800,110);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sign.position.set((zone.minX+zone.maxX)/2, 260, (zone.minZ+zone.maxZ)/2); sign.scale.set(1400, 193, 1); zoneVisualGroup.add(sign);
  scene.add(zoneVisualGroup);
}

"""
s=s.replace(needle,func+needle)
# constrain bounds
s=s.replace("const minX = radius;\n  const maxX = worldWidth - radius;\n  const minZ = radius;\n  const maxZ = worldHeight - radius;", "const minX = currentZone.minX + radius;\n  const maxX = currentZone.maxX - radius;\n  const minZ = currentZone.minZ + radius;\n  const maxZ = currentZone.maxZ - radius;")
# init set zone and visuals after map assignment
s=s.replace("map = data.map || [];", "map = data.map || [];\n    currentZone = data.zone || (data.world && data.world.zones && data.world.zones.find(z => z.id === players[myId]?.zoneId)) || ZONE_DEFINITIONS.oldCityCenter;\n    createZoneVisuals(currentZone);")
p.write_text(s)
