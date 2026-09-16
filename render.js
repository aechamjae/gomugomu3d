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
// 특정 작품의 캐릭터를 그대로 옮기지 않는다(기획 문서 1절) — "고무처럼
// 늘어나는 팔을 쓰는 해적"이라는 컨셉만 가져온 범용 실루엣.
const player = new THREE.Group();
{
  const R = Physics.PLAYER_RADIUS;
  const vestMat = new THREE.MeshStandardMaterial({ color: 0xd23b2e, roughness: 0.55 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffc98e, roughness: 0.6 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0x2b3a67, roughness: 0.8 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xe4c878, roughness: 0.9 });

  const torso = new THREE.Mesh(new THREE.SphereGeometry(R * 0.85, 14, 12), vestMat);
  torso.scale.set(1, 1.15, 1);
  player.add(torso);

  const shorts = new THREE.Mesh(new THREE.SphereGeometry(R * 0.78, 12, 10), shortsMat);
  shorts.scale.set(1, 0.5, 1);
  shorts.position.y = -R * 0.65;
  player.add(shorts);

  const head = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, 14, 12), skinMat);
  head.position.y = R * 1.05;
  player.add(head);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, R * 0.12, 14), hatMat);
  hatBrim.position.y = R * 1.32;
  player.add(hatBrim);
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.62, R * 0.55, 14), hatMat);
  hatTop.position.y = R * 1.32 + R * 0.33;
  player.add(hatTop);

  const armGeo = new THREE.CapsuleGeometry(R * 0.18, R * 0.5, 4, 8);
  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(0, R * 0.05, R * 0.78);
  armL.rotation.x = Math.PI / 2.3;
  player.add(armL);
  const armR = new THREE.Mesh(armGeo, skinMat);
  armR.position.set(0, R * 0.05, -R * 0.78);
  armR.rotation.x = -Math.PI / 2.3;
  player.add(armR);
}
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
    // 꼭대기를 고리 반지름(0.55)보다 가늘게 좁혀서 걸쇠가 바위에 파묻히지
    // 않고 마스트처럼 도드라져 보이게 한다 — 안 그러면 "저건 그냥 장애물인가"
    // 싶은 모양이 됨 (실제 플레이 피드백으로 발견).
    const rockHeight = poleHeight + 3;
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.6, rockHeight, 7), poleMat);
    rock.position.y = poleHeight - rockHeight / 2;
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

// ---- 금화 (5절: 고리 사이 50% 확률) ----
const coinMeshes = new Map(); // coin.id -> THREE.Mesh
const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd54a, metalness: 0.6, roughness: 0.3 });

function syncCoinMeshes() {
  const liveIds = new Set();
  for (const coin of game.coins) {
    liveIds.add(coin.id);
    if (!coinMeshes.has(coin.id)) {
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.position.set(coin.x, coin.y, coin.z);
      mesh.rotation.x = Math.PI / 2;
      coinMeshes.set(coin.id, mesh);
      scene.add(mesh);
    }
  }
  for (const [id, mesh] of coinMeshes) {
    if (!liveIds.has(id)) {
      scene.remove(mesh);
      coinMeshes.delete(id);
    }
  }
}

function updateCoinSpin(t) {
  for (const mesh of coinMeshes.values()) {
    mesh.rotation.y = t * 2.4;
  }
}

// ---- 배경 함선 — 순수 장식, 게임플레이에 관여하지 않음 (4절: "게임처럼 보임") ----
const shipMeshes = new Map(); // segment index -> THREE.Group
const SHIP_SPACING = 90; // m, 이 간격마다 한 척씩
const SHIP_LOOKAHEAD = 260;
const SHIP_DESPAWN_BEHIND = 120;

function hashToUnit(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function buildShipMesh(seg) {
  const side = hashToUnit(seg) < 0.5 ? -1 : 1;
  const z = side * (34 + hashToUnit(seg + 0.5) * 30);
  const scale = 0.8 + hashToUnit(seg + 0.25) * 0.7;

  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.9 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.85 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 3), hullMat);
  hull.position.y = 0.4;
  group.add(hull);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), hullMat);
  mast.position.y = 3.9;
  group.add(mast);

  const sail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 2.2), sailMat);
  sail.position.set(0, 4.2, 0);
  group.add(sail);

  group.scale.setScalar(scale);
  group.position.set(seg * SHIP_SPACING + hashToUnit(seg) * 20, 0, z);
  group.rotation.y = (hashToUnit(seg + 0.75) - 0.5) * 0.6;
  return group;
}

function syncShipMeshes() {
  const centerSeg = Math.floor(game.player.pos.x / SHIP_SPACING);
  const span = Math.ceil(SHIP_LOOKAHEAD / SHIP_SPACING);
  const liveSegs = new Set();
  for (let s = centerSeg - 1; s <= centerSeg + span; s++) {
    liveSegs.add(s);
    if (!shipMeshes.has(s)) {
      const mesh = buildShipMesh(s);
      shipMeshes.set(s, mesh);
      scene.add(mesh);
    }
  }
  for (const [seg, mesh] of shipMeshes) {
    if (!liveSegs.has(seg) || mesh.position.x < game.player.pos.x - SHIP_DESPAWN_BEHIND) {
      scene.remove(mesh);
      shipMeshes.delete(seg);
    }
  }
}

// ---- 식인 물고기 — 즉사 아님, 스치면 가볍게 휘청 (5절) ----
const fishMeshes = new Map(); // fish.id -> THREE.Group
const fishMat = new THREE.MeshStandardMaterial({ color: 0x8fa6ad, roughness: 0.5, metalness: 0.2 });

function buildFishMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.3, 8), fishMat);
  body.rotation.z = -Math.PI / 2;
  group.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 6), fishMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = 0.85;
  group.add(tail);
  return group;
}

function syncFishMeshes(t) {
  const liveIds = new Set();
  for (const fish of game.fish) {
    liveIds.add(fish.id);
    let mesh = fishMeshes.get(fish.id);
    if (!mesh) {
      mesh = buildFishMesh();
      fishMeshes.set(fish.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(fish.x, fish.y + Math.sin(t * 3 + fish.id) * 0.25, fish.z);
    mesh.rotation.y = Math.sin(t * 2 + fish.id) * 0.4;
  }
  for (const [id, mesh] of fishMeshes) {
    if (!liveIds.has(id)) {
      scene.remove(mesh);
      fishMeshes.delete(id);
    }
  }
}

// ---- 해왕류 — 경고 → 솟구침 → 닿으면 즉사 (5절) ----
const monsterMat = new THREE.MeshStandardMaterial({ color: 0x1f3d2b, roughness: 0.7 });
const monsterGroup = new THREE.Group();
const monsterNeck = new THREE.Mesh(
  new THREE.CylinderGeometry(Physics.MONSTER_NECK_RADIUS * 0.55, Physics.MONSTER_NECK_RADIUS, Physics.MONSTER_HEIGHT, 10),
  monsterMat
);
monsterNeck.position.y = Physics.MONSTER_HEIGHT / 2;
monsterGroup.add(monsterNeck);
const monsterHead = new THREE.Mesh(new THREE.SphereGeometry(Physics.MONSTER_NECK_RADIUS * 0.7, 12, 10), monsterMat);
monsterHead.position.y = Physics.MONSTER_HEIGHT;
monsterGroup.add(monsterHead);
monsterGroup.visible = false;
scene.add(monsterGroup);

function updateMonster() {
  const m = game.monster;
  if (!m || !m.risen) {
    monsterGroup.visible = false;
    return;
  }
  monsterGroup.visible = true;
  monsterGroup.position.set(m.x, 0, m.z);
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
const camRight = new THREE.Vector3();

// ---- 입력 ----
const input = { left: false, right: false, down: false, up: false, rightDir: null };
const KEY_MAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'up' };

function attemptAttach() {
  // 죽은 상태에서 Space/클릭/터치로 바로 다시 시작 — R키만 따로 있는 건
  // 흐름이 끊기고 터치에서는 대응할 키가 없음 (실제 플레이 피드백).
  if (game.state === 'dead') { restart(); return; }
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

// ---- 터치: 화면 드래그로 카메라 좌우 둘러보기, 버튼은 따로 처리 ----
// (탭=고무팔로 하면 "먼저 둘러보고 나서 건다"가 안 돼서, 조준은 드래그로만
// 하고 고무팔은 전용 버튼으로 분리했다)
function isTouchUiTarget(el) {
  return !!(el && el.closest && el.closest('.touch-btn'));
}
let lookTouchId = null;
let lookLastX = 0;
const TOUCH_LOOK_SENSITIVITY = 0.006; // 라디안/px

window.addEventListener('touchstart', (e) => {
  if (game.state === 'dead') restart();
  for (const t of e.changedTouches) {
    if (isTouchUiTarget(t.target)) continue;
    if (lookTouchId === null) {
      lookTouchId = t.identifier;
      lookLastX = t.clientX;
    }
  }
  e.preventDefault();
}, { passive: false });

window.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) {
      const dx = t.clientX - lookLastX;
      lookLastX = t.clientX;
      lookYawTarget = Physics.clamp(lookYawTarget + dx * TOUCH_LOOK_SENSITIVITY, -MAX_LOOK_YAW, MAX_LOOK_YAW);
    }
  }
  e.preventDefault();
}, { passive: false });

window.addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) lookTouchId = null;
  }
}, { passive: false });

// ---- 터치 버튼: 전부 홀드형 (누르는 동안 입력, 떼면 해제) ----
function bindHoldButton(el, onDown, onUp) {
  if (!el) return;
  const down = (e) => { e.preventDefault(); e.stopPropagation(); onDown(); };
  const up = (e) => { e.preventDefault(); e.stopPropagation(); onUp(); };
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('touchend', up, { passive: false });
  el.addEventListener('touchcancel', up, { passive: false });
  el.addEventListener('mousedown', down);
  el.addEventListener('mouseup', up);
  el.addEventListener('mouseleave', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindHoldButton(document.getElementById('btn-left'), () => { input.left = true; }, () => { input.left = false; });
bindHoldButton(document.getElementById('btn-right'), () => { input.right = true; }, () => { input.right = false; });
bindHoldButton(document.getElementById('btn-down'), () => { input.down = true; }, () => { input.down = false; });
bindHoldButton(document.getElementById('btn-up'), () => { input.up = true; }, () => { input.up = false; });
bindHoldButton(document.getElementById('btn-grab'), attemptAttach, attemptRelease);

// 터치 기기 판별 — 둘 중 하나만 보고 판단하면 외장 키보드가 붙은
// 아이패드에서 pointer:fine으로 잡혀 터치 버튼이 숨어버릴 수 있음 (설계
// 문서 10절 버그 #8), 그래서 둘 다 확인해서 하나라도 맞으면 켠다.
const isTouchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
if (isTouchCapable) document.body.classList.add('touch-capable');

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
    const msg = game.deathReason === 'monster' ? '해왕류에게 붙잡혔다!' : '풍덩!';
    statusEl.innerHTML = `<div class="msg">${msg}</div><div class="hint">Space/클릭/터치로 다시 시작</div>`;
  } else if (game.monster && game.monster.warned && !game.monster.risen) {
    statusEl.innerHTML = '<div class="msg warn">전방에 해왕류 출현!</div>';
  } else {
    statusEl.innerHTML = '';
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

// 마우스로 카메라를 좌우 ±20° 둘러보기 (포인터 락 없음, 설계 문서 2.4).
// 이게 없으면 화면 중앙에서 벗어난 고리는 조준 원뿔에 아예 안 걸려서
// 다음 고리로 못 넘어가는 문제가 있었음 (실제 플레이 피드백).
const MAX_LOOK_YAW = 20 * Math.PI / 180;
let lookYawTarget = 0; // 입력이 곧바로 반영되는 목표값
let lookYaw = 0;       // 실제 카메라에 적용되는, 매 프레임 목표값을 향해 부드럽게 따라가는 값
const LOOK_YAW_SMOOTH_RATE = 0.15; // 60fps 기준 프레임당 보간 비율 — 마우스가 살짝만
                                    // 움직여도 시점이 툭툭 꺾이던 것을 완화 (실제 플레이 피드백)
window.addEventListener('mousemove', (e) => {
  const nx = Physics.clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
  lookYawTarget = nx * MAX_LOOK_YAW;
});
const yawedLook = new THREE.Vector3();
const lookOffset = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

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

  // 마우스/터치로 정한 목표 각도를 그대로 적용하면 살짝만 움직여도 시점이
  // 툭 꺾여서 "부자연스럽다"는 피드백이 있었음 — 여기도 지수 감쇠로 완화.
  const yawFactor = 1 - Math.pow(1 - LOOK_YAW_SMOOTH_RATE, dt * 60);
  lookYaw += (lookYawTarget - lookYaw) * yawFactor;

  camera.up.set(0, 1, 0);
  camera.position.copy(camPos);
  lookOffset.subVectors(camLook, camPos);
  lookOffset.applyAxisAngle(WORLD_UP, lookYaw);
  yawedLook.addVectors(camPos, lookOffset);
  camera.lookAt(yawedLook);

  // FOV도 즉시 바꾸면 속도가 오르내릴 때마다(스프링 진동 등) 화면이
  // 깜빡이듯 확대·축소되는 느낌이 나서 같은 방식으로 부드럽게 따라가게 함.
  const targetFov = THREE.MathUtils.lerp(FOV_MIN, FOV_MAX, speedT);
  camera.fov += (targetFov - camera.fov) * factor;
  camera.updateProjectionMatrix();
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

  // 펌핑용 "카메라 오른쪽" 방향 — 매달린 동안 매 프레임 갱신
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  input.rightDir = { x: camRight.x, y: camRight.y, z: camRight.z };

  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    Physics.step(game, FIXED_DT, input);
    accumulator -= FIXED_DT;
    steps++;
  }

  player.position.set(game.player.pos.x, game.player.pos.y, game.player.pos.z);
  syncRingMeshes();
  syncCoinMeshes();
  syncShipMeshes();
  syncFishMeshes(t);
  updateMonster();
  updateCoinSpin(t);

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
