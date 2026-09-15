// render.js — three.js 씬 구성, 메시 생성, 그리기 전담.
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

// ---- 고리 (돛대/바위) — 코드로 생성한 지오메트리만 사용 ----
const ringMeshes = new Map(); // ring.id -> THREE.Group

function buildRingMesh(ring) {
  const group = new THREE.Group();
  const isMast = ring.kind === 'mast';
  const poleHeight = ring.y + 1.5;
  const poleMat = new THREE.MeshStandardMaterial({
    color: isMast ? 0x6b4a30 : 0x6b6f73,
    roughness: isMast ? 0.8 : 0.95,
  });

  if (isMast) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, poleHeight, 8), poleMat);
    pole.position.y = poleHeight / 2;
    group.add(pole);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.18), poleMat);
    crossbar.position.y = ring.y - 0.6;
    group.add(crossbar);
  } else {
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, poleHeight + 3, 7), poleMat);
    rock.position.y = (poleHeight - 3) / 2;
    rock.rotation.y = ring.id * 0.7; // 회전을 섞어 하나만 복제한 티가 덜 나게
    group.add(rock);
  }

  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.09, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xffcf4d, metalness: 0.3, roughness: 0.4 })
  );
  hook.position.y = ring.y;
  hook.rotation.y = Math.PI / 2;
  group.add(hook);

  group.position.set(ring.x, 0, ring.z);
  return group;
}

function syncRingMeshes() {
  const liveIds = new Set();
  for (const ring of game.rings) {
    liveIds.add(ring.id);
    if (!ringMeshes.has(ring.id)) {
      const mesh = buildRingMesh(ring);
      ringMeshes.set(ring.id, mesh);
      scene.add(mesh);
    }
  }
  for (const [id, mesh] of ringMeshes) {
    if (!liveIds.has(id)) {
      scene.remove(mesh);
      ringMeshes.delete(id);
    }
  }
}

// ---- 조준 마커 & 팔(줄) ----
const aimMarker = new THREE.Mesh(
  new THREE.TorusGeometry(0.9, 0.07, 8, 20),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
);
aimMarker.visible = false;
scene.add(aimMarker);

const armGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const arm = new THREE.Line(armGeo, new THREE.LineBasicMaterial({ color: 0xfff2d9, linewidth: 2 }));
arm.visible = false;
scene.add(arm);

const camForward = new THREE.Vector3();

// ---- 입력 ----
const input = { left: false, right: false, down: false, up: false };
const KEY_MAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'up' };

function attemptAttach() {
  if (game.state !== 'falling') return;
  camera.getWorldDirection(camForward);
  const target = Physics.pickTarget(game, { x: camForward.x, y: camForward.y, z: camForward.z });
  if (target) Physics.tryAttach(game, target);
}
function attemptRelease() {
  Physics.release(game);
}

window.addEventListener('keydown', (e) => {
  if (KEY_MAP[e.key]) { input[KEY_MAP[e.key]] = true; e.preventDefault(); }
  if (e.key === 'r' || e.key === 'R') restart();
  if (e.code === 'Space') { attemptAttach(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (KEY_MAP[e.key]) { input[KEY_MAP[e.key]] = false; e.preventDefault(); }
  if (e.code === 'Space') attemptRelease();
});
window.addEventListener('mousedown', attemptAttach);
window.addEventListener('mouseup', attemptRelease);
window.addEventListener('blur', () => {
  input.left = input.right = input.down = input.up = false;
  attemptRelease();
});

// ---- 게임 상태 ----
let game = Physics.createGame({});

const hudDistance = document.getElementById('hud-distance');
const hudTreasure = document.getElementById('hud-treasure');
const statusEl = document.getElementById('status');

function restart() {
  for (const mesh of ringMeshes.values()) scene.remove(mesh);
  ringMeshes.clear();
  game = Physics.createGame({});
  statusEl.innerHTML = '';
}

function updateHud() {
  hudDistance.textContent = Math.max(0, Math.round(game.distance)) + 'm';
  hudTreasure.textContent = String(game.treasure);
  if (game.state === 'dead') {
    statusEl.innerHTML = '<div class="msg">풍덩!</div><div class="hint">R 키로 다시 시작 · Space/클릭으로 팔 걸기</div>';
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
  let desiredLook = { x: p.x + CAM_LOOK_AHEAD, y: p.y, z: p.z };

  // 고리에 매달린 동안엔 고리가 화면 안에 들어오도록 주시점을 플레이어-고리
  // 중간쯤으로 옮긴다 (설계 문서 2.3-6).
  if (game.state === 'swinging' && game.anchor) {
    const a = game.anchor;
    desiredLook = {
      x: (p.x + a.x) / 2,
      y: (p.y + a.y) / 2,
      z: (p.z + a.z) / 2,
    };
  }

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
  const rawDt = clock.getDelta();
  const t = clock.getElapsedTime();

  if (rawDt > MAX_FRAME_DT) {
    // 큰 정지(최초 로드의 셰이더 컴파일, 탭 백그라운드 복귀 등) — 밀린 시간을
    // 몰아서 재생(fast-forward)하면 입력할 틈도 없이 게임이 먼저 진행돼
    // 버린다. 대신 그 시간은 버리고 지금부터 다시 시작한다.
    accumulator = 0;
  } else {
    accumulator += rawDt;
  }
  const frameDt = Math.min(rawDt, FIXED_DT * MAX_STEPS_PER_FRAME);

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    Physics.step(game, FIXED_DT, input);
    accumulator -= FIXED_DT;
    steps++;
  }

  player.position.set(game.player.pos.x, game.player.pos.y, game.player.pos.z);
  syncRingMeshes();

  if (game.state === 'falling') {
    camera.getWorldDirection(camForward);
    const target = Physics.pickTarget(game, { x: camForward.x, y: camForward.y, z: camForward.z });
    if (target) {
      aimMarker.visible = true;
      aimMarker.position.set(target.x, target.y, target.z);
      aimMarker.rotation.y = Math.PI / 2;
    } else {
      aimMarker.visible = false;
    }
    arm.visible = false;
  } else if (game.state === 'swinging' && game.anchor) {
    aimMarker.visible = false;
    arm.visible = true;
    const positions = arm.geometry.attributes.position;
    positions.setXYZ(0, game.player.pos.x, game.player.pos.y, game.player.pos.z);
    positions.setXYZ(1, game.anchor.x, game.anchor.y, game.anchor.z);
    positions.needsUpdate = true;
  } else {
    aimMarker.visible = false;
    arm.visible = false;
  }

  updateCamera(frameDt);
  updateSea(t);
  updateHud();

  renderer.render(scene, camera);
}

boot.classList.add('hidden');
animate();
