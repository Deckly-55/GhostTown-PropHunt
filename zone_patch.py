from pathlib import Path
p=Path('/home/user/uploads/server.js'); s=p.read_text()
anchor="const RADAR_RANGE = 2100;"
config="""
// Quarantine districts. Coordinates are server X/Z (map objects use x/y, with y -> Z).
const ZONE_DEFINITIONS = {
  oldCityCenter: { id: 'oldCityCenter', name: 'The Old City Center', minX: 0, maxX: 3000, minZ: 0, maxZ: 3000 },
  historicRuralEdge: { id: 'historicRuralEdge', name: 'The Historic & Rural Edge', minX: 0, maxX: 3000, minZ: 3000, maxZ: 7000 },
  industrialWorkingDistrict: { id: 'industrialWorkingDistrict', name: 'The Industrial Working District', minX: 3000, maxX: 6000, minZ: 0, maxZ: 3000 },
  miningForgeHub: { id: 'miningForgeHub', name: 'The Mining & Forge Hub', minX: 6000, maxX: 9000, minZ: 0, maxZ: 7000 },
  massiveTransitCorridor: { id: 'massiveTransitCorridor', name: 'The Massive Transit Corridor', minX: 3000, maxX: 6000, minZ: 3000, maxZ: 7000 },
  giantSouthernBorder: { id: 'giantSouthernBorder', name: 'The Giant Southern Border', minX: 0, maxX: 9000, minZ: 7000, maxZ: 9000 }
};
const ZONES = Object.values(ZONE_DEFINITIONS);
const TEST_SPAWN_ZONE_ID = 'oldCityCenter';
function zoneForPoint(x, z) { return ZONES.find(zone => x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) || ZONE_DEFINITIONS.oldCityCenter; }
"""
s=s.replace(anchor,anchor+config)
# replace props generation and spawn funcs
s=s.replace("function generateProps() {", "function generateProps(zone = ZONE_DEFINITIONS.oldCityCenter) {")
s=s.replace("x = PROP_EDGE_PADDING + Math.random() * (WORLD_WIDTH - PROP_EDGE_PADDING * 2 - width);\n      y = PROP_EDGE_PADDING + Math.random() * (WORLD_HEIGHT - PROP_EDGE_PADDING * 2 - height);", "x = zone.minX + PROP_EDGE_PADDING + Math.random() * Math.max(1, zone.maxX - zone.minX - PROP_EDGE_PADDING * 2 - width);\n      y = zone.minZ + PROP_EDGE_PADDING + Math.random() * Math.max(1, zone.maxZ - zone.minZ - PROP_EDGE_PADDING * 2 - height);")
s=s.replace("function getValidSpawnPosition() {", "function getValidSpawnPosition(zone = ZONE_DEFINITIONS.oldCityCenter) {")
s=s.replace("x = padding + Math.random() * (WORLD_WIDTH - padding * 2);\n    z = padding + Math.random() * (WORLD_HEIGHT - padding * 2);", "x = zone.minX + padding + Math.random() * Math.max(1, zone.maxX - zone.minX - padding * 2);\n    z = zone.minZ + padding + Math.random() * Math.max(1, zone.maxZ - zone.minZ - padding * 2);")
s=s.replace("return { x: 200, z: 200 };", "return { x: zone.minX + 200, z: zone.minZ + 200 };")
s=s.replace("function constrainPosition(x, z, objects) {\n  const minX = PLAYER_RADIUS;\n  const maxX = WORLD_WIDTH - PLAYER_RADIUS;\n  const minZ = PLAYER_RADIUS;\n  const maxZ = WORLD_HEIGHT - PLAYER_RADIUS;", "function constrainPosition(x, z, objects, zone = ZONE_DEFINITIONS.oldCityCenter) {\n  const minX = zone.minX + PLAYER_RADIUS;\n  const maxX = zone.maxX - PLAYER_RADIUS;\n  const minZ = zone.minZ + PLAYER_RADIUS;\n  const maxZ = zone.maxZ - PLAYER_RADIUS;")
s=s.replace("const props = generateProps();", "const props = generateProps(ZONE_DEFINITIONS.oldCityCenter);")
s=s.replace("function randomSpawnPoint() {\n  return getValidSpawnPosition();\n}", "function randomSpawnPoint(zone = ZONE_DEFINITIONS.oldCityCenter) {\n  return getValidSpawnPosition(zone);\n}")
s=s.replace("const spawn = randomSpawnPoint();", "const activeZone = ZONE_DEFINITIONS[TEST_SPAWN_ZONE_ID];\n    const spawn = randomSpawnPoint(activeZone);")
s=s.replace("      z: spawn.z,          // planar depth", "      z: spawn.z,          // planar depth\n      zoneId: activeZone.id,")
s=s.replace("        height: WORLD_HEIGHT\n      }", "        height: WORLD_HEIGHT,\n        zones: ZONES\n      },\n      zone: activeZone")
s=s.replace("const constrained = constrainPosition(data.x, data.z, map);", "const zone = ZONE_DEFINITIONS[player.zoneId] || ZONE_DEFINITIONS.oldCityCenter;\n    const constrained = constrainPosition(data.x, data.z, map, zone);")
s=s.replace("const spawn = randomSpawnPoint();", "const zone = ZONE_DEFINITIONS[player.zoneId] || ZONE_DEFINITIONS.oldCityCenter;\n    const spawn = randomSpawnPoint(zone);",1) # beware first occurrence now? likely respawn occurrence due earlier exact changed
p.write_text(s)
