// The five chained missions. Each mission is a small state machine over
// phases; the world step drives it by checking distances, the car, and the
// wanted level. Rewards are paid once, on completion, as the incremental
// cash and rep in config — so the cash after each mission is the cumulative
// total in config.

import { MISSIONS } from './config.js';

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createMissions() {
  const list = MISSIONS.map((def, index) => ({
    def,
    index,
    status: index === 0 ? 'active' : 'locked',
    phase: firstPhase(def),
    pickupDone: false,
    getawayDone: false,
    targetDead: false,
    message: '',
  }));
  return list;
}

export function firstPhase(def) {
  if (def.type === 'deliver' || def.type === 'deliver_hot') return 'toStart';
  if (def.type === 'getaway') return 'toTarget';
  if (def.type === 'chase') return 'toStart';
  if (def.type === 'heist') return 'toPickup';
  return 'toStart';
}

export function currentMission(list) {
  return list.find((m) => m.status === 'active') || null;
}

export function completedCount(list) {
  return list.filter((m) => m.status === 'done').length;
}

// Where the player should go next for this mission, or null when it has none.
export function missionMarker(mission) {
  if (!mission) return null;
  const d = mission.def;
  switch (mission.phase) {
    case 'toStart': return { ...d.start, label: `${d.id} · meet` };
    case 'toPickup': return { ...d.pickup, label: `${d.id} · pickup` };
    case 'toDropoff': return { ...d.dropoff, label: `${d.id} · deliver` };
    case 'toTarget': return { ...d.target, label: `${d.id} · target` };
    case 'toEscape': return { ...d.escape, label: `${d.id} · escape` };
    case 'chase': return mission.chasePos ? { ...mission.chasePos, label: `${d.id} · chase` } : { ...d.chaseSpawn, label: `${d.id} · chase` };
    case 'toEnd': return { ...d.chaseEnd, label: `${d.id} · return` };
    default: return null;
  }
}

export function missionObjectiveText(mission) {
  if (!mission) return 'All missions complete — Solmar Bay is yours.';
  const d = mission.def;
  switch (mission.phase) {
    case 'toStart': return `${d.id} ${d.name}: go to the meeting point`;
    case 'toPickup': return `${d.id} ${d.name}: pick up the package`;
    case 'toDropoff': return `${d.id} ${d.name}: deliver it — stay in the car`;
    case 'toTarget': return `${d.id} ${d.name}: get in a car and reach the plaza`;
    case 'toEscape': return `${d.id} ${d.name}: heat is clear — reach the escape point`;
    case 'chase': return `${d.id} ${d.name}: ram the snitch car until it stops`;
    case 'toEnd': return `${d.id} ${d.name}: snitch stopped — return to dispatch`;
    default: return `${d.id} ${d.name}`;
  }
}

// Advance one mission by one step. `ctx` carries the live facts the rules
// need: player position, whether the player is in a car, car speed, wanted
// level, the chase target car (or null), and a callback to raise the wanted
// level. Returns 'completed' when this mission just finished, else null.
export function advanceMission(mission, ctx) {
  const d = mission.def;
  const p = ctx.player;
  if (mission.phase === 'toStart') {
    if (dist(p, d.start) < 60) {
      if (d.type === 'chase') {
        mission.phase = 'chase';
        mission.message = 'Snitch spotted. Run him down.';
        if (ctx.onChaseStart) ctx.onChaseStart();
      } else {
        mission.phase = 'toPickup';
        mission.message = 'Contact met. Go to the pickup.';
      }
    }
    return null;
  }
  if (mission.phase === 'toPickup') {
    const radius = d.type === 'heist' || d.type === 'deliver_hot' ? 42 : 46;
    if (dist(p, d.pickup) < radius) {
      mission.pickupDone = true;
      if (d.type === 'heist') {
        ctx.raiseWanted(3);
        mission.message = 'Ledger taken. The whole bay is looking for you.';
      } else if (d.type === 'deliver_hot') {
        ctx.raiseWanted(2);
        mission.message = 'Car lifted. Deliver it before the heat finds you.';
      } else {
        mission.message = 'Package collected. Deliver it.';
      }
      mission.phase = 'toDropoff';
    }
    return null;
  }
  if (mission.phase === 'toDropoff') {
    if (dist(p, d.dropoff) < 46) return completeMission(mission, ctx);
    return null;
  }
  if (mission.phase === 'toTarget') {
    if (ctx.inCar && dist(p, d.target) < 80) {
      mission.pickupDone = true;
      ctx.raiseWanted(2);
      mission.message = 'Heat is on. Lose the cops, then run.';
      // Stay in toTarget until the heat is gone; the marker stays on the
      // target while wanted > 0, then the branch below flips to escape.
    }
    if (mission.pickupDone && ctx.wanted <= 0) {
      mission.getawayDone = true;
      mission.phase = 'toEscape';
      mission.message = 'Clean. Get to the escape point.';
    }
    return null;
  }
  if (mission.phase === 'toEscape') {
    if (dist(p, d.escape) < 48) return completeMission(mission, ctx);
    return null;
  }
  if (mission.phase === 'chase') {
    const target = ctx.chaseTarget;
    if (target) mission.chasePos = { x: target.x, y: target.y };
    if (target && target.dead) {
      mission.targetDead = true;
      mission.pickupDone = true;
      mission.phase = 'toEnd';
      mission.message = 'Snitch stopped. Return to dispatch.';
    }
    return null;
  }
  if (mission.phase === 'toEnd') {
    if (dist(p, d.chaseEnd) < 50) return completeMission(mission, ctx);
    return null;
  }
  return null;
}

function completeMission(mission, ctx) {
  mission.status = 'done';
  mission.phase = 'done';
  ctx.cash += mission.def.rewardCash;
  ctx.rep += mission.def.rewardRep;
  mission.message = `${mission.def.id} complete: +$${mission.def.rewardCash}, +${mission.def.rewardRep} rep.`;
  return 'completed';
}

export function activateNext(list, doneIndex) {
  const next = list[doneIndex + 1];
  if (next) {
    next.status = 'active';
    next.phase = firstPhase(next.def);
  }
  return next || null;
}
