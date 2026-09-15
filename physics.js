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
  const REACH = 14.1;      // m, 팔 사거리
  const REEL_MIN = 3.36;   // m, 줄 최소 길이 하한
  const ZIP = 2.09;        // m, 수동 감기 하한 (M3)
  const STRETCH = 1.40;    // 배율, rest 대비 팔이 늘어나는 한계

  // K1/K2/DAMP/REEL은 설계 문서 3.1의 환산표에 없고 3.2절 수식에만 등장한다.
  // 원작 2D는 60fps 프레임마다 이 값을 속도에 직접 더하는 방식(= 시간을
  // "1프레임" 단위로 취급)이라, 연속시간(m, s) 물리로 옮기려면 프레임 단위가
  // 숨어있는 자리마다 별도로 환산해야 한다 (GRAV류의 px/f² 환산과는 다른 축).
  //   K1[[frame^-2] -> [s^-2]]        : ×60² = ×3600
  //   K2[[frame^-2 px^-1] -> [s^-2 m^-1]] : ×3600 ×22
  //   DAMP[[frame^-1] -> [s^-1]]      : ×60
  //   REEL[[px/frame] -> [m/s]]       : ÷22 ×60
  const K1 = 0.040 * 3600;            // = 144
  const K2 = 0.0018 * 3600 * 22;      // = 142.56
  const DAMP = 0.085 * 60;            // = 5.1
  const REEL = (0.30 / 22) * 60;      // ≈ 0.818

  const LANE_HALF_WIDTH = 25;  // m, 항로 Z 제한
  const RING_LANE_HALF_WIDTH = 18; // m, 고리가 실제로 뿌려지는 폭 (2.2절)
  const LANE_SOFT_PUSH = 40;   // m/s^2, 항로 밖으로 나갔을 때 되미는 가속도
  const PLAYER_RADIUS = 0.6;   // m

  // ZIP(2.09m)까지 수동으로 감을 때의 속도. 설계 문서는 하한값만 주고 속도는
  // 안 줘서, REEL(자동 감기)의 3배로 임시로 잡음 — 느낌 확인 후 조정 필요.
  const ZIP_REEL = REEL * 3;
  // ↑로 "도약하며 놓기"할 때 얹어주는 수직 속도. 설계 문서에 수치가 없어
  // 임시로 잡은 값 — 느낌 확인 후 조정 필요.
  const JUMP_BOOST = 14;

  const AIM_CONE_DEG = 35;                                  // 조준 원뿔 반각
  const AIM_CONE_COS = Math.cos(AIM_CONE_DEG * Math.PI / 180);
  const AIM_WEIGHT_ANGLE = 0.6;
  const AIM_WEIGHT_DIST = 0.4;

  const RING_LOOKAHEAD = 24;   // m, 플레이어 앞쪽 이 거리 안이면 다음 고리를 미리 스폰
  const RING_DESPAWN_BEHIND = 30; // m, 플레이어보다 이만큼 뒤처지면 제거
  const RING_DIFFICULTY_DISTANCE = 1500; // m, t=1이 되는 거리

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

  // ---- 시드 가능한 RNG (mulberry32) — 봇 재현성을 위해 Math.random() 대신 사용 ----
  function makeRng(seed) {
    let a = seed >>> 0;
    return function rng() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 고리 생성 (설계 문서 5절, 절차적 · 앞쪽으로 계속 채움) ----
  let nextRingId = 1;

  function spawnNextRing(game) {
    const prev = game.rings[game.rings.length - 1];
    if (!prev) {
      // 시작 고리는 절차 생성 대신 고정 배치. 플레이어보다 살짝 위쪽에 둬서
      // 첫 스윙이 "슬랙 상태로 그냥 낙하"하지 않게 하되, 조준 원뿔(반각 35°)
      // 안에 들어오도록 고도차를 완만하게 잡는다 — 카메라가 플레이어와 거의
      // 수평으로 정렬돼 있어서 너무 가파르게 위에 두면 아예 조준이 안 된다.
      // 시작 연출 자체는 section 12 미정 항목, 임시 처리.
      game.rings.push({ id: nextRingId++, x: 12, y: 14.5, z: 0, kind: 'mast' });
      return;
    }
    const t = clamp(game.distance / RING_DIFFICULTY_DISTANCE, 0, 1);
    const spacing = Math.min(15.5, (8.0 + t * 4.7) + game.rng() * (2.8 + t * 1.2));
    const baseHeight = 9.9 + t * 5.4;
    const wobble = (game.rng() * 2 - 1) * 2.2;
    const height = baseHeight * 0.68 + prev.y * 0.32 + wobble;
    const x = prev.x + spacing;
    const z = (game.rng() * 2 - 1) * RING_LANE_HALF_WIDTH;
    const kind = game.rng() < 0.62 ? 'mast' : 'rock';
    game.rings.push({ id: nextRingId++, x, y: Math.max(4, height), z, kind });
  }

  function ensureRingsAhead(game) {
    if (game.rings.length === 0) {
      spawnNextRing(game);
    }
    while (game.rings[game.rings.length - 1].x - game.player.pos.x < RING_LOOKAHEAD) {
      spawnNextRing(game);
    }
    while (game.rings.length && game.rings[0].x < game.player.pos.x - RING_DESPAWN_BEHIND) {
      game.rings.shift();
    }
  }

  // forward: {x,y,z} 정규화된 조준 방향 (렌더러가 카메라 기준으로 넘겨줌;
  // 카메라 좌우 둘러보기가 없다면 월드 +X를 그대로 써도 된다)
  function pickTarget(game, forward) {
    const p = game.player.pos;
    const fwd = vecNorm(forward);
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < game.rings.length; i++) {
      const ring = game.rings[i];
      if (ring.x <= p.x) continue;
      const toRing = { x: ring.x - p.x, y: ring.y - p.y, z: ring.z - p.z };
      const dist = vecLen(toRing);
      if (dist > REACH || dist < 1e-6) continue;
      const cos = vecDot(vecScale(toRing, 1 / dist), fwd);
      if (cos < AIM_CONE_COS) continue;
      const angle = Math.acos(clamp(cos, -1, 1));
      const score = (angle / (AIM_CONE_DEG * Math.PI / 180)) * AIM_WEIGHT_ANGLE + (dist / REACH) * AIM_WEIGHT_DIST;
      if (score < bestScore) { bestScore = score; best = ring; }
    }
    return best;
  }

  function tryAttach(game, ring) {
    if (!ring || game.state !== 'falling') return false;
    const dist = vecLen(vecSub(ring, game.player.pos));
    if (dist > REACH) return false;
    game.state = 'swinging';
    game.anchor = { x: ring.x, y: ring.y, z: ring.z };
    game.rest = dist;
    return true;
  }

  // boost: 선택적 {x,y,z} — "도약하며 놓기"(↑)처럼 놓는 순간 속도에 더해줄 값
  function release(game, boost) {
    if (game.state === 'swinging') {
      game.state = 'falling';
      game.anchor = null;
      game.rest = 0;
      if (boost) game.player.vel = vecAdd(game.player.vel, boost);
    }
  }

  function createGame(opts) {
    opts = opts || {};
    const startY = opts.startY != null ? opts.startY : 12;
    // 시작 연출(발판에서 뛰어내리기 등)은 아직 미정 — 첫 고리에 스윙으로
    // 자연스럽게 이어지도록 임시로 전진 속도를 부여해 둔다. section 12 열린 항목.
    const startVX = opts.startVX != null ? opts.startVX : 20;
    return {
      t: 0,
      distance: 0,
      treasure: 0,
      state: 'falling', // falling | swinging | dead
      deathReason: null,
      rng: makeRng(opts.seed != null ? opts.seed : 1),
      rings: [],
      anchor: null,
      rest: 0,
      player: {
        pos: { x: 0, y: startY, z: 0 },
        vel: { x: startVX, y: 0, z: 0 },
      },
    };
  }

  // input: { left, right, down, up, rightDir } — left/right/down/up은 불리언.
  // rightDir은 {x,y,z} — 카메라의 "오른쪽" 방향(월드 좌표). 펌핑은 이 방향을
  // 밧줄에 수직으로 투영해 접선 방향을 구하므로 렌더러가 매 프레임 넘겨줘야
  // 한다 (3.3절: "방향키는 카메라 기준 좌우로 해석").
  function step(game, dt, input) {
    input = input || {};
    dt = clamp(dt, 0, MAX_DT);
    if (dt <= 0) return game;
    game.t += dt;

    if (game.state === 'dead') return game;

    ensureRingsAhead(game);

    const p = game.player;

    if (game.state === 'falling') {
      p.vel.y -= GRAV * dt;
      if (input.left) p.vel.z -= AIR * dt;
      if (input.right) p.vel.z += AIR * dt;
      if (input.down) p.vel.y -= DIVE * dt;
    } else if (game.state === 'swinging') {
      p.vel.y -= GRAV * dt;

      const toAnchor = vecSub(game.anchor, p.pos); // player -> anchor
      const len = vecLen(toAnchor);
      if (len > 1e-6) {
        const dir = vecScale(toAnchor, 1 / len);

        // 펌핑: 밧줄과 수직인 접선 방향으로만 힘을 준다 (지름 방향 성분은 제거)
        if ((input.left || input.right) && input.rightDir) {
          const rd = input.rightDir;
          const rdRadial = vecDot(rd, dir);
          const tangent = vecNorm(vecSub(rd, vecScale(dir, rdRadial)));
          const sign = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          p.vel = vecAdd(p.vel, vecScale(tangent, PUMP * sign * dt));
        }

        const ext = len - game.rest;
        if (ext > 0) {
          const k = K1 + K2 * ext;
          const springAccel = k * ext;
          p.vel = vecAdd(p.vel, vecScale(dir, springAccel * dt));

          const vRadial = vecDot(p.vel, dir); // +면 anchor 쪽으로 이동 중
          const dampAccel = -DAMP * vRadial;
          p.vel = vecAdd(p.vel, vecScale(dir, dampAccel * dt));
        }
      }

      // 감기 — ↓를 누르고 있으면 ZIP까지, 아니면 REEL_MIN까지만
      // (REEL_MIN 밑으로 자동으로는 절대 안 줄어든다 — 2D 버그 #2 재현 금지)
      if (input.down) {
        game.rest = Math.max(ZIP, game.rest - ZIP_REEL * dt);
      } else {
        game.rest = Math.max(REEL_MIN, game.rest - REEL * dt);
      }
    }

    const speed = vecLen(p.vel);
    if (speed > MAXV) p.vel = vecScale(p.vel, MAXV / speed);

    p.pos = vecAdd(p.pos, vecScale(p.vel, dt));

    if (game.state === 'swinging') {
      const fromAnchor = vecSub(p.pos, game.anchor); // anchor -> player
      const newLen = vecLen(fromAnchor);
      const maxLen = game.rest * STRETCH;
      if (newLen > maxLen && newLen > 1e-6) {
        const dirOut = vecScale(fromAnchor, 1 / newLen);
        p.pos = vecAdd(game.anchor, vecScale(dirOut, maxLen));
        const vOut = vecDot(p.vel, dirOut);
        if (vOut > 0) {
          p.vel = vecSub(p.vel, vecScale(dirOut, vOut));
        }
      }
    }

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

    return game;
  }

  return {
    GRAV, MAXV, AIR, PUMP, DIVE, REACH, REEL_MIN, ZIP, STRETCH, K1, K2, DAMP, REEL,
    ZIP_REEL, JUMP_BOOST,
    LANE_HALF_WIDTH, RING_LANE_HALF_WIDTH, PLAYER_RADIUS, MAX_DT, AIM_CONE_DEG,
    vecAdd, vecSub, vecScale, vecLen, vecNorm, vecDot, clamp, makeRng,
    pickTarget, tryAttach, release,
    createGame, step,
  };
});
