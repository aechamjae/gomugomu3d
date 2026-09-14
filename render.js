// render.js — three.js 씬 구성, 메시 생성, 그리기 전담.
// M0: 바다 · 하늘 · 빛만 있는 빈 씬.
import * as THREE from 'three';

const app = document.getElementById('app');
const boot = document.getElementById('boot');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
// 좌표계: +X 진행 방향, +Y 위, Z 좌우. 플레이어가 아직 없으므로
// 기본 카메라 규칙(뒤 14m, 위 5m, 앞 6m 주시)만 원점 기준으로 미리 적용해 둔다.
camera.position.set(-14, 5, 0);
camera.up.set(0, 1, 0);
camera.lookAt(6, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
app.appendChild(renderer.domElement);

// ---- 하늘: 배경색 + 안개로 대체 (에셋 파일 없이 코드로만) ----
const SKY_TOP = new THREE.Color(0x1c5d8c);
const SKY_HORIZON = new THREE.Color(0x9fd3e8);

function buildSkyDome() {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const pos = geo.attributes.position;
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / 900, -1, 1);
    // 수평선 근처는 밝게, 정점은 짙은 하늘색
    const mix = 1 - Math.pow(Math.max(t, 0), 0.55);
    tmp.copy(SKY_TOP).lerp(SKY_HORIZON, mix);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  return new THREE.Mesh(geo, mat);
}

const sky = buildSkyDome();
scene.add(sky);
scene.fog = new THREE.Fog(SKY_HORIZON.getHex(), 260, 900);

// ---- 빛 ----
const sun = new THREE.DirectionalLight(0xfff2d9, 2.4);
sun.position.set(-40, 60, -20);
scene.add(sun);

const ambient = new THREE.HemisphereLight(0xaee2ff, 0x0c2a3a, 0.9);
scene.add(ambient);

// ---- 바다: 정점을 흔드는 PlaneGeometry ----
const SEA_SIZE = 2000;
const SEA_SEGMENTS = 120;
const seaGeo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS);
seaGeo.rotateX(-Math.PI / 2);
const seaBasePos = seaGeo.attributes.position.array.slice();

const seaMat = new THREE.MeshStandardMaterial({
  color: 0x0f6fa3,
  roughness: 0.55,
  metalness: 0.05,
  fog: true,
});
const sea = new THREE.Mesh(seaGeo, seaMat);
sea.receiveShadow = false;
scene.add(sea);

function updateSea(t) {
  const pos = seaGeo.attributes.position;
  const arr = pos.array;
  for (let i = 0; i < arr.length; i += 3) {
    const x = seaBasePos[i];
    const z = seaBasePos[i + 2];
    arr[i + 1] =
      Math.sin(x * 0.05 + t * 1.3) * 0.6 +
      Math.sin(z * 0.08 + t * 0.9) * 0.4 +
      Math.sin((x + z) * 0.03 + t * 0.6) * 0.5;
  }
  pos.needsUpdate = true;
  seaGeo.computeVertexNormals();
}

// ---- 플레이어 (M1: 최소한의 도형. 외형은 아직 미정 — section 12) ----
const player = new THREE.Mesh(
  new THREE.SphereGeometry(Physics.PLAYER_RADIUS, 20, 16),
  new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.5 })
);
scene.add(player);

// ---- 입력 ----
const input = { left: false, right: false, down: false, up: false };
const KEY_MAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'up' };
window.addEventListener('keydown', (e) => {
  if (KEY_MAP[e.key]) { input[KEY_MAP[e.key]] = true; e.preventDefault(); }
  if (e.key === 'r' || e.key === 'R') restart();
});
window.addEventListener('keyup', (e) => {
  if (KEY_MAP[e.key]) { input[KEY_MAP[e.key]] = false; e.preventDefault(); }
});
window.addEventListener('blur', () => {
  input.left = input.right = input.down = input.up = false;
});

// ---- 게임 상태 ----
let game = Physics.createGame({ startY: 20 });

const hudDistance = document.getElementById('hud-distance');
const hudTreasure = document.getElementById('hud-treasure');
const statusEl = document.getElementById('status');

function restart() {
  game = Physics.createGame({ startY: 20 });
  statusEl.innerHTML = '';
}

function updateHud() {
  hudDistance.textContent = Math.max(0, Math.round(game.distance)) + 'm';
  hudTreasure.textContent = String(game.treasure);
  if (game.state === 'dead') {
    statusEl.innerHTML = '<div class="msg">풍덩!</div><div class="hint">R 키로 다시 시작</div>';
  }
}

// ---- 카메라: 멀미 방지 규칙 (설계 문서 2.3) ----
// 1) up 벡터는 항상 월드 +Y 고정 — 플레이어 회전을 절대 따라가지 않는다.
// 2) 위치만 목표를 쫓고, 지수 감쇠로 부드럽게 보간한다 (프레임당 12%, 프레임 독립적으로 환산).
// 3) 속도가 빠를수록 뒤로 더 빼고 FOV를 넓힌다.
const CAM_BACK = 14;
const CAM_UP = 5;
const CAM_LOOK_AHEAD = 6;
const CAM_FOLLOW_RATE = 0.12; // 60fps 기준 프레임당 보간 비율
const FOV_MIN = 60;
const FOV_MAX = 75;

const camPos = new THREE.Vector3(-CAM_BACK, CAM_UP, 0);
const camLook = new THREE.Vector3(CAM_LOOK_AHEAD, 0, 0);
camera.position.copy(camPos);

function updateCamera(dt) {
  const p = game.player.pos;
  const speed = Physics.vecLen(game.player.vel);
  const speedT = Physics.clamp(speed / Physics.MAXV, 0, 1);

  const back = CAM_BACK + speedT * 4; // 빠를수록 더 멀리
  const desiredPos = { x: p.x - back, y: p.y + CAM_UP, z: p.z };
  const desiredLook = { x: p.x + CAM_LOOK_AHEAD, y: p.y, z: p.z };

  // 지수 감쇠를 프레임 레이트에 무관하게: factor = 1-(1-rate)^(dt*60)
  const factor = 1 - Math.pow(1 - CAM_FOLLOW_RATE, dt * 60);
  camPos.lerp(new THREE.Vector3(desiredPos.x, desiredPos.y, desiredPos.z), factor);
  camLook.lerp(new THREE.Vector3(desiredLook.x, desiredLook.y, desiredLook.z), factor);

  camera.up.set(0, 1, 0);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  const targetFov = THREE.MathUtils.lerp(FOV_MIN, FOV_MAX, speedT);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
}

// ---- 리사이즈 ----
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ---- 루프 ----
// 물리는 고정 60Hz 스텝으로 축적기(accumulator)를 돌려 원작 2D의 60fps 전제를
// 렌더 프레임률과 무관하게 그대로 재현한다. 렌더 프레임이 느려져도(예: 구형 기기)
// dt를 그냥 잘라내면 슬로모션이 되어버리므로, 대신 한 프레임에 여러 스텝을 몰아 돈다.
const FIXED_DT = 1 / 60;
const MAX_FRAME_DT = 0.25; // 탭이 오래 백그라운드에 있었다면 그 시간은 그냥 버린다
const MAX_STEPS_PER_FRAME = 8;

const clock = new THREE.Clock();
let accumulator = 0;

function animate() {
  requestAnimationFrame(animate);
  const frameDt = Math.min(clock.getDelta(), MAX_FRAME_DT);
  const t = clock.getElapsedTime();

  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    Physics.step(game, FIXED_DT, input);
    accumulator -= FIXED_DT;
    steps++;
  }

  player.position.set(game.player.pos.x, game.player.pos.y, game.player.pos.z);
  updateCamera(frameDt);
  updateSea(t);
  updateHud();

  renderer.render(scene, camera);
}

boot.classList.add('hidden');
animate();
