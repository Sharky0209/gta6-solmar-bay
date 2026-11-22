// Keyboard and mouse input. Held keys give a steering vector; one-shot
// presses (start, pause, enter car, shoot) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never
// counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_SHOOT = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const SHOOT = new Set(['KeyF']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouse = { x: 640, y: 360, down: false };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || RUN.has(event.code)) keys.add(event.code);
    if (CONFIRM.has(event.code) && !event.repeat) actions |= ACTION_CONFIRM;
    if (PAUSE.has(event.code) && !event.repeat) actions |= ACTION_PAUSE;
    if (ENTER_CAR.has(event.code) && !event.repeat) actions |= ACTION_ENTER_CAR;
    if (SHOOT.has(event.code) && !event.repeat) actions |= ACTION_SHOOT;
    if (CONFIRM.has(event.code) || UP.has(event.code) || DOWN.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => { keys.delete(event.code); });
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.down = true;
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    actions |= ACTION_SHOOT;
  });
  canvas.addEventListener('pointerup', () => { mouse.down = false; });

  function has(set) {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  }

  return {
    vector() {
      return {
        x: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        y: (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0),
        run: has(RUN),
      };
    },
    mouse() { return mouse; },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // Test / autopilot helpers: pretend a key is held, or queue a one-shot action.
    press(code) { keys.add(code); },
    release(code) { keys.delete(code); },
    queue(action) { actions |= action; },
  };
}
