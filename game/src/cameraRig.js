// Third-person camera: an orbit around the player on foot (mouse look, over-the-shoulder when
// aiming) and a lagging chase camera behind a car that swings back behind it after free look,
// widens its field of view with speed, shakes on impacts and never clips into buildings.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.yaw = Math.PI;       // the camera looks along -forward(yaw)... see orbitOffset
    this.pitch = 0.28;
    this.distance = 4.6;
    this.freeLookTimer = 0;
    this.shake = 0;
    this.focus = new THREE.Vector3();
    this.current = new THREE.Vector3();
    this.initialised = false;
    this.sensitivity = 0.0026;
  }

  /** Mouse look: accumulate yaw and pitch, remember the player took control of the camera. */
  applyMouse(dx, dy) {
    if (dx === 0 && dy === 0) return;
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * this.sensitivity, -0.35, 1.2);
    this.freeLookTimer = 1.6;
  }

  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  /** The direction the camera faces on the ground plane (for walking relative to view). */
  groundForward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  update(dt, target, mode) {
    // mode: { inVehicle, heading, speed, aiming }
    this.freeLookTimer = Math.max(0, this.freeLookTimer - dt);
    let dist = 4.6; let height = 1.55; let shoulder = 0;
    if (mode.inVehicle) {
      dist = 7.2 + Math.min(Math.abs(mode.speed), 40) * 0.06;
      height = 1.4;
      if (this.freeLookTimer <= 0) {
        const behind = mode.speed < -2 ? mode.heading + Math.PI : mode.heading;
        let diff = behind - this.yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.yaw += diff * Math.min(1, dt * 3.2);
        this.pitch += (0.2 - this.pitch) * Math.min(1, dt * 2);
      }
    } else if (mode.aiming) {
      dist = 2.6; shoulder = 0.75; height = 1.65;
    }
    this.distance = this.initialised ? this.distance + (dist - this.distance) * Math.min(1, dt * 4) : dist;
    this.focus.copy(target).add(new THREE.Vector3(0, height, 0));
    const fwd = this.groundForward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const back = new THREE.Vector3(-fwd.x * Math.cos(this.pitch), Math.sin(this.pitch), -fwd.z * Math.cos(this.pitch));
    const pivot = this.focus.clone().addScaledVector(right, shoulder);
    let want = pivot.clone().addScaledVector(back, this.distance);
    // pull in when a building is between the player and the camera
    const dir = want.clone().sub(pivot); const len = dir.length(); dir.normalize();
    const hit = this.collision.rayDistance(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, len);
    if (hit < len) want = pivot.clone().addScaledVector(dir, Math.max(0.8, hit - 0.4));
    if (want.y < 0.4) want.y = 0.4;
    if (!this.initialised) { this.current.copy(want); this.initialised = true; }
    const lag = mode.inVehicle ? 10 : 14;
    this.current.lerp(want, Math.min(1, dt * lag));
    this.camera.position.copy(this.current);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    const look = pivot.clone().addScaledVector(fwd, mode.aiming ? 8 : 2);
    look.y = pivot.y + (mode.inVehicle ? 0.2 : 0);
    this.camera.lookAt(look);
    const fov = mode.inVehicle ? 62 + Math.min(Math.abs(mode.speed), 45) * 0.32 : (mode.aiming ? 50 : 62);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
  }

  /** Jump the camera straight to its target (after loading or respawning). */
  snap() { this.initialised = false; }
}
