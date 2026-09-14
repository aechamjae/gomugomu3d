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

// ---- 리사이즈 ----
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ---- 루프 ----
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  updateSea(t);
  renderer.render(scene, camera);
}

boot.classList.add('hidden');
animate();
