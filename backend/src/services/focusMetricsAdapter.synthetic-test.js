import assert from 'node:assert/strict';
import { createFocusMetricsAdapter } from './focusMetricsAdapter.js';

const adapter = createFocusMetricsAdapter({ tickIntervalMs: 0 });
const start = Date.now();
const iso = (offsetMinutes) => new Date(start + offsetMinutes * 60_000).toISOString();

adapter.ingest([
  { type: 'active_window', clientId: 'test-user', appName: 'Visual Studio Code', windowTitle: 'focusEngine.js', time: iso(0) },
  { type: 'keydown', clientId: 'test-user', keycode: 30, time: iso(0.5) },
]);
adapter.flushAll(start + 60_000, 'test');
adapter.flushAll(start + 120_000, 'test');

let [state] = adapter.getStates();
assert.equal(state.focusState.classification, 'work');
assert.equal(state.focusState.status, 'onTask');

adapter.ingest([
  { type: 'active_window', clientId: 'test-user', appName: 'Google Chrome', windowTitle: 'YouTube', time: iso(3) },
  { type: 'browser_tab', clientId: 'test-user', title: 'YouTube', url: 'https://www.youtube.com/watch?v=test', time: iso(3.1) },
  { type: 'click', clientId: 'test-user', button: '좌클릭', time: iso(3.2) },
]);
adapter.flushAll(start + 4 * 60_000, 'test');

[state] = adapter.getStates();
assert.equal(state.currentWindow.url, 'https://www.youtube.com/watch?v=test');
assert.equal(state.focusState.classification, 'distraction');
assert.equal(state.latestBrowserTab.title, 'YouTube');

adapter.stop();
console.log('✅ metrics → focusEngine 어댑터 합성 테스트 통과');
