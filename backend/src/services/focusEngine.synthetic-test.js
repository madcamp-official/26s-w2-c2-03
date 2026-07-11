// focusEngine.js 검증용 스크립트. 실제 os-tracker/활성 창 데이터 없이,
// 가짜(합성) 이벤트 시퀀스로 시나리오별 동작을 확인한다.
// 실행: node src/services/focusEngine.synthetic-test.js (backend 폴더에서)

import assert from 'node:assert/strict';
import { createInitialFocusState, tickFocusState, classifyWindow } from './focusEngine.js';

const MINUTE = 60000;
const WORK_WINDOW = { appName: 'Code', windowTitle: 'focusEngine.js — os-tracker' };
const DISTRACTION_WINDOW = { appName: 'Google Chrome', windowTitle: 'YouTube', url: 'https://www.youtube.com/watch?v=abc' };
const NEUTRAL_WINDOW = { appName: 'Slack', windowTitle: '#general' };

function runTicks(startState, samples, currentTask) {
  let state = startState;
  const allAlerts = [];
  for (const sample of samples) {
    state = tickFocusState(state, sample, currentTask);
    allAlerts.push(...state.alerts);
  }
  return { state, allAlerts };
}

// ---- classifyWindow 단위 테스트 ----
assert.equal(classifyWindow(WORK_WINDOW), 'work');
assert.equal(classifyWindow(DISTRACTION_WINDOW), 'distraction');
assert.equal(classifyWindow(NEUTRAL_WINDOW), 'neutral');
assert.equal(classifyWindow(null), 'neutral');
assert.equal(classifyWindow({ appName: 'Google Chrome', url: 'https://github.com/foo/bar' }), 'work');
assert.equal(classifyWindow({ appName: 'Google Chrome', url: 'https://example-blog.com' }), 'neutral');
console.log('✅ classifyWindow 단위 테스트 통과');

// ---- 시나리오 1: 계획대로 꾸준히 작업 → 알림 없음 ----
{
  const task = { title: '로그인 리팩토링', type: 'task', targetMinutes: 30 };
  const start = 0;
  const samples = Array.from({ length: 20 }, (_, i) => ({
    timestamp: start + (i + 1) * MINUTE,
    window: WORK_WINDOW,
    activityCount: 5,
  }));
  const { state, allAlerts } = runTicks(createInitialFocusState(start), samples, task);
  assert.equal(allAlerts.length, 0, '계획대로 작업 중인데 알림이 발생하면 안 됨');
  assert.equal(state.status, 'onTask');
  console.log('✅ 시나리오1: 꾸준한 작업 — 알림 없음');
}

// ---- 시나리오 2: 딴짓(distraction)이 임계값을 넘으면 이탈 알림, 그 뒤 중복 알림 없음 ----
{
  const task = { title: '문서 정리', type: 'task', targetMinutes: 60 };
  const start = 0;
  const samples = Array.from({ length: 20 }, (_, i) => ({
    timestamp: start + (i + 1) * MINUTE,
    window: DISTRACTION_WINDOW,
    activityCount: 5,
  }));
  const { allAlerts } = runTicks(createInitialFocusState(start), samples, task);
  const driftAlerts = allAlerts.filter((a) => a.type === 'drift');
  assert.equal(driftAlerts.length, 1, '이탈 알림은 스트릭당 정확히 한 번만 떠야 함');
  assert.ok(driftAlerts[0].minutes >= 10, '10분 임계값 이후에 떠야 함');
  console.log(`✅ 시나리오2: 이탈 지속 — 알림 1회만 발생 (${driftAlerts[0].minutes}분째, "${driftAlerts[0].message}")`);
}

// ---- 시나리오 3: 짧은 알트탭(2분)은 EMA 스무딩으로 무시됨 ----
{
  const task = { title: '문서 정리', type: 'task', targetMinutes: 60 };
  const start = 0;
  const samples = [
    ...Array.from({ length: 5 }, (_, i) => ({ timestamp: start + (i + 1) * MINUTE, window: WORK_WINDOW, activityCount: 5 })),
    ...Array.from({ length: 2 }, (_, i) => ({ timestamp: start + (6 + i) * MINUTE, window: DISTRACTION_WINDOW, activityCount: 5 })),
    ...Array.from({ length: 5 }, (_, i) => ({ timestamp: start + (8 + i) * MINUTE, window: WORK_WINDOW, activityCount: 5 })),
  ];
  const { state, allAlerts } = runTicks(createInitialFocusState(start), samples, task);
  assert.equal(allAlerts.length, 0, '짧은 알트탭 정도로는 이탈 알림이 뜨면 안 됨');
  assert.equal(state.status, 'onTask', '잠깐의 딴짓 후 다시 작업 중이면 상태도 onTask로 돌아와야 함');
  console.log('✅ 시나리오3: 짧은 알트탭 — EMA 스무딩으로 알림 없음');
}

// ---- 시나리오 4: 쉬지 않고 예정 시간의 1.5배 이상 작업 → 과몰입 알림 ----
{
  const task = { title: '집중 작업', type: 'task', targetMinutes: 20 }; // 1.5배 = 30분
  const start = 0;
  const samples = Array.from({ length: 40 }, (_, i) => ({
    timestamp: start + (i + 1) * MINUTE,
    window: WORK_WINDOW,
    activityCount: 5,
  }));
  const { allAlerts } = runTicks(createInitialFocusState(start), samples, task);
  const overfocusAlerts = allAlerts.filter((a) => a.type === 'overfocus');
  assert.equal(overfocusAlerts.length, 1, '과몰입 알림도 스트릭당 정확히 한 번만 떠야 함');
  assert.ok(overfocusAlerts[0].minutes >= 30, '예정(20분)의 1.5배인 30분 이후에 떠야 함');
  console.log(`✅ 시나리오4: 과몰입 — 알림 1회만 발생 (${overfocusAlerts[0].minutes}분째, "${overfocusAlerts[0].message}")`);
}

// ---- 시나리오 5: 작업 창은 그대로인데 자리 비움(activityCount=0) → 과몰입으로 오판하지 않음 ----
{
  const task = { title: '집중 작업', type: 'task', targetMinutes: 20 };
  const start = 0;
  const samples = [
    ...Array.from({ length: 10 }, (_, i) => ({ timestamp: start + (i + 1) * MINUTE, window: WORK_WINDOW, activityCount: 5 })),
    // 10분째부터 30분간 활동 없음(자리 비움) — 창은 그대로 Code
    ...Array.from({ length: 30 }, (_, i) => ({ timestamp: start + (11 + i) * MINUTE, window: WORK_WINDOW, activityCount: 0 })),
  ];
  const { allAlerts } = runTicks(createInitialFocusState(start), samples, task);
  const overfocusAlerts = allAlerts.filter((a) => a.type === 'overfocus');
  assert.equal(overfocusAlerts.length, 0, '자리 비움 상태를 과몰입으로 오판하면 안 됨');
  console.log('✅ 시나리오5: 자리 비움 — 과몰입 오판 없음');
}

console.log('\n🎉 모든 합성 이벤트 시나리오 통과');
