// The sky dome (a gradient shader with a sun disc, haze and stars) and the sea (a shader with
// rolling waves, sky reflection, sun glitter and shore foam). Both take their colours from the
// day/night cycle every frame.
import * as THREE from 'three';
import { SEA_X, HARBOR_WATER_Z } from './cityLayout.js';

export function createSky(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color('#2f6fd1') },
    horizonColor: { value: new THREE.Color('#ffd1a0') },
    groundColor: { value: new THREE.Color('#3b4a5a') },
    sunDir: { value: new THREE.Vector3(0.3, 0.4, 0.2).normalize() },
    sunColor: { value: new THREE.Color('#fff0c0') },
    starAmount: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w; // keep the dome at the far plane
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 groundColor;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float starAmount;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
        col = mix(col, groundColor, smoothstep(0.0, -0.25, h));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * pow(sd, 900.0) * 3.0;          // the disc
        col += sunColor * pow(sd, 12.0) * 0.35;          // the halo
        col += horizonColor * pow(1.0 - abs(h), 8.0) * 0.25; // haze band
        // sparse stars after dark
        vec3 cell = floor(d * 220.0);
        float star = step(0.9975, hash(cell)) * smoothstep(0.05, 0.3, h);
        col += vec3(star) * starAmount;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  return { dome, uniforms };
}

export function createSea(scene) {
  const uniforms = {
    time: { value: 0 },
    deepColor: { value: new THREE.Color('#0b5f86') },
    shallowColor: { value: new THREE.Color('#29c3c9') },
    skyColor: { value: new THREE.Color('#9fd0ff') },
    sunDir: { value: new THREE.Vector3(0.3, 0.4, 0.2).normalize() },
    sunColor: { value: new THREE.Color('#fff0c0') },
    shoreX: { value: SEA_X },
    quayZ: { value: HARBOR_WATER_Z },
    fogColor: { value: new THREE.Color('#ffffff') },
    fogNear: { value: 200 },
    fogFar: { value: 900 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */`
      uniform float time;
      varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        float wave = sin(w.x * 0.09 + time * 1.3) * 0.18 + sin(w.z * 0.13 + time * 0.9) * 0.14 + sin((w.x + w.z) * 0.31 + time * 2.1) * 0.05;
        w.y += wave;
        float dx = cos(w.x * 0.09 + time * 1.3) * 0.016 + cos((w.x + w.z) * 0.31 + time * 2.1) * 0.015;
        float dz = cos(w.z * 0.13 + time * 0.9) * 0.018 + cos((w.x + w.z) * 0.31 + time * 2.1) * 0.015;
        vNormal = normalize(vec3(-dx, 1.0, -dz));
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform vec3 deepColor; uniform vec3 shallowColor; uniform vec3 skyColor;
      uniform vec3 sunDir; uniform vec3 sunColor; uniform float shoreX; uniform float quayZ;
      uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vNormal + vec3(sin(vWorld.x * 1.7 + time * 3.0), 0.0, cos(vWorld.z * 1.9 - time * 2.6)) * 0.04);
        float shore = min(max(vWorld.x - shoreX + 10.0, 0.0), vWorld.z > quayZ - 1.0 ? (vWorld.z - quayZ) * 2.0 : 999.0);
        vec3 water = mix(shallowColor, deepColor, smoothstep(0.0, 40.0, shore));
        float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
        vec3 col = mix(water, skyColor, fres * 0.75);
        vec3 r = reflect(-view, n);
        col += sunColor * pow(max(dot(r, normalize(sunDir)), 0.0), 180.0) * 2.5;
        float foam = smoothstep(4.0, 0.0, abs(vWorld.x - shoreX + 4.0 - sin(time * 0.8 + vWorld.z * 0.05) * 1.5)) * step(vWorld.z, quayZ);
        col = mix(col, vec3(0.95, 0.97, 1.0), foam * 0.65);
        float dist = length(cameraPosition - vWorld);
        col = mix(col, fogColor, smoothstep(fogNear, fogFar, dist));
        gl_FragColor = vec4(col, 0.93);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(2400, 2400, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(geo, material);
  sea.position.set(SEA_X + 1200 - 14, -0.35, 0);
  scene.add(sea);
  // the harbor basin south of the quay
  const basin = new THREE.Mesh(new THREE.PlaneGeometry(1300, 800, 100, 60).rotateX(-Math.PI / 2), material);
  basin.position.set(SEA_X - 650 - 13, -0.35, HARBOR_WATER_Z + 400);
  scene.add(basin);
  return { uniforms };
}
