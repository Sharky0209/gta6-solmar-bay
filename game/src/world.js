// Solmar Bay — the rules and state, with no drawing and no browser in it.
// A 4096x4096 city: roads every 512 px, buildings in the blocks between
// them, traffic on the roads, pedestrians on the sidewalks, police that
// answer the wanted level, and five chained missions. step() advances one
// fixed step. All randomness comes from the seeded generator passed in —
// nothing here reads Math.random, so one seed replays the same city.

import {
  CAR, MISSIONS, PALETTE, PLAYER, POLICE_CAR, TARGET_CAR, TILE,
  WANTED, WORLD_SIZE,
} from './config.js';
import { activateNext, advanceMission, createMissions, currentMission } from './missions.js';
import { pick } from './random.js';

export const EVENT_MISSION_COMPLETE = 1;
export const EVENT_HIT = 2;
export const EVENT_SHOT = 4;

const MISSION_POINTS = [];
for (const m of MISSIONS) {
  for (const key of ['start', 'pickup', 'dropoff', 'target', 'escape', 'chaseSpawn', 'chaseEnd']) {
    if (m[key]) MISSION_POINTS.push(m[key]);
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function isRoadTile(tx, ty) { return tx % 8 === 0 || ty % 8 === 0; }
function roadAt(x, y) {
  return isRoadTile(Math.floor(x / TILE), Math.floor(y / TILE));
}
function nearMissionPoint(x, y) {
  return MISSION_POINTS.some((p) => Math.hypot(p.x - x, p.y - y) < 130);
}

export function createWorld(random) {
  // --- static city ---------------------------------------------------------
  const buildings = [];
  for (let bx = 0; bx < 8; bx += 1) {
    for (let by = 0; by < 8; by += 1) {
      const ox = bx * 512 + 96;
      const oy = by * 512 + 96;
      const count = 1 + Math.floor(random() * 2);
      for (let i = 0; i < count; i += 1) {
        const w = 110 + random() * 130;
        const h = 90 + random() * 120;
        const x = ox + random() * (512 - 192 - w);
        const y = oy + (i * 170) + random() * 40;
        if (x + w > ox + 512 - 96 || y + h > oy + 512 - 96) continue;
        const cx = x + w / 2;
        const cy = y + h / 2;
        if (nearMissionPoint(cx, cy)) continue;
        buildings.push({ x, y, w, h, colour: pick(random, ['#3a4f6b', '#46587a', '#33465e', '#4a6488']) });
      }
    }
  }
  const parks = [];
  for (let i = 0; i < 10; i += 1) {
    const x = 256 + random() * (WORLD_SIZE - 512);
    const y = 256 + random() * (WORLD_SIZE - 512);
    if (roadAt(x, y) || nearMissionPoint(x, y)) continue;
    parks.push({ x, y, r: 90 + random() * 90 });
  }

  // --- dynamic state -------------------------------------------------------
  const state = {
    elapsed: 0,
    cash: 0,
    rep: 0,
    wanted: 0,
    wantedHeat: 0,
    health: PLAYER.health,
    message: 'Welcome to Solmar Bay.',
    messageTimer: 0,
    player: { x: 640, y: 640, angle: 0, speed: 0, inCar: false, carId: -1 },
    cars: [],
    peds: [],
    police: [],
    bullets: [],
    chaseTarget: null,
    missions: createMissions(),
  };

  function spawnCars() {
    state.cars = [];
    for (let i = 0; i < 16; i += 1) {
      const onVertical = random() < 0.5;
      const roadIndex = Math.floor(random() * 8) * 512;
      const along = 200 + random() * (WORLD_SIZE - 400);
      const x = onVertical ? roadIndex : along;
      const y = onVertical ? along : roadIndex;
      state.cars.push({
        id: i, x, y, angle: onVertical ? Math.PI / 2 : 0,
        speed: 0, colour: pick(random, CAR.colours),
        driving: i < 8, dir: random() < 0.5 ? 1 : -1, cruise: 130 + random() * 60,
      });
    }
  }

  function spawnPeds() {
    state.peds = [];
    for (let i = 0; i < 22; i += 1) {
      const x = 200 + random() * (WORLD_SIZE - 400);
      const y = 200 + random() * (WORLD_SIZE - 400);
      state.peds.push({
        x, y, angle: random() * Math.PI * 2, speed: 35 + random() * 35,
        colour: pick(random, ['#e8eef7', '#f08a3c', '#9b7ede', '#3fb97a', '#e5534b']),
        flee: 0,
      });
    }
  }

  function reset() {
    state.elapsed = 0;
    state.cash = 0;
    state.rep = 0;
    state.wanted = 0;
    state.wantedHeat = 0;
    state.health = PLAYER.health;
    state.message = 'Welcome to Solmar Bay.';
    state.messageTimer = 0;
    state.player = { x: 640, y: 640, angle: 0, speed: 0, inCar: false, carId: -1 };
    state.bullets = [];
    state.police = [];
    state.chaseTarget = null;
    state.missions = createMissions();
    spawnCars();
    spawnPeds();
  }

  function playerCar() {
    if (!state.player.inCar) return null;
    return state.cars.find((c) => c.id === state.player.carId) || null;
  }

  function raiseWanted(level) {
    if (level <= state.wanted) {
      if (state.wanted > 0 && state.wantedHeat <= 0) state.wantedHeat = WANTED.heatPerStar;
      return;
    }
    state.wanted = Math.min(WANTED.maxStars, level);
    state.wantedHeat = WANTED.heatPerStar;
  }

  function addWantedHeat(amount) {
    state.wantedHeat += amount;
    while (state.wantedHeat >= WANTED.heatPerStar && state.wanted < WANTED.maxStars) {
      state.wanted += 1;
      state.wantedHeat -= WANTED.heatPerStar;
    }
    if (state.wanted > 0 && state.wantedHeat <= 0) state.wantedHeat = WANTED.heatPerStar;
    if (state.wanted === 0) state.wantedHeat = Math.min(state.wantedHeat, WANTED.heatPerStar - 1);
  }

  function setWanted(level) {
    state.wanted = clamp(level, 0, WANTED.maxStars);
    state.wantedHeat = state.wanted > 0 ? WANTED.heatPerStar : 0;
  }

  // Cars drive over the low city blocks in this top-down view: building
  // collision is only for people on foot. A car that had to turn around
  // inside a block would otherwise stall against a wall it cannot steer
  // out of, which is what killed the first M1 dropoff drive.
  function clampWorld(obj) {
    obj.x = clamp(obj.x, 20, WORLD_SIZE - 20);
    obj.y = clamp(obj.y, 20, WORLD_SIZE - 20);
  }

  function collideBuildings(obj, radius) {
    for (const b of buildings) {
      const cx = clamp(obj.x, b.x, b.x + b.w);
      const cy = clamp(obj.y, b.y, b.y + b.h);
      const dx = obj.x - cx;
      const dy = obj.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = radius - d;
      obj.x += (dx / d) * push;
      obj.y += (dy / d) * push;
    }
    obj.x = clamp(obj.x, 20, WORLD_SIZE - 20);
    obj.y = clamp(obj.y, 20, WORLD_SIZE - 20);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (state.chaseTarget && car === state.chaseTarget.car) continue;
      const d = dist({ x, y }, car);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar() {
    const p = state.player;
    if (p.inCar) {
      const car = playerCar();
      p.inCar = false;
      p.carId = -1;
      if (car) { p.x = car.x + 40; p.y = car.y + 40; car.speed = 0; }
      state.message = 'On foot.';
      return true;
    }
    const car = nearestCar(p.x, p.y, 75);
    if (!car) return false;
    // Stealing a parked or traffic car draws the heat.
    if (!car.driving) addWantedHeat(12);
    car.driving = false;
    p.inCar = true;
    p.carId = car.id;
    p.x = car.x;
    p.y = car.y;
    state.message = 'Car taken. Drive with WASD.';
    return true;
  }

  function shoot(angle) {
    const p = state.player;
    if (p.inCar) return;
    state.bullets.push({ x: p.x, y: p.y, vx: Math.cos(angle) * 620, vy: Math.sin(angle) * 620, life: 0.9 });
    return EVENT_SHOT;
  }

  function spawnChaseTarget() {
    const m4 = state.missions[3];
    const car = {
      id: 900, x: m4.def.chaseSpawn.x, y: m4.def.chaseSpawn.y,
      angle: 0, speed: 0, colour: TARGET_CAR.colour, driving: true, dir: 1, cruise: TARGET_CAR.maxSpeed,
    };
    state.chaseTarget = {
      car, x: car.x, y: car.y, hp: TARGET_CAR.hp, maxHp: TARGET_CAR.hp,
      flee: true, maxSpeed: TARGET_CAR.maxSpeed, speed: 0, dead: false,
    };
    state.message = 'Snitch spotted. Run him down.';
  }

  function ensurePolice(dt) {
    const want = state.wanted;
    if (want <= 0) {
      if (state.police.length > 0) {
        state.policeTimer = (state.policeTimer || 0) + dt;
        if (state.policeTimer > 3) { state.police = []; state.policeTimer = 0; }
      }
      return;
    }
    state.policeTimer = 0;
    while (state.police.length < want) {
      const angle = random() * Math.PI * 2;
      const x = clamp(state.player.x + Math.cos(angle) * 650, 40, WORLD_SIZE - 40);
      const y = clamp(state.player.y + Math.sin(angle) * 650, 40, WORLD_SIZE - 40);
      state.police.push({ x, y, angle, speed: 0, colour: POLICE_CAR.colour });
    }
    while (state.police.length > want) state.police.pop();
  }

  function stepPolice(dt) {
    const p = state.player;
    for (const cop of state.police) {
      const dx = p.x - cop.x;
      const dy = p.y - cop.y;
      const d = Math.hypot(dx, dy) || 1;
      const wantAngle = Math.atan2(dy, dx);
      let diff = wantAngle - cop.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      cop.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      cop.speed = Math.min(POLICE_CAR.maxSpeed, cop.speed + POLICE_CAR.accel * dt);
      if (d < 70) cop.speed = Math.min(cop.speed, 120);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      clampWorld(cop);
      // A police car leaning on the player hurts, slowly — never a one-hit end.
      if (d < 46) state.health = Math.max(1, state.health - 2 * dt);
    }
  }

  // Kill the chase target in the very tick its hp runs out: dead and
  // stopped at once. There is no delayed-death state and no other path to
  // dead — only ramming here and bullets in stepBullets can set it.
  function killChaseTarget(t) {
    t.dead = true;
    t.speed = 0;
    t.car.speed = 0;
  }

  function stepChaseTarget(dt) {
    const t = state.chaseTarget;
    if (!t || t.dead) return;
    const p = state.player;
    const car = playerCar();
    const px = car ? car.x : p.x;
    const py = car ? car.y : p.y;
    const dx = t.x - px;
    const dy = t.y - py;
    const d = Math.hypot(dx, dy) || 1;
    // Flee away from the player, at up to 340 px/s.
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - t.car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    t.car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
    t.speed = Math.min(t.maxSpeed, t.speed + 300 * dt);
    t.car.speed = t.speed;
    t.car.x += Math.cos(t.car.angle) * t.speed * dt;
    t.car.y += Math.sin(t.car.angle) * t.speed * dt;
    clampWorld(t.car);
    t.x = t.car.x;
    t.y = t.car.y;
    // Ramming: player in a car, close, and moving fast damages the target.
    if (car && d < 55 && Math.abs(car.speed) > 80) {
      t.hp -= 40 * dt;
      if (t.hp <= 0) {
        killChaseTarget(t);
        return;
      }
      // The rammed car is shoved along at the player's speed, so contact
      // holds for more than a single passing tick.
      t.speed = Math.abs(car.speed);
      t.car.speed = t.speed;
      // Push the target along so contact can be held for the next ticks.
      t.car.x += Math.cos(car.angle) * 60 * dt;
      t.car.y += Math.sin(car.angle) * 60 * dt;
      clampWorld(t.car);
      t.x = t.car.x;
      t.y = t.car.y;
    }
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (!car.driving) continue;
      if (state.player.inCar && car.id === state.player.carId) continue;
      // Cruise along the road grid, turning at intersections.
      car.speed = car.cruise;
      const nx = car.x + Math.cos(car.angle) * car.speed * car.dir * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * car.dir * dt;
      car.x = nx;
      car.y = ny;
      if (car.x < 60 || car.x > WORLD_SIZE - 60 || car.y < 60 || car.y > WORLD_SIZE - 60) {
        car.dir *= -1;
        car.angle += Math.PI;
      }
      if (random() < 0.002) {
        // Occasionally turn at an intersection (near a road crossing).
        const tx = Math.floor(car.x / TILE);
        const ty = Math.floor(car.y / TILE);
        if (tx % 8 === 0 && ty % 8 === 0) car.angle += (random() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      clampWorld(car);
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.x += Math.cos(ped.angle) * 180 * dt;
        ped.y += Math.sin(ped.angle) * 180 * dt;
      } else {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (random() < 0.005) ped.angle = random() * Math.PI * 2;
      }
      if (ped.x < 40 || ped.x > WORLD_SIZE - 40 || ped.y < 40 || ped.y > WORLD_SIZE - 40) {
        ped.angle += Math.PI;
      }
      collideBuildings(ped, 12);
    }
  }

  function stepBullets(dt) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const t = state.chaseTarget;
      if (t && !t.dead && dist(b, t) < 34) {
        t.hp -= 20;
        b.life = 0;
        if (t.hp <= 0) killChaseTarget(t);
      }
      for (const ped of state.peds) {
        if (dist(b, ped) < 20) {
          ped.flee = 2;
          ped.angle = Math.atan2(ped.y - b.y, ped.x - b.x);
          b.life = 0;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function stepPlayer(dt, vec) {
    const p = state.player;
    const car = playerCar();
    if (car) {
      const forward = vec.y < 0 ? 1 : vec.y > 0 ? -1 : 0;
      const steering = vec.x;
      if (forward !== 0) {
        car.speed += forward * CAR.accel * dt;
        if (forward < 0) car.speed = Math.max(car.speed, -CAR.reverseSpeed);
      } else {
        car.speed *= Math.max(0, 1 - 0.5 * dt);
        if (Math.abs(car.speed) < 4) car.speed = 0;
      }
      car.speed = clamp(car.speed, -CAR.reverseSpeed, CAR.maxSpeed);
      if (Math.abs(car.speed) > 20) {
        car.angle += steering * CAR.steer * dt * (car.speed / CAR.maxSpeed) * (car.speed >= 0 ? 1 : -1);
      }
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      clampWorld(car);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = car.speed;
      return;
    }
    const speed = vec.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(vec.x, vec.y) || 1;
    if (vec.x !== 0 || vec.y !== 0) {
      p.x += (vec.x / len) * speed * dt;
      p.y += (vec.y / len) * speed * dt;
      p.angle = Math.atan2(vec.y, vec.x);
    }
    p.speed = (vec.x !== 0 || vec.y !== 0) ? speed : 0;
    collideBuildings(p, PLAYER.radius);
  }

  function stepWanted(dt) {
    if (state.wanted <= 0) return;
    state.wantedHeat -= WANTED.decayPerSecond * dt;
    if (state.wantedHeat <= 0) {
      state.wanted -= 1;
      state.wantedHeat = state.wanted > 0 ? WANTED.resetHeat : 0;
    }
  }

  // One fixed step. `vec` is the movement vector, `shootAngle` the mouse aim
  // in world space (or null), `doShoot` a one-shot fire request.
  function step(dt, vec, shootAngle, doShoot) {
    let events = 0;
    state.elapsed += dt;
    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0) state.message = '';
    }
    stepPlayer(dt, vec || { x: 0, y: 0, run: false });
    if (doShoot && shootAngle !== null && shootAngle !== undefined) {
      const ev = shoot(shootAngle);
      if (ev) events |= ev;
    }
    stepTraffic(dt);
    stepPeds(dt);
    stepPolice(dt);
    stepChaseTarget(dt);
    stepBullets(dt);
    stepWanted(dt);
    ensurePolice(dt);

    const mission = currentMission(state.missions);
    if (mission) {
      const before = mission.message;
      const result = advanceMission(mission, {
        player: state.player,
        inCar: state.player.inCar,
        wanted: state.wanted,
        chaseTarget: state.chaseTarget,
        raiseWanted,
        onChaseStart: () => { if (!state.chaseTarget) spawnChaseTarget(); },
        get cash() { return state.cash; },
        set cash(v) { state.cash = v; },
        get rep() { return state.rep; },
        set rep(v) { state.rep = v; },
      });
      if (mission.message && mission.message !== before) {
        state.message = mission.message;
        state.messageTimer = 5;
      }
      if (result === 'completed') {
        events |= EVENT_MISSION_COMPLETE;
        state.message = mission.message;
        state.messageTimer = 5;
        const next = activateNext(state.missions, mission.index);
        if (next) state.message += ` Next: ${next.def.id} ${next.def.name}.`;
      }
    }
    if (state.health <= 0) {
      state.health = PLAYER.health;
      state.player.x = 640;
      state.player.y = 640;
      if (state.player.inCar) { state.player.inCar = false; state.player.carId = -1; }
      state.message = 'You were caught. Back on your feet at the docks.';
      state.messageTimer = 5;
    }
    return events;
  }

  function snapshot() {
    return {
      cash: state.cash,
      rep: state.rep,
      wanted: state.wanted,
      player: { x: state.player.x, y: state.player.y, inCar: state.player.inCar },
      missions: state.missions.map((m) => ({ id: m.def.id, status: m.status, phase: m.phase })),
    };
  }

  function restore(data) {
    if (!data) return false;
    state.cash = data.cash || 0;
    state.rep = data.rep || 0;
    if (data.player) {
      state.player.x = data.player.x;
      state.player.y = data.player.y;
    }
    if (Array.isArray(data.missions)) {
      for (const saved of data.missions) {
        const m = state.missions.find((x) => x.def.id === saved.id);
        if (m) { m.status = saved.status; m.phase = saved.phase; }
      }
    }
    return true;
  }

  reset();
  return {
    state, buildings, parks, reset, step, enterCar, shoot,
    playerCar, nearestCar, raiseWanted, addWantedHeat, setWanted,
    spawnChaseTarget, snapshot, restore, roadAt,
  };
}
