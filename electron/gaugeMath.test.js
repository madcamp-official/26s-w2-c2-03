// gaugeMath 순수 산식 검증. 실행: node gaugeMath.test.js
const assert = require('node:assert');
const { nextGauge } = require('./gaugeMath');

function run(startGauge, activePattern) {
  let s = { gauge: startGauge, activeStreak: 0, idleStreak: 0 };
  for (const active of activePattern) s = nextGauge(s, active);
  return s;
}

// 1) 짧은 활동 1 tick은 소폭(+1)만 — "천천히"
{
  const s = nextGauge({ gauge: 50, activeStreak: 0, idleStreak: 0 }, true);
  assert.strictEqual(s.gauge, 51, '활동 첫 tick은 +1');
  assert.strictEqual(s.activeStreak, 1);
}

// 2) 활동이 이어질수록 상승폭이 커진다(가속) — 집중 길수록 빠르게
{
  const oneTick = nextGauge({ gauge: 50, activeStreak: 0, idleStreak: 0 }, true).gauge - 50; // +1
  const later = run(50, Array(6).fill(true)); // 6 tick 연속 활동
  const sixthStep = nextGauge({ gauge: later.gauge, activeStreak: later.activeStreak, idleStreak: 0 }, true).step;
  assert.ok(sixthStep > oneTick, '연속 활동일수록 tick당 상승폭이 커져야 함');
}

// 3) 유휴가 이어질수록 하강폭이 커진다(점진 가속) — 이탈 길수록
{
  const firstDrop = nextGauge({ gauge: 80, activeStreak: 0, idleStreak: 0 }, false).step; // -0.6
  const afterIdle = run(80, Array(5).fill(false));
  const sixthDrop = nextGauge({ gauge: afterIdle.gauge, activeStreak: 0, idleStreak: afterIdle.idleStreak }, false).step;
  assert.ok(sixthDrop < firstDrop, '연속 유휴일수록 tick당 하강폭이 커져야 함(더 음수)');
  assert.ok(Math.abs(firstDrop) < 1, '첫 하강은 1 미만으로 작게 시작');
}

// 4) 0~100 클램프
{
  const high = run(98, Array(20).fill(true));
  assert.strictEqual(high.gauge, 100, '상한 100');
  const low = run(3, Array(20).fill(false));
  assert.strictEqual(low.gauge, 0, '하한 0');
}

// 5) 방향이 바뀌면 반대 streak는 리셋
{
  const s1 = run(50, [true, true, true]);
  assert.strictEqual(s1.idleStreak, 0);
  const s2 = nextGauge(s1, false);
  assert.strictEqual(s2.activeStreak, 0, '유휴로 전환 시 activeStreak 리셋');
  assert.strictEqual(s2.idleStreak, 1);
}

// 6) intensity(입력의 질)가 낮으면 상승폭이 줄고, 하강엔 영향 없다
{
  const full = nextGauge({ gauge: 50, activeStreak: 0, idleStreak: 0 }, true, undefined, 1).step;
  const half = nextGauge({ gauge: 50, activeStreak: 0, idleStreak: 0 }, true, undefined, 0.5).step;
  assert.ok(half < full && half > 0, 'intensity 0.5면 상승폭이 절반 정도로 줄어야 함');
  const dropFull = nextGauge({ gauge: 50, activeStreak: 0, idleStreak: 0 }, false, undefined, 1).step;
  const dropLow = nextGauge({ gauge: 50, activeStreak: 0, idleStreak: 0 }, false, undefined, 0.2).step;
  assert.strictEqual(dropFull, dropLow, '하강폭은 intensity와 무관');
}

console.log('gaugeMath.test.js: 모든 검증 통과 ✅');
