// Staged screenshot scenes behind ?shot=start|play|chase.
// Each scene plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot, so the frame is what a
// short real game looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function autopilotTo(state, tx, ty) {
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  // Finish the long axis first, then the short one.
  if (Math.abs(dx) > 60) return { x: Math.sign(dx), y: 0, run: false };
  if (Math.abs(dy) > 60) return { x: 0, y: Math.sign(dy), run: false };
  return { x: 0, y: 0, run: false };
}

// Drive the player (on foot, then in the nearest car) toward a point by
// steering the input vector; used by the shot scenes and by the test API.
export function driveStep(world, tx, ty, ram) {
  const p = world.state.player;
  if (!p.inCar) {
    const car = world.nearestCar(p.x, p.y, 75);
    if (car) { world.enterCar(); return { x: 0, y: 0, run: false }; }
    return autopilotTo(world.state, tx, ty);
  }
  const car = world.playerCar();
  if (!car) return { x: 0, y: 0, run: false };
  // In a car, steering is relative to the car's heading: aim at the target,
  // throttle forward, steer toward the bearing difference. Slow down as the
  // target gets close, so the car can stop on a 40-50 px objective instead
  // of circling it at full speed.
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = diff > 0.25 ? 1 : diff < -0.25 ? -1 : 0;
  let throttle = -1;
  // Brake late and hard only when almost on the objective: a moving chase
  // target needs the player to arrive at speed, or it pulls away again.
  // In ram mode (chasing the snitch) never coast — full speed is the only
  // way to close on a target fleeing at 340 px/s.
  if (!ram) {
    if (dist < 70 && Math.abs(car.speed) > 200) throttle = 1;
    else if (dist < 200 && Math.abs(car.speed) > 380) throttle = 0;
  }
  return { x: steer, y: throttle, run: false };
}

export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'chase') {
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, { x: 0, y: 0, run: false }, null, false);
    return { screen: SCREEN_TITLE };
  }
  if (name === 'chase') {
    world.setWanted(3);
    // Drive toward the first mission pickup so the frame shows a mission,
    // traffic, police and the wanted stars together.
    for (let i = 0; i < 14 / STEP; i += 1) {
      const vec = driveStep(world, 1152, 896);
      world.step(STEP, vec, null, false);
    }
    return { screen: SCREEN_PLAY };
  }
  for (let i = 0; i < 18 / STEP; i += 1) {
    const vec = driveStep(world, 1152, 896);
    world.step(STEP, vec, null, false);
  }
  return { screen: SCREEN_PLAY };
}
