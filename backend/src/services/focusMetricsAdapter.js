import { createInitialFocusState, tickFocusState } from './focusEngine.js';
import { scoreInputWindow, INPUT_PATTERN_WINDOW_MS } from './inputPattern.js';

const DEFAULT_TICK_INTERVAL_MS = 60_000;
// 최근 입력 이벤트 보관 창(패턴 점수 산출 + 메모리 상한). 산출 창보다 살짝 길게.
const INPUT_KEEP_MS = INPUT_PATTERN_WINDOW_MS + 30_000;
const DEFAULT_CLIENT_ID = 'local-device';
const BROWSER_NAMES = ['chrome', 'edge', 'firefox', 'safari', 'brave', 'opera', 'vivaldi', 'arc'];

function eventTimestamp(log) {
  const timestamp = Date.parse(log.time);
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function isBrowserApp(appName = '') {
  const normalized = appName.toLowerCase();
  return BROWSER_NAMES.some((name) => normalized.includes(name));
}

function publicSession(session, now = Date.now()) {
  const { score, features } = scoreInputWindow(session.recentInputs, now);
  return {
    clientId: session.clientId,
    currentWindow: session.currentWindow,
    latestBrowserTab: session.latestBrowserTab,
    pendingActivityCount: session.activityCount,
    focusState: session.focusState,
    lastTickReason: session.lastTickReason,
    // 키/마우스 패턴 기반 입력 집중 점수(0~100)와 특징. Electron 게이지가 폴링해서 쓴다.
    inputScore: score,
    inputFeatures: features,
    lastEventAt: session.lastEventAt,
  };
}

/**
 * metrics 이벤트를 focusEngine의 1분 샘플로 바꾸는 상태 보유 어댑터.
 * clientId마다 상태를 따로 관리하며, 타이머를 끌 수 있어 합성 테스트도 가능하다.
 */
export function createFocusMetricsAdapter({ tickIntervalMs = DEFAULT_TICK_INTERVAL_MS } = {}) {
  const sessions = new Map();

  function getSession(clientId, now) {
    if (!sessions.has(clientId)) {
      sessions.set(clientId, {
        clientId,
        currentWindow: null,
        latestBrowserTab: null,
        activityCount: 0,
        recentInputs: [], // 최근 키/마우스 이벤트 {type, t} (패턴 점수용)
        lastEventAt: null,
        currentTask: null,
        focusState: createInitialFocusState(now),
        lastTickReason: null,
      });
    }
    return sessions.get(clientId);
  }

  function flushSession(session, timestamp = Date.now(), reason = 'interval') {
    if (!session.currentWindow) return null;

    session.focusState = tickFocusState(
      session.focusState,
      {
        timestamp: Math.max(timestamp, session.focusState.lastSampleAt),
        window: session.currentWindow,
        activityCount: session.activityCount,
      },
      session.currentTask,
    );
    session.activityCount = 0;
    session.lastTickReason = reason;

    for (const alert of session.focusState.alerts) {
      console.log(`[focus:${session.clientId}] ${alert.message}`);
    }
    return publicSession(session);
  }

  function ingest(logs) {
    const changedSessions = new Set();
    const sortedLogs = [...logs].sort((a, b) => eventTimestamp(a) - eventTimestamp(b));

    for (const log of sortedLogs) {
      const timestamp = eventTimestamp(log);
      const clientId = typeof log.clientId === 'string' && log.clientId.trim()
        ? log.clientId.trim()
        : DEFAULT_CLIENT_ID;
      const session = getSession(clientId, timestamp);
      changedSessions.add(clientId);

      if (log.type === 'click' || log.type === 'keydown') {
        session.activityCount += 1;
        session.recentInputs.push({ type: log.type, t: timestamp });
        session.lastEventAt = Math.max(session.lastEventAt || 0, timestamp);
        // 보관 창 밖 이벤트는 잘라 메모리를 제한한다.
        const cutoff = timestamp - INPUT_KEEP_MS;
        if (session.recentInputs.length > 512 || session.recentInputs[0].t < cutoff) {
          session.recentInputs = session.recentInputs.filter((e) => e.t >= cutoff);
        }
        continue;
      }

      if (log.type === 'active_window') {
        if (session.currentWindow) flushSession(session, timestamp, 'window_changed');
        session.currentWindow = {
          appName: log.appName || null,
          windowTitle: log.windowTitle || null,
          url: isBrowserApp(log.appName) ? session.latestBrowserTab?.url || null : null,
          processId: log.processId ?? null,
          processPath: log.processPath || null,
        };
        continue;
      }

      if (log.type === 'browser_tab') {
        if (session.currentWindow?.url) flushSession(session, timestamp, 'tab_changed');
        session.latestBrowserTab = {
          title: log.title || null,
          url: log.url || null,
          observedAt: log.time || new Date(timestamp).toISOString(),
        };
        if (session.currentWindow && isBrowserApp(session.currentWindow.appName)) {
          session.currentWindow = {
            ...session.currentWindow,
            windowTitle: log.title || session.currentWindow.windowTitle,
            url: log.url || null,
          };
        }
      }
    }

    return [...changedSessions].map((clientId) => publicSession(sessions.get(clientId)));
  }

  function flushAll(timestamp = Date.now(), reason = 'interval') {
    return [...sessions.values()]
      .map((session) => flushSession(session, timestamp, reason))
      .filter(Boolean);
  }

  const timer = tickIntervalMs > 0
    ? setInterval(() => flushAll(Date.now(), 'interval'), tickIntervalMs)
    : null;
  timer?.unref();

  return {
    ingest,
    flushAll,
    getStates: () => [...sessions.values()].map((s) => publicSession(s)),
    stop: () => timer && clearInterval(timer),
  };
}
