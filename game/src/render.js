// Drawing only: the world's state and the current screen in, pixels out.
// A 1280x720 camera follows the player across the 4096x4096 city. The HUD
// (cash, rep, wanted stars, health, mission, speed) and a live minimap are
// painted on the canvas. The title lives in the DOM overlay (index.html
// #start) and is never painted on the canvas — painting it twice doubled
// the title in screenshots.

import { CAR, FONT, PALETTE, TILE, VIEW, WORLD_SIZE } from './config.js';
import { missionMarker, missionObjectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function camera() {
    const p = world.state.player;
    return {
      x: clamp(p.x - VIEW.width / 2, 0, WORLD_SIZE - VIEW.width),
      y: clamp(p.y - VIEW.height / 2, 0, WORLD_SIZE - VIEW.height),
    };
  }

  function drawCity(cam) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    // Harbour water, south-east corner.
    context.fillStyle = PALETTE.water;
    context.fillRect(3600 - cam.x, 3560 - cam.y, 496, 536);
    context.fillStyle = PALETTE.sand;
    context.fillRect(3560 - cam.x, 3560 - cam.y, 40, 536);
    // Parks.
    for (const park of world.parks) {
      context.fillStyle = PALETTE.park;
      context.beginPath();
      context.arc(park.x - cam.x, park.y - cam.y, park.r, 0, Math.PI * 2);
      context.fill();
    }
    // Roads: bands every 512 px, with centre lines.
    context.fillStyle = PALETTE.road;
    for (let i = 0; i < 8; i += 1) {
      const c = i * 512;
      context.fillRect(c - 64 - cam.x, -cam.y, 128, WORLD_SIZE);
      context.fillRect(-cam.x, c - 64 - cam.y, WORLD_SIZE, 128);
    }
    context.strokeStyle = PALETTE.roadLine;
    context.setLineDash([28, 28]);
    context.lineWidth = 3;
    for (let i = 0; i < 8; i += 1) {
      const c = i * 512;
      context.beginPath();
      context.moveTo(c - cam.x, -cam.y);
      context.lineTo(c - cam.x, WORLD_SIZE - cam.y);
      context.stroke();
      context.beginPath();
      context.moveTo(-cam.x, c - cam.y);
      context.lineTo(WORLD_SIZE - cam.x, c - cam.y);
      context.stroke();
    }
    context.setLineDash([]);
    // Buildings.
    for (const b of world.buildings) {
      if (b.x - cam.x > VIEW.width || b.y - cam.y > VIEW.height || b.x + b.w - cam.x < 0 || b.y + b.h - cam.y < 0) continue;
      context.fillStyle = b.colour;
      context.fillRect(b.x - cam.x, b.y - cam.y, b.w, b.h);
      context.fillStyle = PALETTE.buildingTop;
      context.fillRect(b.x - cam.x + 6, b.y - cam.y + 6, b.w - 12, b.h - 12);
      context.fillStyle = '#f2c94c';
      context.fillRect(b.x - cam.x + 14, b.y - cam.y + 14, 10, 10);
    }
  }

  function drawCar(x, y, angle, colour, length, width, cam) {
    context.save();
    context.translate(x - cam.x, y - cam.y);
    context.rotate(angle);
    context.fillStyle = colour;
    context.fillRect(-length / 2, -width / 2, length, width);
    context.fillStyle = '#0b1220';
    context.fillRect(length / 6, -width / 2 + 4, length / 4, width - 8);
    context.fillStyle = '#ffe9a8';
    context.fillRect(length / 2 - 4, -width / 2 + 3, 3, 6);
    context.fillRect(length / 2 - 4, width / 2 - 9, 3, 6);
    context.restore();
  }

  function drawActors(cam) {
    const s = world.state;
    for (const car of s.cars) {
      if (s.player.inCar && car.id === s.player.carId) continue;
      drawCar(car.x, car.y, car.angle, car.colour, CAR.length, CAR.width, cam);
    }
    if (s.chaseTarget && !s.chaseTarget.dead) {
      const t = s.chaseTarget;
      drawCar(t.x, t.y, t.car.angle, t.colour, 54, 27, cam);
      // Target health bar.
      context.fillStyle = '#111';
      context.fillRect(t.x - cam.x - 26, t.y - cam.y - 34, 52, 6);
      context.fillStyle = PALETTE.red;
      context.fillRect(t.x - cam.x - 26, t.y - cam.y - 34, 52 * Math.max(0, t.hp / t.maxHp), 6);
    }
    for (const cop of s.police) {
      drawCar(cop.x, cop.y, cop.angle, cop.colour, 54, 27, cam);
      context.fillStyle = '#fff';
      context.font = `bold 11px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('POLICE', cop.x - cam.x, cop.y - cam.y - 20);
    }
    for (const ped of s.peds) {
      context.fillStyle = ped.colour;
      context.beginPath();
      context.arc(ped.x - cam.x, ped.y - cam.y, 9, 0, Math.PI * 2);
      context.fill();
    }
    for (const b of s.bullets) {
      context.fillStyle = '#ffe9a8';
      context.beginPath();
      context.arc(b.x - cam.x, b.y - cam.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    const p = s.player;
    if (p.inCar) {
      const car = world.playerCar();
      if (car) drawCar(car.x, car.y, car.angle, '#e5534b', CAR.length, CAR.width, cam);
    } else {
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(p.x - cam.x, p.y - cam.y, 14, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#0b1220';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(p.x - cam.x, p.y - cam.y);
      context.lineTo(p.x - cam.x + Math.cos(p.angle) * 22, p.y - cam.y + Math.sin(p.angle) * 22);
      context.stroke();
    }
  }

  function drawMarker(cam, mission) {
    const marker = missionMarker(mission);
    if (!marker) return;
    const mx = marker.x - cam.x;
    const my = marker.y - cam.y;
    const onScreen = mx >= 0 && mx <= VIEW.width && my >= 0 && my <= VIEW.height;
    const x = clamp(mx, 30, VIEW.width - 30);
    const y = clamp(my, 30, VIEW.height - 30);
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.moveTo(x, y - 18);
    context.lineTo(x + 12, y + 8);
    context.lineTo(x - 12, y + 8);
    context.closePath();
    context.fill();
    context.font = `bold 13px ${FONT}`;
    context.textAlign = 'center';
    context.fillStyle = '#111';
    context.fillText(marker.label, x, y + 28);
    if (!onScreen) {
      context.fillStyle = PALETTE.marker;
      context.font = `bold 13px ${FONT}`;
      context.fillText(`→ ${marker.label} ${Math.round(Math.hypot(marker.x - world.state.player.x, marker.y - world.state.player.y))}m`, x, y - 26);
    }
    if (onScreen) {
      context.strokeStyle = 'rgba(242, 201, 76, 0.8)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(mx, my, 26 + Math.sin(world.state.elapsed * 4) * 5, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function currentMissionForHud() {
    return world.state.missions.find((m) => m.status === 'active') || null;
  }

  function drawMinimap() {
    const s = world.state;
    const size = 180;
    const x0 = VIEW.width - size - 14;
    const y0 = 14;
    const scale = size / WORLD_SIZE;
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
    context.fillStyle = PALETTE.road;
    context.fillRect(x0, y0, size, size);
    context.fillStyle = PALETTE.water;
    context.fillRect(x0 + 3600 * scale, y0 + 3560 * scale, 496 * scale, 536 * scale);
    for (const b of world.buildings) {
      context.fillStyle = '#5a7396';
      context.fillRect(x0 + b.x * scale, y0 + b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
    }
    const marker = missionMarker(currentMissionForHud());
    if (marker) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(x0 + marker.x * scale, y0 + marker.y * scale, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const cop of s.police) {
      context.fillStyle = '#6aa8ff';
      context.beginPath();
      context.arc(x0 + cop.x * scale, y0 + cop.y * scale, 4, 0, Math.PI * 2);
      context.fill();
    }
    if (s.chaseTarget && !s.chaseTarget.dead) {
      context.fillStyle = PALETTE.target;
      context.beginPath();
      context.arc(x0 + s.chaseTarget.x * scale, y0 + s.chaseTarget.y * scale, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x0 + s.player.x * scale, y0 + s.player.y * scale, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#fff';
    context.lineWidth = 1;
    context.strokeRect(x0 - 4, y0 - 4, size + 8, size + 8);
  }

  function drawHud() {
    const s = world.state;
    const mission = currentMissionForHud();
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(10, 10, 340, 108);
    text(`Cash $${s.cash}`, 22, 36, 22, PALETTE.text, 'left');
    text(`Rep ${s.rep}`, 22, 62, 18, PALETTE.muted, 'left');
    let stars = '';
    for (let i = 0; i < 5; i += 1) stars += i < s.wanted ? '★' : '☆';
    text(`Wanted ${stars}`, 22, 88, 18, s.wanted > 0 ? PALETTE.red : PALETTE.text, 'left');
    text(`Health ${Math.round(s.health)}`, 22, 112, 18, PALETTE.text, 'left');
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(10, 126, 560, 34);
    text(missionObjectiveText(mission), 22, 149, 17, PALETTE.gold, 'left');
    if (s.player.inCar) {
      const car = world.playerCar();
      text(`Speed ${Math.round(Math.abs(car ? car.speed : 0))} px/s`, 22, 182, 16, PALETTE.muted, 'left');
    }
    if (s.message) {
      context.fillStyle = PALETTE.hudBg;
      context.fillRect(10, VIEW.height - 44, Math.min(760, 20 + s.message.length * 8.5), 32);
      text(s.message, 22, VIEW.height - 22, 16, PALETTE.text, 'left');
    }
    drawMinimap();
    // Controls hint, bottom right.
    text('WASD drive / walk · E enter car · F / click shoot · P pause', VIEW.width - 14, VIEW.height - 14, 13, PALETTE.muted, 'right');
  }

  function drawPanel(title, lines, prompt) {
    context.fillStyle = 'rgba(5, 10, 20, 0.72)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    context.fillStyle = PALETTE.hudBg;
    context.fillRect(340, 150, 600, 380);
    text(title, 640, 230, 52, PALETTE.text, 'center');
    lines.forEach((line, i) => text(line, 640, 290 + i * 32, 20, PALETTE.muted, 'center'));
    text(prompt, 640, 490, 22, PALETTE.gold, 'center');
  }

  function draw(state, screen) {
    const cam = camera();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.sky;
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawCity(cam);
    drawActors(cam);
    if (screen === SCREEN_TITLE) return;
    drawMarker(cam, currentMissionForHud());
    drawHud();
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The bay will wait for you.'], 'Press P to resume');
    }
  }

  return { draw, camera };
}
