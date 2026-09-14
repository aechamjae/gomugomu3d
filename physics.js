// physics.js — 순수 물리/게임 로직. three.js도 DOM도 건드리지 않는다.
// 벡터는 {x,y,z} 평범한 객체로 다룬다. Node에서 그대로 불러 봇을 돌릴 수 있어야 한다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Physics = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- 상수 (설계 문서 3.1 환산표 그대로. 임의로 현실값으로 바꾸지 말 것) ----
  const GRAV = 58.9;       // m/s^2, 중력. 현실의 약 6배 — 의도된 아케이드 물리
  const MAXV = 73.6;       // m/s, 속도 상한
  const AIR = 24.5;        // m/s^2, 공중 좌우 조작 가속도
  const PUMP = 18.8;       // m/s^2, 진자 펌핑 가속도 (M3)
  const DIVE = 49.1;       // m/s^2, 급강하 가속도
  const REACH = 14.1;      // m, 팔 사거리 (M2)
  const REEL_MIN = 3.36;   // m, 줄 최소 길이 하한 (M2)
  const ZIP = 2.09;        // m, 수동 감기 하한 (M2)
  const STRETCH = 1.40;    // 배율, rest 대비 팔이 늘어나는 한계 (M2)
  const K1 = 0.040;        // 스프링 계수 (무차원) (M2)
  const K2 = 0.0396;       // 스프링 계수, m^-1 (2D 0.0018 px^-1 * 22 px/m) (M2)
  const DAMP = 0.085;      // 지름 방향 감쇠 계수 (M2)
  const REEL = 0.30;       // m/s, 자동 감기 속도 (M2)

  const LANE_HALF_WIDTH = 25; // m, 항로 Z 제한
  const LANE_SOFT_PUSH = 40;  // m/s^2, 항로 밖으로 나갔을 때 되미는 가속도
  const PLAYER_RADIUS = 0.6;  // m

  const MAX_DT = 1 / 30; // 초. 탭이 백그라운드에 있다 돌아왔을 때 통과(터널링) 방지

  function vecAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function vecScale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function vecLen(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
  function vecNorm(a) {
    const l = vecLen(a);
    return l > 1e-8 ? vecScale(a, 1 / l) : { x: 0, y: 0, z: 0 };
  }
  function vecDot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function createGame(opts) {
    opts = opts || {};
    const startY = opts.startY != null ? opts.startY : 20;
    return {
      t: 0,
      distance: 0,
      treasure: 0,
      state: 'falling', // falling | dead  (M2에서 swinging 추가)
      deathReason: null,
      player: {
        pos: { x: 0, y: startY, z: 0 },
        vel: { x: 0, y: 0, z: 0 },
      },
    };
  }

  // input: { left, right, down, up } — 불리언. 좌우는 호출부(렌더러)가
  // 카메라 기준으로 이미 부호를 정해 넘겨준다.
  function step(game, dt, input) {
    input = input || {};
    dt = clamp(dt, 0, MAX_DT);
    if (dt <= 0) return game;
    game.t += dt;

    if (game.state === 'dead') return game;

    const p = game.player;

    if (game.state === 'falling') {
      p.vel.y -= GRAV * dt;
      if (input.left) p.vel.z -= AIR * dt;
      if (input.right) p.vel.z += AIR * dt;
      if (input.down) p.vel.y -= DIVE * dt;

      const speed = vecLen(p.vel);
      if (speed > MAXV) {
        p.vel = vecScale(p.vel, MAXV / speed);
      }

      p.pos = vecAdd(p.pos, vecScale(p.vel, dt));

      if (p.pos.z > LANE_HALF_WIDTH) {
        const over = p.pos.z - LANE_HALF_WIDTH;
        p.vel.z -= LANE_SOFT_PUSH * dt * (1 + over * 0.1);
      } else if (p.pos.z < -LANE_HALF_WIDTH) {
        const over = -LANE_HALF_WIDTH - p.pos.z;
        p.vel.z += LANE_SOFT_PUSH * dt * (1 + over * 0.1);
      }

      if (p.pos.x > game.distance) game.distance = p.pos.x;

      if (p.pos.y - PLAYER_RADIUS <= 0) {
        p.pos.y = PLAYER_RADIUS;
        p.vel = { x: 0, y: 0, z: 0 };
        game.state = 'dead';
        game.deathReason = 'water';
      }
    }

    return game;
  }

  return {
    GRAV, MAXV, AIR, PUMP, DIVE, REACH, REEL_MIN, ZIP, STRETCH, K1, K2, DAMP, REEL,
    LANE_HALF_WIDTH, PLAYER_RADIUS, MAX_DT,
    vecAdd, vecSub, vecScale, vecLen, vecNorm, vecDot, clamp,
    createGame, step,
  };
});
