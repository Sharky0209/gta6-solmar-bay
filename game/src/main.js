// Solmar Bay — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: title, play, paused. Save lives in localStorage under SAVE_KEY.
// ?seed=N fixes the traffic pattern. ?shot=start|play|chase stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.

import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_MISSION_COMPLETE } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_PAUSE, ACTION_SHOOT, createInput } from './input.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { driveStep, stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261123;

const canvas = document.getElementById('game');
const startOverlay = document.getElementById('start');
const startButton = document.getElementById('start-btn');

const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world);

// --- autopilot (drives the test harness and the shot scenes) --------------
let autoTarget = null;
let autoWaypoints = [];
let autoIndex = 0;

function buildWaypoints(from, to) {
  // Direct line: cars in this top-down view drive over the low blocks, so
  // road routing only added detours (and a stall at the M1 dropoff).
  // The waypoint list is kept so a moving target can be re-aimed by
  // re-issuing autoTo with its new position.
  return [{ x: to.x, y: to.y }];
}

function autoVector() {
  if (!autoTarget) return null;
  const p = world.state.player;
  // In a chase, steer at the live target every frame, not at the position
  // the harness last sampled (400 ms ago — by then the target is 100 px on).
  const mission = world.state.missions.find((m) => m.status === 'active');
  if (mission && mission.phase === 'chase' && world.state.chaseTarget && !world.state.chaseTarget.dead) {
    if (!p.inCar) {
      const car = world.nearestCar(p.x, p.y, 75);
      if (car) { world.enterCar(); return { x: 0, y: 0, run: false }; }
    }
    const t = world.state.chaseTarget;
    if (p.inCar) return driveStep(world, t.x, t.y, true);
  }
  if (!p.inCar) {
    const car = world.nearestCar(p.x, p.y, 75);
    if (car) { world.enterCar(); return { x: 0, y: 0, run: false }; }
  }
  while (autoIndex < autoWaypoints.length) {
    const wp = autoWaypoints[autoIndex];
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 36) { autoIndex += 1; continue; }
    break;
  }
  if (autoIndex >= autoWaypoints.length) {
    const mission2 = world.state.missions.find((m) => m.status === 'active');
    const chasing = mission2 && mission2.phase === 'chase';
    if (!chasing && Math.hypot(autoTarget.x - p.x, autoTarget.y - p.y) < 40) {
      autoTarget = null;
      return { x: 0, y: 0, run: false };
    }
    autoWaypoints = buildWaypoints(p, autoTarget);
    autoIndex = 0;
    return { x: 0, y: 0, run: false };
  }
  const wp = autoWaypoints[autoIndex];
  if (p.inCar) {
    const mission2 = world.state.missions.find((m) => m.status === 'active');
    return driveStep(world, wp.x, wp.y, mission2 && mission2.phase === 'chase');
  }
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len, run: true };
}

function setAutoTarget(x, y) {
  autoTarget = { x, y };
  autoWaypoints = buildWaypoints(world.state.player, autoTarget);
  autoIndex = 0;
}

// --- save ------------------------------------------------------------------
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.snapshot()));
    return true;
  } catch {
    return false;
  }
}

function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    return world.restore(JSON.parse(raw));
  } catch {
    return false;
  }
}

// --- test / automation API --------------------------------------------------
window.__solmar = {
  state: world.state,
  world,
  seed,
  start: () => { if (startButton) startButton.click(); },
  save: saveGame,
  load: loadGame,
  teleport(x, y) {
    const p = world.state.player;
    p.x = x;
    p.y = y;
    if (p.inCar) {
      const car = world.playerCar();
      if (car) { car.x = x; car.y = y; car.speed = 0; }
    }
    autoTarget = null;
  },
  enterCar: () => world.enterCar(),
  exitCar: () => { if (world.state.player.inCar) world.enterCar(); },
  autoTo(x, y) { setAutoTarget(x, y); },
  autoDone() { return autoTarget === null; },
  autoTarget: () => autoTarget,
  setWanted: (n) => world.setWanted(n),
  addWantedHeat: (n) => world.addWantedHeat(n),
  raiseWanted: (n) => world.raiseWanted(n),
  spawnChaseTarget: () => world.spawnChaseTarget(),
  mission() {
    const m = world.state.missions.find((x) => x.status === 'active');
    return m ? { id: m.def.id, phase: m.phase, status: m.status } : { id: null, phase: 'done', status: 'done' };
  },
  missions() {
    return world.state.missions.map((m) => ({ id: m.def.id, status: m.status, phase: m.phase }));
  },
};
window.__game = window.__solmar;

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  if (startOverlay) startOverlay.style.display = 'none';
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;

  // Restore a previous visit, if one is saved, but stay on the title screen.
  const hadSave = loadGame();

  function startGame() {
    if (screen === SCREEN_PLAY) return;
    screen = SCREEN_PLAY;
    accumulator = 0;
    if (startOverlay) startOverlay.style.display = 'none';
  }

  if (startButton) startButton.addEventListener('click', startGame);

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
    else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    if (actions & ACTION_ENTER_CAR && screen === SCREEN_PLAY) world.enterCar();
    return actions;
  }

  function stepFrame(actions) {
    const auto = autoVector();
    const vec = auto || input.vector();
    const mouse = input.mouse();
    const cam = renderer.camera();
    const aimAngle = Math.atan2(
      (mouse.y + cam.y) - world.state.player.y,
      (mouse.x + cam.x) - world.state.player.x,
    );
    const doShoot = Boolean(actions & ACTION_SHOOT);
    const events = world.step(STEP, vec, aimAngle, doShoot);
    if (events & EVENT_MISSION_COMPLETE) saveGame();
    saveTimer += STEP;
    if (saveTimer > 5) { saveTimer = 0; saveGame(); }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepFrame(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  if (hadSave) world.state.message = 'Save restored. Press Space or click Start.';
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
