// 백엔드가 로컬(localhost:4000)에서 Railway로 옮겨가면서 이 주소도 같이
// 옮겨야 한다 — 안 그러면 확장이 아무 데도 데이터를 못 보내고 조용히 큐만
// 쌓는다. 로컬 백엔드로 다시 테스트하려면 이 줄만 바꾸면 된다.
const BACKEND_URL = 'https://26s-w2-c2-03-production.up.railway.app/api/metrics';
const MAX_PENDING_EVENTS = 500;

let lastTabSignature = null;
let queueTask = Promise.resolve();

async function readPendingEvents() {
  const { pendingEvents = [] } = await chrome.storage.local.get('pendingEvents');
  return pendingEvents;
}

async function writePendingEvents(events) {
  await chrome.storage.local.set({ pendingEvents: events.slice(-MAX_PENDING_EVENTS) });
}

async function flushPendingEvents() {
  const pendingEvents = await readPendingEvents();
  if (pendingEvents.length === 0) return;

  const response = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pendingEvents),
  });

  if (!response.ok) throw new Error(`서버 응답 ${response.status}`);
  await writePendingEvents([]);
}

function enqueueEvent(event) {
  queueTask = queueTask
    .catch(() => {})
    .then(async () => {
      const pendingEvents = await readPendingEvents();
      pendingEvents.push(event);
      await writePendingEvents(pendingEvents);
      await flushPendingEvents();
    })
    .catch((err) => {
      console.warn('탭 정보를 전송하지 못해 로컬 큐에 보관합니다.', err);
    });
}

async function reportActiveTab(reason) {
  try {
    const { clientId = 'local-device' } = await chrome.storage.local.get('clientId');
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.incognito || !tab.url) return;

    const signature = JSON.stringify([tab.windowId, tab.id, tab.url, tab.title]);
    if (signature === lastTabSignature) return;
    lastTabSignature = signature;

    enqueueEvent({
      type: 'browser_tab',
      clientId,
      title: tab.title || null,
      url: tab.url,
      tabId: tab.id,
      windowId: tab.windowId,
      reason,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('활성 탭 정보를 읽지 못했어요.', err);
  }
}

chrome.runtime.onInstalled.addListener(() => reportActiveTab('installed'));
chrome.runtime.onStartup.addListener(() => reportActiveTab('browser_started'));

chrome.tabs.onActivated.addListener(() => reportActiveTab('tab_activated'));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.title || changeInfo.status === 'complete')) {
    reportActiveTab('tab_updated');
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) reportActiveTab('window_focused');
});
