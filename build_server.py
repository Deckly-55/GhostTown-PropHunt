#!/usr/bin/env python3
"""
Transform the uploaded 4000x4000 PropHunt server.js into a 9000x9000 version:
  * World constants -> 9000x9000 with MAP_SCALE = 2.25
  * Prop constants scaled to the larger world
  * Map geometry rebuilt: scaled original town + new southern districts,
    rim fences/outskirts, and filler structures so the whole world is dense.
The original town object list is preserved verbatim as BASE_LAYOUT.
"""
import re

SRC = '/home/user/uploads/server.js'
DST = '/home/user/server.js'

src = open(SRC, encoding='utf-8').read()

# ---------------------------------------------------------------------------
# 1) World / disguise constants
# ---------------------------------------------------------------------------
old_consts = """const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 4000;

const DISGUISE_RADIUS = 50;"""

new_consts = """const WORLD_WIDTH = 9000;
const WORLD_HEIGHT = 9000;

// Scale factor applied to the original 4000x4000 Ghost Town layout so it fills
// the larger 9000x9000 world (9000 / 4000 = 2.25). The scaled town forms the
// "city center", and the new districts below cover every region it doesn't.
const MAP_SCALE = 2.25;

// Scaled up with the world (props are ~2.25x larger) so players can still
// disguise as them.
const DISGUISE_RADIUS = 120;"""

assert old_consts in src, "constants block not found"
src = src.replace(old_consts, new_consts, 1)

# ---------------------------------------------------------------------------
# 2) Prop constants
# ---------------------------------------------------------------------------
old_props = """const PROP_COLORS = ['#8B5A2B', '#6b7280', '#a0522d', '#5b7553', '#7a5c3e'];
const PROP_COUNT = 40;
const PROP_MIN_SIZE = 30;
const PROP_MAX_SIZE = 60;
const PROP_EDGE_PADDING = 100;"""

new_props = """const PROP_COLORS = ['#8B5A2B', '#6b7280', '#a0522d', '#5b7553', '#7a5c3e'];
// The world area grew ~5x, so the prop count scales with it and each prop is
// ~2.25x larger, keeping the same visual density and disguisability.
const PROP_COUNT = 200;
const PROP_MIN_SIZE = 70;
const PROP_MAX_SIZE = 140;
const PROP_EDGE_PADDING = 200;"""

assert old_props in src, "props block not found"
src = src.replace(old_props, new_props, 1)

# ---------------------------------------------------------------------------
# 3) Map geometry
# ---------------------------------------------------------------------------
start_marker = "// Ghost Town Map Geometry"
end_marker = "// Collision detection helper"
start = src.index(start_marker)
end = src.index(end_marker)

block = src[start:end]
array_body = block.split("const map = [", 1)[1].rsplit("];", 1)[0]

# Normalise indentation of the original object lines (keep comments)
lines = []
for raw in array_body.splitlines():
    stripped = raw.strip()
    if not stripped:
        continue
    if stripped.startswith("//"):
        lines.append("  " + stripped)
    else:
        lines.append("  " + stripped)

base_body = "\n".join(lines)

NEW_MAP = """// ============================================================================
// MAP GEOMETRY (built for the 9000x9000 world)
// ----------------------------------------------------------------------------
// The map is composed from three parts so the full world is filled with walls
// and glass buildings (no huge empty regions):
//   1. BASE_LAYOUT        – the original hand-crafted 4000x4000 Ghost Town,
//                           scaled by MAP_SCALE (2.25x) to form the city center.
//   2. SOUTHERN_DISTRICTS – new districts (Harbor & Docks, County Fairgrounds,
//                           Rail Yard & Foundry) drawn in world units across
//                           the bottom band of the map the scaled town misses.
//   3. RIM_AND_OUTSKIRTS  – world-perimeter fences, east-rim watchtowers and
//                           the southern farmland that frame the play space.
//   4. FILLER_STRUCTURES  – fountains, plazas, parks, shops, depots and yards
//                           that fill the open pockets between districts.
// ============================================================================

// --- 1. Original Ghost Town layout (defined in the 4000x4000 space) --------
const BASE_LAYOUT = [
""" + base_body + """
];

// --- 2. Southern districts (drawn in 9000x9000 world units) ----------------
const SOUTHERN_DISTRICTS = [
  // === HARBOR & DOCKS (South-West) ===
  { x: 120, y: 7150, width: 850, height: 260, type: 'wall' },
  { x: 120, y: 7150, width: 850, height: 18, type: 'glass' },
  { x: 120, y: 7392, width: 300, height: 18, type: 'glass' },
  { x: 80, y: 7480, width: 260, height: 14, type: 'wall' },
  { x: 1100, y: 7160, width: 520, height: 700, type: 'wall' },
  { x: 1100, y: 7160, width: 520, height: 20, type: 'glass' },
  { x: 1100, y: 7840, width: 180, height: 20, type: 'glass' },
  { x: 1440, y: 7840, width: 180, height: 20, type: 'glass' },
  { x: 1720, y: 7180, width: 600, height: 650, type: 'wall' },
  { x: 1720, y: 7180, width: 600, height: 20, type: 'glass' },
  { x: 1720, y: 7810, width: 200, height: 20, type: 'glass' },
  { x: 2120, y: 7810, width: 200, height: 20, type: 'glass' },
  { x: 2420, y: 7200, width: 480, height: 600, type: 'wall' },
  { x: 2420, y: 7200, width: 480, height: 20, type: 'glass' },
  { x: 2420, y: 7780, width: 160, height: 20, type: 'glass' },
  { x: 2740, y: 7780, width: 160, height: 20, type: 'glass' },
  { x: 300, y: 7550, width: 60, height: 60, type: 'wall' },
  { x: 390, y: 7590, width: 55, height: 55, type: 'wall' },
  { x: 330, y: 7640, width: 55, height: 55, type: 'wall' },
  { x: 700, y: 7530, width: 65, height: 60, type: 'wall' },
  { x: 780, y: 7570, width: 55, height: 60, type: 'wall' },
  { x: 720, y: 7650, width: 70, height: 55, type: 'wall' },
  { x: 970, y: 7550, width: 14, height: 140, type: 'wall' },
  { x: 1060, y: 7550, width: 14, height: 140, type: 'wall' },
  { x: 940, y: 7690, width: 160, height: 14, type: 'wall' },
  { x: 955, y: 7704, width: 130, height: 60, type: 'glass' },
  { x: 1180, y: 7950, width: 200, height: 130, type: 'wall' },
  { x: 1180, y: 7950, width: 200, height: 12, type: 'glass' },
  { x: 1420, y: 8000, width: 80, height: 80, type: 'wall' },
  { x: 3100, y: 7650, width: 70, height: 70, type: 'wall' },
  { x: 3115, y: 7665, width: 40, height: 40, type: 'glass' },
  { x: 3140, y: 7400, width: 14, height: 180, type: 'wall' },
  { x: 1150, y: 8100, width: 120, height: 60, type: 'wall' },
  { x: 1320, y: 8140, width: 110, height: 55, type: 'wall' },
  { x: 1500, y: 8100, width: 130, height: 60, type: 'wall' },
  { x: 1800, y: 8100, width: 120, height: 60, type: 'wall' },
  { x: 1970, y: 8150, width: 110, height: 55, type: 'wall' },
  { x: 2130, y: 8090, width: 130, height: 60, type: 'wall' },
  { x: 2500, y: 8100, width: 120, height: 60, type: 'wall' },
  { x: 2670, y: 8140, width: 110, height: 55, type: 'wall' },
  { x: 2830, y: 8090, width: 130, height: 60, type: 'wall' },
  { x: 1500, y: 8400, width: 110, height: 55, type: 'wall' },
  { x: 1660, y: 8440, width: 110, height: 55, type: 'wall' },
  { x: 1820, y: 8400, width: 110, height: 55, type: 'wall' },
  { x: 2400, y: 8400, width: 110, height: 55, type: 'wall' },
  { x: 2560, y: 8440, width: 110, height: 55, type: 'wall' },
  { x: 2720, y: 8400, width: 110, height: 55, type: 'wall' },
  { x: 80, y: 8860, width: 3500, height: 14, type: 'wall' },

  // === COUNTY FAIRGROUNDS (South-Center) ===
  { x: 3600, y: 7160, width: 2200, height: 14, type: 'wall' },
  { x: 3600, y: 8826, width: 2200, height: 14, type: 'wall' },
  { x: 3600, y: 7160, width: 14, height: 1680, type: 'wall' },
  { x: 5786, y: 7160, width: 14, height: 1680, type: 'wall' },
  { x: 3850, y: 7350, width: 460, height: 380, type: 'wall' },
  { x: 3850, y: 7350, width: 460, height: 16, type: 'glass' },
  { x: 3930, y: 7714, width: 300, height: 16, type: 'glass' },
  { x: 4450, y: 7350, width: 90, height: 70, type: 'wall' },
  { x: 4590, y: 7360, width: 90, height: 70, type: 'wall' },
  { x: 4730, y: 7340, width: 90, height: 70, type: 'wall' },
  { x: 4450, y: 7520, width: 90, height: 70, type: 'wall' },
  { x: 4590, y: 7530, width: 90, height: 70, type: 'wall' },
  { x: 4730, y: 7510, width: 90, height: 70, type: 'wall' },
  { x: 5120, y: 7400, width: 40, height: 40, type: 'wall' },
  { x: 5040, y: 7300, width: 14, height: 240, type: 'wall' },
  { x: 5226, y: 7300, width: 14, height: 240, type: 'wall' },
  { x: 5040, y: 7380, width: 200, height: 14, type: 'wall' },
  { x: 5040, y: 7546, width: 200, height: 14, type: 'wall' },
  { x: 4000, y: 7950, width: 800, height: 30, type: 'wall' },
  { x: 4000, y: 8010, width: 800, height: 30, type: 'wall' },
  { x: 4000, y: 8070, width: 800, height: 30, type: 'wall' },
  { x: 5200, y: 7900, width: 300, height: 120, type: 'wall' },
  { x: 5210, y: 7910, width: 280, height: 100, type: 'glass' },
  { x: 3850, y: 8000, width: 55, height: 55, type: 'wall' },
  { x: 3930, y: 8020, width: 55, height: 55, type: 'wall' },
  { x: 4400, y: 8400, width: 60, height: 60, type: 'wall' },
  { x: 4520, y: 8440, width: 60, height: 60, type: 'wall' },
  { x: 4640, y: 8400, width: 60, height: 60, type: 'wall' },
  { x: 4900, y: 8450, width: 60, height: 60, type: 'wall' },
  { x: 5050, y: 8410, width: 60, height: 60, type: 'wall' },
  { x: 5200, y: 8450, width: 60, height: 60, type: 'wall' },

  // === RAIL YARD & SOUTH FOUNDRY (South-East) ===
  { x: 5900, y: 7180, width: 700, height: 620, type: 'wall' },
  { x: 5900, y: 7180, width: 700, height: 20, type: 'glass' },
  { x: 5900, y: 7780, width: 240, height: 20, type: 'glass' },
  { x: 6360, y: 7780, width: 240, height: 20, type: 'glass' },
  { x: 6700, y: 7160, width: 820, height: 560, type: 'wall' },
  { x: 6700, y: 7160, width: 820, height: 20, type: 'glass' },
  { x: 6700, y: 7700, width: 280, height: 20, type: 'glass' },
  { x: 7240, y: 7700, width: 280, height: 20, type: 'glass' },
  { x: 7680, y: 7600, width: 500, height: 420, type: 'wall' },
  { x: 7680, y: 7600, width: 500, height: 18, type: 'glass' },
  { x: 7760, y: 8002, width: 160, height: 18, type: 'glass' },
  { x: 7940, y: 8002, width: 160, height: 18, type: 'glass' },
  { x: 7760, y: 7280, width: 26, height: 200, type: 'wall' },
  { x: 7900, y: 7280, width: 26, height: 200, type: 'wall' },
  { x: 8040, y: 7280, width: 26, height: 200, type: 'wall' },
  { x: 8300, y: 7300, width: 16, height: 220, type: 'wall' },
  { x: 8420, y: 7300, width: 16, height: 220, type: 'wall' },
  { x: 8280, y: 7480, width: 180, height: 130, type: 'wall' },
  { x: 8300, y: 7500, width: 140, height: 90, type: 'glass' },
  { x: 8560, y: 7200, width: 70, height: 160, type: 'wall' },
  { x: 8640, y: 7200, width: 70, height: 160, type: 'wall' },
  { x: 5900, y: 8480, width: 3000, height: 14, type: 'wall' },
  { x: 5900, y: 8660, width: 3000, height: 14, type: 'wall' },
  { x: 6100, y: 8550, width: 150, height: 40, type: 'wall' },
  { x: 6290, y: 8560, width: 120, height: 34, type: 'wall' },
  { x: 6450, y: 8560, width: 120, height: 34, type: 'wall' },
  { x: 6610, y: 8560, width: 120, height: 34, type: 'wall' },
  { x: 6770, y: 8560, width: 120, height: 34, type: 'wall' },
  { x: 5950, y: 8100, width: 110, height: 60, type: 'wall' },
  { x: 6110, y: 8140, width: 110, height: 60, type: 'wall' },
  { x: 6270, y: 8100, width: 110, height: 60, type: 'wall' },
  { x: 6750, y: 8100, width: 110, height: 60, type: 'wall' },
  { x: 6910, y: 8140, width: 110, height: 60, type: 'wall' },
  { x: 7070, y: 8100, width: 110, height: 60, type: 'wall' },
  { x: 7350, y: 8200, width: 120, height: 60, type: 'wall' },
  { x: 7520, y: 8240, width: 120, height: 60, type: 'wall' },
  { x: 8250, y: 8200, width: 120, height: 60, type: 'wall' },
  { x: 8420, y: 8240, width: 120, height: 60, type: 'wall' },
  { x: 8600, y: 8200, width: 120, height: 60, type: 'wall' },
  { x: 8770, y: 8280, width: 110, height: 60, type: 'wall' },
];

// --- 3. Rim fences, outskirts and farmland (world units) -------------------
const RIM_AND_OUTSKIRTS = [
  // === WORLD PERIMETER FENCES ===
  { x: 80, y: 60, width: 8840, height: 16, type: 'wall' },
  { x: 80, y: 8924, width: 8840, height: 16, type: 'wall' },
  { x: 60, y: 80, width: 16, height: 8840, type: 'wall' },
  { x: 8924, y: 80, width: 16, height: 8840, type: 'wall' },

  // === EAST RIM ROAD WATCHTOWERS ===
  { x: 8800, y: 900, width: 80, height: 80, type: 'wall' },
  { x: 8800, y: 2200, width: 90, height: 70, type: 'wall' },
  { x: 8800, y: 3600, width: 70, height: 90, type: 'wall' },
  { x: 8800, y: 5200, width: 90, height: 70, type: 'wall' },
  { x: 8800, y: 6500, width: 80, height: 80, type: 'wall' },

  // === OUTSKIRTS FARMLAND (South-West) ===
  { x: 350, y: 5650, width: 280, height: 210, type: 'wall' },
  { x: 350, y: 5650, width: 280, height: 14, type: 'glass' },
  { x: 350, y: 5846, width: 100, height: 14, type: 'glass' },
  { x: 850, y: 5600, width: 340, height: 250, type: 'wall' },
  { x: 850, y: 5600, width: 340, height: 16, type: 'glass' },
  { x: 850, y: 5834, width: 120, height: 16, type: 'glass' },
  { x: 1400, y: 5750, width: 30, height: 50, type: 'wall' },
  { x: 1430, y: 5750, width: 30, height: 50, type: 'wall' },
  { x: 1390, y: 5800, width: 100, height: 60, type: 'wall' },
  { x: 1400, y: 5810, width: 80, height: 40, type: 'glass' },
  { x: 1650, y: 5600, width: 90, height: 200, type: 'wall' },
  { x: 1790, y: 5620, width: 220, height: 170, type: 'wall' },
  { x: 1790, y: 5620, width: 220, height: 14, type: 'glass' },
  { x: 2200, y: 5750, width: 90, height: 70, type: 'wall' },
  { x: 2330, y: 5790, width: 90, height: 70, type: 'wall' },
  { x: 2460, y: 5750, width: 90, height: 70, type: 'wall' },
  { x: 2200, y: 5920, width: 90, height: 70, type: 'wall' },
  { x: 2330, y: 5960, width: 90, height: 70, type: 'wall' },
  { x: 2460, y: 5920, width: 90, height: 70, type: 'wall' },
  { x: 2800, y: 5600, width: 300, height: 240, type: 'wall' },
  { x: 2800, y: 5600, width: 300, height: 14, type: 'glass' },
  { x: 2800, y: 5826, width: 100, height: 14, type: 'glass' },
  { x: 3250, y: 5650, width: 80, height: 180, type: 'wall' },
  { x: 3370, y: 5670, width: 200, height: 160, type: 'wall' },
  { x: 3370, y: 5670, width: 200, height: 14, type: 'glass' },
  { x: 3800, y: 5750, width: 30, height: 50, type: 'wall' },
  { x: 3830, y: 5750, width: 30, height: 50, type: 'wall' },
  { x: 3790, y: 5800, width: 100, height: 60, type: 'wall' },
  { x: 3800, y: 5810, width: 80, height: 40, type: 'glass' },
  { x: 150, y: 6350, width: 4000, height: 12, type: 'wall' },
  { x: 150, y: 6650, width: 4000, height: 12, type: 'wall' },
  { x: 150, y: 6950, width: 4000, height: 12, type: 'wall' },
];

// --- 4. Filler structures (open pockets in the scaled town) ----------------
const FILLER_STRUCTURES = [
  // === FOUNTAINS (major intersections) ===
  { x: 2250, y: 2250, width: 60, height: 60, type: 'wall' },
  { x: 2260, y: 2260, width: 40, height: 40, type: 'glass' },
  { x: 2800, y: 1100, width: 60, height: 60, type: 'wall' },
  { x: 2810, y: 1110, width: 40, height: 40, type: 'glass' },
  { x: 4050, y: 3150, width: 60, height: 60, type: 'wall' },
  { x: 4060, y: 3160, width: 40, height: 40, type: 'glass' },
  { x: 5400, y: 2025, width: 60, height: 60, type: 'wall' },
  { x: 5410, y: 2035, width: 40, height: 40, type: 'glass' },
  { x: 675, y: 3262, width: 60, height: 60, type: 'wall' },
  { x: 685, y: 3272, width: 40, height: 40, type: 'glass' },
  { x: 1870, y: 1280, width: 60, height: 60, type: 'wall' },
  { x: 1880, y: 1290, width: 40, height: 40, type: 'glass' },

  // === NEIGHBORHOOD POND & PARK ===
  { x: 680, y: 1800, width: 120, height: 80, type: 'wall' },
  { x: 820, y: 1840, width: 70, height: 55, type: 'wall' },
  { x: 730, y: 1930, width: 55, height: 55, type: 'wall' },

  // === CAFÉ ROW / SMALL SHOPS ===
  { x: 1700, y: 1350, width: 160, height: 130, type: 'wall' },
  { x: 1700, y: 1350, width: 160, height: 12, type: 'glass' },
  { x: 1920, y: 1400, width: 150, height: 120, type: 'wall' },
  { x: 1920, y: 1400, width: 150, height: 12, type: 'glass' },
  { x: 2130, y: 1360, width: 160, height: 130, type: 'wall' },
  { x: 2130, y: 1360, width: 160, height: 12, type: 'glass' },
  { x: 2350, y: 1420, width: 150, height: 120, type: 'wall' },
  { x: 2350, y: 1420, width: 150, height: 12, type: 'glass' },

  // === COMMUNITY GARDEN (between the alleys, west of the big shop building) ===
  { x: 2810, y: 1350, width: 60, height: 60, type: 'wall' },
  { x: 2890, y: 1350, width: 60, height: 60, type: 'wall' },
  { x: 2970, y: 1350, width: 60, height: 60, type: 'wall' },
  { x: 2810, y: 1500, width: 60, height: 60, type: 'wall' },
  { x: 2890, y: 1500, width: 60, height: 60, type: 'wall' },
  { x: 2970, y: 1500, width: 60, height: 60, type: 'wall' },
  { x: 2810, y: 1650, width: 60, height: 60, type: 'wall' },
  { x: 2890, y: 1650, width: 60, height: 60, type: 'wall' },
  { x: 2970, y: 1650, width: 60, height: 60, type: 'wall' },
  { x: 2810, y: 1800, width: 60, height: 60, type: 'wall' },
  { x: 2890, y: 1800, width: 60, height: 60, type: 'wall' },
  { x: 2970, y: 1800, width: 60, height: 60, type: 'wall' },
  { x: 2810, y: 1950, width: 60, height: 60, type: 'wall' },
  { x: 2890, y: 1950, width: 60, height: 60, type: 'wall' },
  { x: 2970, y: 1950, width: 60, height: 60, type: 'wall' },
  { x: 2810, y: 2100, width: 60, height: 60, type: 'wall' },
  { x: 2890, y: 2100, width: 60, height: 60, type: 'wall' },
  { x: 2970, y: 2100, width: 60, height: 60, type: 'wall' },

  // === GAZEBO (Market Square) ===
  { x: 2800, y: 3450, width: 90, height: 90, type: 'wall' },
  { x: 2810, y: 3460, width: 70, height: 70, type: 'glass' },

  // === PLAYGROUND ===
  { x: 850, y: 3050, width: 70, height: 70, type: 'wall' },
  { x: 970, y: 3030, width: 70, height: 70, type: 'wall' },
  { x: 1090, y: 3060, width: 70, height: 70, type: 'wall' },
  { x: 880, y: 3220, width: 300, height: 14, type: 'wall' },
  { x: 880, y: 3350, width: 300, height: 14, type: 'wall' },

  // === CHAPEL ===
  { x: 1750, y: 3900, width: 220, height: 180, type: 'wall' },
  { x: 1750, y: 3900, width: 220, height: 14, type: 'glass' },
  { x: 1750, y: 4066, width: 80, height: 14, type: 'glass' },

  // === LIVESTOCK PENS ===
  { x: 1750, y: 4900, width: 300, height: 14, type: 'wall' },
  { x: 1750, y: 4900, width: 14, height: 260, type: 'wall' },
  { x: 2036, y: 4900, width: 14, height: 260, type: 'wall' },
  { x: 1750, y: 5146, width: 300, height: 14, type: 'wall' },
  { x: 2150, y: 4950, width: 220, height: 14, type: 'wall' },
  { x: 2150, y: 4950, width: 14, height: 220, type: 'wall' },
  { x: 2356, y: 4950, width: 14, height: 220, type: 'wall' },
  { x: 2150, y: 5156, width: 220, height: 14, type: 'wall' },

  // === CONSTRUCTION SITE & TOWER CRANE ===
  { x: 3150, y: 4500, width: 500, height: 240, type: 'wall' },
  { x: 3150, y: 4500, width: 500, height: 14, type: 'glass' },
  { x: 3150, y: 4726, width: 170, height: 14, type: 'glass' },
  { x: 3500, y: 4900, width: 300, height: 14, type: 'wall' },
  { x: 3300, y: 5000, width: 14, height: 160, type: 'wall' },
  { x: 3400, y: 5000, width: 14, height: 160, type: 'wall' },
  { x: 3260, y: 5160, width: 180, height: 14, type: 'wall' },
  { x: 3700, y: 4650, width: 300, height: 200, type: 'wall' },
  { x: 3700, y: 4650, width: 300, height: 14, type: 'glass' },
  { x: 3700, y: 4836, width: 100, height: 14, type: 'glass' },
  { x: 3700, y: 5100, width: 240, height: 180, type: 'wall' },
  { x: 3700, y: 5100, width: 240, height: 14, type: 'glass' },

  // === MEMORIAL PARK & CEMETERY EXTENSION ===
  { x: 4400, y: 2000, width: 300, height: 220, type: 'wall' },
  { x: 4400, y: 2000, width: 300, height: 14, type: 'glass' },
  { x: 4400, y: 2206, width: 100, height: 14, type: 'glass' },
  { x: 4300, y: 2700, width: 25, height: 45, type: 'wall' },
  { x: 4400, y: 2710, width: 25, height: 45, type: 'wall' },
  { x: 4500, y: 2700, width: 25, height: 45, type: 'wall' },
  { x: 4600, y: 2710, width: 25, height: 45, type: 'wall' },
  { x: 4700, y: 2700, width: 25, height: 45, type: 'wall' },
  { x: 4800, y: 2710, width: 25, height: 45, type: 'wall' },
  { x: 4300, y: 2900, width: 25, height: 45, type: 'wall' },
  { x: 4400, y: 2910, width: 25, height: 45, type: 'wall' },
  { x: 4500, y: 2900, width: 25, height: 45, type: 'wall' },
  { x: 4600, y: 2910, width: 25, height: 45, type: 'wall' },
  { x: 4700, y: 2900, width: 25, height: 45, type: 'wall' },
  { x: 4800, y: 2910, width: 25, height: 45, type: 'wall' },
  { x: 4400, y: 3400, width: 60, height: 60, type: 'wall' },
  { x: 4600, y: 3500, width: 60, height: 60, type: 'wall' },
  { x: 4800, y: 3400, width: 60, height: 60, type: 'wall' },
  { x: 4300, y: 3600, width: 60, height: 60, type: 'wall' },
  { x: 4500, y: 3700, width: 60, height: 60, type: 'wall' },
  { x: 4700, y: 3600, width: 60, height: 60, type: 'wall' },
  { x: 4900, y: 3700, width: 60, height: 60, type: 'wall' },

  // === TOWN HALL & BANDSTAND ===
  { x: 4300, y: 4600, width: 300, height: 240, type: 'wall' },
  { x: 4300, y: 4600, width: 300, height: 14, type: 'glass' },
  { x: 4300, y: 4826, width: 100, height: 14, type: 'glass' },
  { x: 4800, y: 4700, width: 80, height: 80, type: 'wall' },
  { x: 4950, y: 4750, width: 70, height: 70, type: 'wall' },
  { x: 5100, y: 4680, width: 80, height: 80, type: 'wall' },
  { x: 5250, y: 4750, width: 70, height: 70, type: 'wall' },

  // === TRAIN APPROACH STALLS ===
  { x: 4300, y: 5220, width: 260, height: 140, type: 'wall' },
  { x: 4300, y: 5220, width: 260, height: 14, type: 'glass' },
  { x: 4700, y: 5270, width: 200, height: 130, type: 'wall' },
  { x: 4700, y: 5270, width: 200, height: 14, type: 'glass' },

  // === STABLE & WAGON YARD ===
  { x: 5600, y: 3500, width: 280, height: 200, type: 'wall' },
  { x: 5600, y: 3500, width: 280, height: 14, type: 'glass' },
  { x: 5600, y: 3686, width: 100, height: 14, type: 'glass' },
  { x: 6100, y: 3400, width: 240, height: 220, type: 'wall' },
  { x: 6100, y: 3400, width: 240, height: 14, type: 'glass' },
  { x: 6550, y: 3450, width: 200, height: 180, type: 'wall' },
  { x: 6550, y: 3450, width: 200, height: 14, type: 'glass' },

  // === EAST OUTPOST (GRAIN ELEVATOR) ===
  { x: 6920, y: 2000, width: 200, height: 150, type: 'wall' },
  { x: 6920, y: 2000, width: 200, height: 12, type: 'glass' },
  { x: 6920, y: 2138, width: 70, height: 12, type: 'glass' },
  { x: 7180, y: 2000, width: 60, height: 210, type: 'wall' },
  { x: 7280, y: 2020, width: 180, height: 160, type: 'wall' },
  { x: 7280, y: 2020, width: 180, height: 12, type: 'glass' },

  // === HAY & EQUIPMENT YARD ===
  { x: 5550, y: 1900, width: 180, height: 130, type: 'wall' },
  { x: 5550, y: 1900, width: 180, height: 12, type: 'glass' },
  { x: 5900, y: 2050, width: 160, height: 180, type: 'wall' },
  { x: 5900, y: 2050, width: 160, height: 12, type: 'glass' },
  { x: 6200, y: 2100, width: 90, height: 90, type: 'wall' },
  { x: 6350, y: 2150, width: 70, height: 70, type: 'wall' },
  { x: 6620, y: 2000, width: 60, height: 60, type: 'wall' },
  { x: 6720, y: 2060, width: 60, height: 60, type: 'wall' },
  { x: 6790, y: 2000, width: 60, height: 60, type: 'wall' },

  // === WORKSHOP / GARAGE ROW ===
  { x: 5600, y: 4800, width: 200, height: 140, type: 'wall' },
  { x: 5600, y: 4800, width: 200, height: 12, type: 'glass' },
  { x: 5900, y: 4850, width: 160, height: 120, type: 'wall' },
  { x: 5900, y: 4850, width: 160, height: 12, type: 'glass' },
  { x: 6100, y: 4800, width: 260, height: 200, type: 'wall' },
  { x: 6100, y: 4800, width: 260, height: 14, type: 'glass' },
  { x: 6500, y: 4750, width: 240, height: 220, type: 'wall' },
  { x: 6500, y: 4750, width: 240, height: 14, type: 'glass' },
  { x: 6900, y: 4800, width: 280, height: 200, type: 'wall' },
  { x: 6900, y: 4800, width: 280, height: 14, type: 'glass' },

  // === COAL YARD & HOPPERS ===
  { x: 6650, y: 2400, width: 320, height: 220, type: 'wall' },
  { x: 6650, y: 2400, width: 320, height: 14, type: 'glass' },
  { x: 6650, y: 2606, width: 110, height: 14, type: 'glass' },
  { x: 6680, y: 2850, width: 260, height: 14, type: 'wall' },
  { x: 6680, y: 2950, width: 260, height: 14, type: 'wall' },
  { x: 6750, y: 3100, width: 40, height: 200, type: 'wall' },
  { x: 6840, y: 3150, width: 60, height: 150, type: 'wall' },
  { x: 6920, y: 3100, width: 40, height: 200, type: 'wall' },

  // === FOUNDRY ANNEX / SCRAP YARD ===
  { x: 8200, y: 2400, width: 400, height: 250, type: 'wall' },
  { x: 8200, y: 2400, width: 400, height: 16, type: 'glass' },
  { x: 8200, y: 2634, width: 130, height: 16, type: 'glass' },
  { x: 8750, y: 2400, width: 120, height: 200, type: 'wall' },
  { x: 8300, y: 2900, width: 300, height: 16, type: 'wall' },
  { x: 8300, y: 3000, width: 300, height: 16, type: 'wall' },
  { x: 8300, y: 3300, width: 200, height: 140, type: 'wall' },
  { x: 8300, y: 3300, width: 200, height: 12, type: 'glass' },
  { x: 8600, y: 3500, width: 160, height: 130, type: 'wall' },
  { x: 8600, y: 3500, width: 160, height: 12, type: 'glass' },
  { x: 8400, y: 4000, width: 300, height: 200, type: 'wall' },
  { x: 8400, y: 4000, width: 300, height: 14, type: 'glass' },
  { x: 8400, y: 4186, width: 100, height: 14, type: 'glass' },

  // === SHEDS & SOUTH WORKSHOPS ===
  { x: 7500, y: 5200, width: 220, height: 160, type: 'wall' },
  { x: 7500, y: 5200, width: 220, height: 14, type: 'glass' },
  { x: 7800, y: 5250, width: 240, height: 150, type: 'wall' },
  { x: 7800, y: 5250, width: 240, height: 14, type: 'glass' },
  { x: 8300, y: 5200, width: 300, height: 160, type: 'wall' },
  { x: 8300, y: 5200, width: 300, height: 14, type: 'glass' },

  // === FREIGHT YARD ===
  { x: 5550, y: 5230, width: 800, height: 14, type: 'wall' },
  { x: 5550, y: 5380, width: 800, height: 14, type: 'wall' },
  { x: 5600, y: 5700, width: 400, height: 260, type: 'wall' },
  { x: 5600, y: 5700, width: 400, height: 14, type: 'glass' },
  { x: 5600, y: 5946, width: 130, height: 14, type: 'glass' },
  { x: 6200, y: 5750, width: 350, height: 240, type: 'wall' },
  { x: 6200, y: 5750, width: 350, height: 14, type: 'glass' },
  { x: 6750, y: 5700, width: 300, height: 260, type: 'wall' },
  { x: 6750, y: 5700, width: 300, height: 14, type: 'glass' },
  { x: 7200, y: 5800, width: 400, height: 220, type: 'wall' },
  { x: 7200, y: 5800, width: 400, height: 14, type: 'glass' },
  { x: 7200, y: 6006, width: 140, height: 14, type: 'glass' },
  { x: 7800, y: 5900, width: 300, height: 240, type: 'wall' },
  { x: 7800, y: 5900, width: 300, height: 14, type: 'glass' },

  // === SOUTH FREIGHT YARDS ===
  { x: 5700, y: 6600, width: 400, height: 220, type: 'wall' },
  { x: 5700, y: 6600, width: 400, height: 14, type: 'glass' },
  { x: 6300, y: 6650, width: 350, height: 200, type: 'wall' },
  { x: 6300, y: 6650, width: 350, height: 14, type: 'glass' },
  { x: 6900, y: 6600, width: 380, height: 220, type: 'wall' },
  { x: 6900, y: 6600, width: 380, height: 14, type: 'glass' },
  { x: 7500, y: 6650, width: 320, height: 200, type: 'wall' },
  { x: 7500, y: 6650, width: 320, height: 14, type: 'glass' },
  { x: 8600, y: 6600, width: 280, height: 200, type: 'wall' },
  { x: 8600, y: 6600, width: 280, height: 14, type: 'glass' },

  // === DEPOT YARDS (below the train station) ===
  { x: 4200, y: 6400, width: 220, height: 180, type: 'wall' },
  { x: 4200, y: 6400, width: 220, height: 14, type: 'glass' },
  { x: 4600, y: 6400, width: 300, height: 200, type: 'wall' },
  { x: 4600, y: 6400, width: 300, height: 14, type: 'glass' },
  { x: 5200, y: 6400, width: 240, height: 190, type: 'wall' },
  { x: 5200, y: 6400, width: 240, height: 14, type: 'glass' },
  { x: 4200, y: 6900, width: 500, height: 14, type: 'wall' },
];

// Scale a layout drawn in the original 4000x4000 space to the new world.
function scaleObjects(objects, scale) {
  return objects.map((obj) => ({
    ...obj,
    x: Math.round(obj.x * scale),
    y: Math.round(obj.y * scale),
    width: Math.max(1, Math.round(obj.width * scale)),
    height: Math.max(1, Math.round(obj.height * scale))
  }));
}

// Compose the final 9000x9000 world map.
const map = [
  ...scaleObjects(BASE_LAYOUT, MAP_SCALE),
  ...SOUTHERN_DISTRICTS,
  ...RIM_AND_OUTSKIRTS,
  ...FILLER_STRUCTURES
];
"""

src = src[:start] + NEW_MAP + src[end:]

open(DST, 'w', encoding='utf-8').write(src)
print("written", DST, len(src.splitlines()), "lines")
