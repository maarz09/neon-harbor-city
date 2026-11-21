// Shared tuning numbers for Neon Harbor: the size of the city grid, how cars and people move,
// how the law reacts. Every other module reads its constants from here so balancing is one file.

export const CITY = {
  blocksX: 9,          // blocks west to east (the last column is beach and ocean)
  blocksZ: 8,          // blocks north to south
  block: 64,           // metres from one road centre line to the next
  road: 14,            // width of a road surface
  sidewalk: 3,         // width of the pavement ring around each block
  coastBlocks: 1,      // columns at the east edge given over to sand and sea
};

export const WORLD_W = CITY.blocksX * CITY.block;
export const WORLD_D = CITY.blocksZ * CITY.block;

export const PLAYER_TUNING = {
  walk: 4.2,
  sprint: 8.5,
  jump: 6.5,
  gravity: 22,
  radius: 0.45,
  maxHealth: 100,
  maxArmour: 100,
  punchRange: 1.8,
  punchDamage: 22,
  enterRange: 4.2,
};

export const CAR_TUNING = {
  accel: 16,
  brake: 30,
  reverse: 8,
  drag: 0.35,
  roll: 1.6,
  steer: 2.3,
  grip: 6.5,
  handbrakeGrip: 1.4,
};

export const TRAFFIC_TUNING = {
  cars: 34,
  pedestrians: 46,
  cruise: 11,
  pedWalk: 1.4,
  despawnRadius: 260,
};

export const POLICE_TUNING = {
  unitsPerStar: [0, 1, 2, 3, 4, 5],
  speedByStar: [0, 24, 30, 35, 39, 43],
  sightRadius: 110,
  loseSeconds: 9,
  bustSeconds: 2.6,
  spawnDistance: 120,
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 22, cooldown: 0.42, range: 1.8, ammo: Infinity },
  pistol: { name: 'Hawk 9 Pistol', damage: 34, cooldown: 0.28, range: 70, ammo: 60, spread: 0.02 },
  smg: { name: 'Vespa SMG', damage: 18, cooldown: 0.08, range: 55, ammo: 0, spread: 0.06 },
};

export const FIXED_STEP = 1 / 60;
export const SAVE_KEY = 'neon-harbor-save-v1';
