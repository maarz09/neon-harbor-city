// Keyboard and mouse state: which keys are held, which were pressed this frame, mouse look deltas
// collected under pointer lock, and the mouse buttons for punching and shooting.

export class InputState {
  constructor(target) {
    this.held = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.aiming = false;
    this.wheel = 0;
    this.target = target;
    this.enabled = true;
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.aiming = false;
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKeyDown(e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (!this.held.has(e.code)) this.pressed.add(e.code);
    this.held.add(e.code);
  }

  onMouseMove(e) {
    if (document.pointerLockElement === this.target) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  }

  onMouseDown(e) {
    if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
    if (e.button === 2) this.aiming = true;
  }

  requestPointerLock() {
    if (document.pointerLockElement !== this.target && this.target.requestPointerLock) {
      try { const p = this.target.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* headless */ }
    }
  }

  isDown(...codes) { return codes.some((c) => this.held.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }

  /** Forward/back and left/right in -1..1 from WASD or the arrow keys. */
  moveAxes() {
    const f = (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    const r = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    return { f, r };
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
    this.wheel = 0;
  }
}
