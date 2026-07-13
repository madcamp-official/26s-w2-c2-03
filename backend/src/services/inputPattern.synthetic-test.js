// inputPattern 검증. 실행: node src/services/inputPattern.synthetic-test.js
import assert from 'node:assert';
import { scoreInputWindow } from './inputPattern.js';

const NOW = 1_000_000_000_000;
const WIN = 60_000;

// 60초 창을 gapMs 간격의 keydown으로 꽉 채운다(규칙적 타이핑).
function steadyTyping(gapMs) {
  const events = [];
  for (let t = NOW - WIN + gapMs; t <= NOW; t += gapMs) events.push({ type: 'keydown', t });
  return events;
}

// 규칙적 타이핑(빠르고 꾸준) → 높은 점수
const steady = scoreInputWindow(steadyTyping(150), NOW, WIN);
assert.ok(steady.score >= 70, `규칙적 빠른 타이핑은 높은 점수여야 함(got ${steady.score})`);

// 산발적 클릭 몇 번 → 낮은 점수
const sparse = scoreInputWindow(
  [0, 12000, 30000, 55000].map((off) => ({ type: 'click', t: NOW - WIN + off })),
  NOW, WIN,
);
assert.ok(sparse.score <= 25, `산발적 클릭은 낮은 점수여야 함(got ${sparse.score})`);
assert.ok(steady.score > sparse.score, '규칙적 타이핑 > 산발적 클릭');

// 이벤트 없음 → 0
assert.strictEqual(scoreInputWindow([], NOW, WIN).score, 0, '입력 없으면 0');

// 규칙적(CV≈0) vs 들쭉날쭉(같은 개수인데 간격 불규칙) → 규칙적이 리듬 점수 높아 더 큼
function erraticTyping(count) {
  const events = [];
  let t = NOW - WIN + 100;
  for (let i = 0; i < count; i += 1) {
    events.push({ type: 'keydown', t });
    t += (i % 2 === 0) ? 50 : 1800; // 짧게-길게 번갈아 = 높은 CV
    if (t > NOW) break;
  }
  return events;
}
const nKeys = steadyTyping(400).length;
const steady400 = scoreInputWindow(steadyTyping(400), NOW, WIN);
const erratic = scoreInputWindow(erraticTyping(nKeys), NOW, WIN);
assert.ok(steady400.score > erratic.score, `규칙적 리듬 > 들쭉날쭉(steady ${steady400.score} vs erratic ${erratic.score})`);

console.log('inputPattern.synthetic-test.js: 모든 검증 통과 ✅');
