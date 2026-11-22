// Solmar Bay — tuning numbers, colours and mission definitions in one file.
// The city is 64 by 64 tiles at 64 px a tile, 4096 by 4096 px in all. A tile
// is road when its x or y index is a multiple of 8, so roads run every 512 px.
// The play view is a fixed 1280 by 720 window that follows the player.

export const TILE = 64;
export const WORLD_TILES = 64;
export const WORLD_SIZE = TILE * WORLD_TILES;
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay-save-v2';

export const PLAYER = {
  radius: 14,
  walkSpeed: 260,
  runSpeed: 340,
  health: 100,
};

export const CAR = {
  length: 52,
  width: 26,
  maxSpeed: 470,
  reverseSpeed: 160,
  accel: 420,
  brake: 700,
  steer: 2.6,
  colours: ['#e5534b', '#4fc3f7', '#f2c94c', '#9b7ede', '#e8eef7', '#3fb97a', '#f08a3c'],
};

export const POLICE_CAR = { length: 54, width: 27, maxSpeed: 430, accel: 460, colour: '#2f6fd0' };
export const TARGET_CAR = { length: 54, width: 27, maxSpeed: 340, hp: 160, colour: '#d7263d' };

// Wanted: 35 heat buys one star (max 5). Heat decays 2.6 a second; when the
// heat behind the current star runs out, wanted drops one star and the next
// star down starts with 21 heat.
export const WANTED = { heatPerStar: 35, decayPerSecond: 2.6, resetHeat: 21, maxStars: 5 };

// Missions. rewardCash / rewardRep is what finishing that mission pays.
// cumulativeCash / cumulativeRep is what a player holds after doing every
// mission in order: 250, 900, 2050, 3850, 6550 cash and 20, 70, 155, 285,
// 475 rep.
export const MISSIONS = [
  {
    id: 'M1', name: 'Dock Run', type: 'deliver',
    start: { x: 640, y: 640 }, pickup: { x: 1152, y: 896 }, dropoff: { x: 2816, y: 768 },
    rewardCash: 250, rewardRep: 20, cumulativeCash: 250, cumulativeRep: 20,
    brief: 'Meet the contact at the docks, pick up the package, deliver it across town.',
  },
  {
    id: 'M2', name: 'Heat Check', type: 'getaway',
    target: { x: 1536, y: 1536 }, escape: { x: 768, y: 2176 },
    rewardCash: 650, rewardRep: 50, cumulativeCash: 900, cumulativeRep: 70,
    brief: 'Grab the car at the plaza, get the heat on you, then lose it and vanish.',
  },
  {
    id: 'M3', name: 'Garage Lift', type: 'deliver_hot',
    start: { x: 768, y: 2176 }, pickup: { x: 3200, y: 1920 }, dropoff: { x: 2304, y: 2944 },
    rewardCash: 1150, rewardRep: 85, cumulativeCash: 2050, cumulativeRep: 155,
    brief: 'Lift the garage car while the cops are looking. Deliver it to the lockup.',
  },
  {
    id: 'M4', name: 'Bay Chase', type: 'chase',
    start: { x: 2304, y: 2944 }, chaseSpawn: { x: 2944, y: 2560 }, chaseEnd: { x: 2304, y: 2944 },
    rewardCash: 1800, rewardRep: 130, cumulativeCash: 3850, cumulativeRep: 285,
    brief: 'The snitch is running. Ram his car until it stops, then return to dispatch.',
  },
  {
    id: 'M5', name: 'Harbour Ledger', type: 'heist',
    pickup: { x: 3456, y: 3328 }, dropoff: { x: 896, y: 3200 },
    rewardCash: 2700, rewardRep: 190, cumulativeCash: 6550, cumulativeRep: 475,
    brief: 'One last job: take the harbour ledger and bring it home. The whole bay will know.',
  },
];

export const PALETTE = {
  sky: '#0e1a2e',
  grass: '#1d4d2b',
  block: '#223349',
  building: '#3a4f6b',
  buildingTop: '#4a6488',
  road: '#2b2f36',
  roadLine: '#c8b45a',
  sidewalk: '#3d4450',
  water: '#14506e',
  sand: '#c2a878',
  park: '#2a6b3a',
  player: '#f2c94c',
  playerCar: '#e5534b',
  ped: '#e8eef7',
  police: '#2f6fd0',
  target: '#d7263d',
  marker: '#f2c94c',
  hudBg: 'rgba(8, 14, 26, 0.72)',
  text: '#eef1f5',
  muted: '#9aa7ba',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#3fb97a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
