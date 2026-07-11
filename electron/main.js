const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const http = require('node:http');

// get-windows는 ESM 전용이라 CommonJS인 여기서는 동적 import()로 한 번만
// 불러와서 재사용한다.
let getWindowsModulePromise = null;
function loadGetWindows() {
  if (!getWindowsModulePromise) getWindowsModulePromise = import('get-windows');
  return getWindowsModulePromise;
}

const ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_HEALTH_URL = 'http://localhost:4000/api/health';
const FOCUS_EVENTS_URL = 'http://localhost:4000/api/focus-events';

let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;
let tray = null;

// 백엔드는 자식 프로세스로 띄운다. Electron 메인 프로세스에 바로 import해서
// 합칠 수도 있지만(같은 Node 환경이니까), node:sqlite가 동기 방식이라 그렇게
// 하면 DB 작업 중 메인 프로세스(=UI/창 관리)가 같이 멈출 위험이 있다 —
// 그래서 별도 프로세스로 분리해서 앱 하나로는 묶되 서로 블로킹하지 않게 한다.
//
// child_process.fork()는 기본적으로 process.execPath(=Electron 바이너리
// 자신)로 자식을 띄우는데, Electron이 내장한 Node 버전(예: v20)에는
// node:sqlite가 없어서 실제로 백엔드가 크래시하는 걸 확인했다(ERR_UNKNOWN_
// BUILTIN_MODULE). 그래서 fork() 대신 spawn('node', ...)으로 PATH에 잡히는
// 시스템 Node(v22+)를 명시적으로 써서 이 버전 불일치를 피한다.
function startBackend() {
  backendProcess = spawn('node', [path.join(BACKEND_DIR, 'src', 'server.js')], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: process.env,
  });
  backendProcess.on('exit', (code) => {
    console.log(`[electron] 백엔드 프로세스 종료 (code: ${code})`);
  });
}

// 개발 중에는 Vite dev 서버를 그대로 띄워서 프론트엔드 HMR을 유지한다.
// 프로덕션 빌드 시에는 이 대신 정적 빌드 결과물을 loadFile로 읽으면 된다
// (아직 배포는 고려 안 함, 지금은 "감싸기"가 실제로 되는지 검증이 목적).
function startFrontend() {
  const viteBin = path.join(FRONTEND_DIR, 'node_modules', '.bin', 'vite');
  frontendProcess = spawn(viteBin, ['--port', '5173'], {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
  });
  frontendProcess.on('exit', (code) => {
    console.log(`[electron] 프론트엔드 프로세스 종료 (code: ${code})`);
  });
}

function waitForServer(url, { timeoutMs = 20000, intervalMs = 300 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      http.get(url, (res) => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`${url} 준비 대기 시간 초과`));
          return;
        }
        setTimeout(attempt, intervalMs);
      });
    }
    attempt();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'Zonemate',
  });
  mainWindow.loadURL(FRONTEND_URL);
}

// 대시보드용 기록 — 세션/이탈/휴식 이벤트를 백엔드에 남긴다. 지금은 인증
// 없이 기기 단위로만 기록한다(Electron 메인 프로세스는 브라우저 로그인
// 쿠키가 없어서, 로그인 사용자와 제대로 묶으려면 별도 인증 브릿지가 필요 —
// 그건 대시보드를 실제로 만들 때 같이 풀 문제). 네트워크 실패는 로그만
// 남기고 무시한다 — 기록 실패가 집중 세션 자체를 막아서는 안 된다.
function logFocusEvent(type, meta) {
  if (!focusSession.id) return;
  const payload = JSON.stringify({ sessionId: focusSession.id, clientId: 'zonemate-desktop', type, meta });
  const req = http.request(
    FOCUS_EVENTS_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
    (res) => res.resume(),
  );
  req.on('error', (err) => console.error('[electron] 집중 이벤트 기록 실패:', err.message));
  req.write(payload);
  req.end();
}

// OS 알림센터의 액션 버튼은 macOS(특히 개발 모드/최신 버전)에서 너무
// 불안정해서(버튼이 아예 안 뜸), 알림 자체를 우리가 만든 작은 플로팅 창으로
// 대체한다. 이 창은:
//   - 테두리 없이 화면 우하단에 뜨고
//   - alwaysOnTop('screen-saver')으로 게임 전체화면 포함 다른 앱 위에 올라오고
//   - 모든 데스크톱 공간(스페이스)에서 보이고
//   - 포커스를 뺏지 않게(showInactive) 조용히 나타난다.
// 즉 Zonemate 메인 창이 꺼져 있어도, 백그라운드 프로세스가 이 창을 그때그때
// 만들어 사용자가 지금 보고 있는 화면 위에 띄운다.
let alertWindow = null;

function showFocusAlert(alert) {
  // 이미 떠 있는 알림이 있으면 닫고 새로 띄운다(알림이 쌓이지 않게).
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.close();
  }

  const width = 380;
  const height = 190;
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 20;

  alertWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + workArea.height - height - margin,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'alert-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  alertWindow.setAlwaysOnTop(true, 'screen-saver');
  alertWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  alertWindow.loadFile(path.join(__dirname, 'alert.html'));

  alertWindow.webContents.once('did-finish-load', () => {
    alertWindow.webContents.send('alert-data', alert);
    alertWindow.showInactive(); // 포커스를 뺏지 않고 표시
  });

  alertWindow.on('closed', () => {
    alertWindow = null;
  });
}

// macOS에서 이미 실행 중인 앱을 포커스로 가져온다. osascript(자동화 권한
// 필요)와 달리 `open -b <bundleId>`는 추가 권한 없이 앱을 앞으로 올려준다.
// (Windows는 나중에 processId 기반으로 SetForegroundWindow 등을 붙인다.)
function activateApp(bundleId) {
  if (!bundleId) return;
  if (process.platform === 'darwin') {
    execFile('open', ['-b', bundleId], (err) => {
      if (err) console.error('[electron] 앱 활성화 실패:', bundleId, err.message);
    });
  }
}

// ---- 집중 세션 상태 ----
// idle(대기) -> focusing(집중 중) -> onBreak(휴식 중) -> focusing -> ...
// "집중 멈추기"는 idle로 완전히 돌아가는 것이고, "휴식하기"는 세션을 끝내지
// 않은 채 잠깐 멈추는 것 — 이 둘을 구분해달라는 요청 반영.

// 테스트 편의를 위해 임계값을 아주 짧게(6초) 잡아둔다. 실제 배포에서는
// 30초~수 분 수준으로 올린다.
const DRIFT_ALERT_MS = 6 * 1000;
const SNOOZE_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
// 순수 시스템/배경 항목은 선택 목록에서 감춘다(앱 선택 UX를 깔끔하게).
const SYSTEM_BUNDLE_IDS = new Set([
  'com.apple.WindowManager',
  'com.apple.notificationcenterui',
  'com.apple.dock',
  'com.apple.finder',
  'com.macosgame.iwallpaper',
]);

let focusSetupWindow = null;
let breakPickerWindow = null;

const focusSession = {
  id: null,
  status: 'idle', // 'idle' | 'focusing' | 'onBreak'
  focusApps: [],
  focusBundleIds: new Set(),
  pollTimer: null,
  driftStartedAt: null, // ms epoch — 지금 이탈 중이면 그 시작 시각, 아니면 null
  driftAppName: null,
  snoozedUntil: 0, // 이 시각까지는 재알림하지 않음
  lastFocusBundleId: null, // 마지막으로 집중 앱에 있었던 순간의 bundleId
  breakTimer: null,
  breakEndsAt: null,
};

async function getOpenAppList() {
  const { openWindows } = await loadGetWindows();
  const windows = await openWindows({ accessibilityPermission: false, screenRecordingPermission: false });
  const seen = new Map();
  for (const w of windows) {
    const bundleId = w.owner?.bundleId;
    const name = w.owner?.name;
    if (!bundleId || !name || SYSTEM_BUNDLE_IDS.has(bundleId)) continue;
    if (!seen.has(bundleId)) seen.set(bundleId, { bundleId, name });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function openFocusSetup() {
  if (focusSession.status !== 'idle') return;
  if (focusSetupWindow && !focusSetupWindow.isDestroyed()) {
    focusSetupWindow.focus();
    return;
  }
  focusSetupWindow = new BrowserWindow({
    width: 460,
    height: 560,
    title: '집중 모드 시작',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'focus-setup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  focusSetupWindow.loadFile(path.join(__dirname, 'focus-setup.html'));
  focusSetupWindow.on('closed', () => {
    focusSetupWindow = null;
  });
}

function openBreakPicker() {
  if (focusSession.status !== 'focusing') return;
  if (breakPickerWindow && !breakPickerWindow.isDestroyed()) {
    breakPickerWindow.focus();
    return;
  }
  breakPickerWindow = new BrowserWindow({
    width: 360,
    height: 340,
    title: '휴식하기',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'break-picker-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  breakPickerWindow.loadFile(path.join(__dirname, 'break-picker.html'));
  breakPickerWindow.on('closed', () => {
    breakPickerWindow = null;
  });
}

async function pollFocus() {
  if (focusSession.status !== 'focusing') return;
  try {
    const { activeWindow } = await loadGetWindows();
    const info = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
    const bundleId = info?.owner?.bundleId || null;
    const onFocusApp = bundleId && focusSession.focusBundleIds.has(bundleId);
    const now = Date.now();

    if (onFocusApp) {
      if (focusSession.driftStartedAt) {
        logFocusEvent('drift_end', { durationMs: now - focusSession.driftStartedAt });
      }
      focusSession.lastFocusBundleId = bundleId;
      focusSession.driftStartedAt = null;
      focusSession.driftAppName = null;
      if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
      return;
    }

    if (!focusSession.driftStartedAt) {
      focusSession.driftStartedAt = now;
      focusSession.driftAppName = info?.owner?.name || '다른 창';
      logFocusEvent('drift_start', { toApp: focusSession.driftAppName });
    }

    const driftMs = now - focusSession.driftStartedAt;
    const shouldAlert = driftMs >= DRIFT_ALERT_MS && now >= focusSession.snoozedUntil && !alertWindow;
    if (shouldAlert) {
      logFocusEvent('alert_shown', { toApp: focusSession.driftAppName });
      showFocusAlert({
        type: 'drift',
        title: '집중하던 앱에서 벗어났어요',
        driftStartedAt: focusSession.driftStartedAt,
        driftAppName: focusSession.driftAppName,
        actions: [
          { id: 'return', label: '돌아가기', primary: true },
          { id: 'ignore', label: '무시하기' },
        ],
      });
    }
  } catch (err) {
    console.error('[electron] 활성 창 확인 실패:', err.stdout || err.message);
  }
}

function startFocusSession(focusApps) {
  focusSession.id = randomUUID();
  focusSession.status = 'focusing';
  focusSession.focusApps = focusApps;
  focusSession.focusBundleIds = new Set(focusApps.map((a) => a.bundleId));
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;
  focusSession.snoozedUntil = 0;
  focusSession.lastFocusBundleId = focusApps[0]?.bundleId || null;

  logFocusEvent('session_start', { focusApps });

  if (focusSession.pollTimer) clearInterval(focusSession.pollTimer);
  focusSession.pollTimer = setInterval(pollFocus, POLL_INTERVAL_MS);

  console.log('[electron] 집중 세션 시작 — 집중 앱:', focusApps.map((a) => a.name).join(', '));
  refreshTray();
}

function stopFocusSession() {
  if (focusSession.status === 'idle') return;

  logFocusEvent('session_end', {});

  focusSession.status = 'idle';
  focusSession.id = null;
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;

  if (focusSession.pollTimer) clearInterval(focusSession.pollTimer);
  focusSession.pollTimer = null;
  if (focusSession.breakTimer) clearTimeout(focusSession.breakTimer);
  focusSession.breakTimer = null;
  focusSession.breakEndsAt = null;

  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();

  console.log('[electron] 집중 세션 종료');
  refreshTray();
}

function startBreak(minutes) {
  if (focusSession.status !== 'focusing') return;

  focusSession.status = 'onBreak';
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;
  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();

  const ms = Math.max(1, minutes) * 60000;
  focusSession.breakEndsAt = Date.now() + ms;
  logFocusEvent('break_start', { minutes });

  if (focusSession.breakTimer) clearTimeout(focusSession.breakTimer);
  focusSession.breakTimer = setTimeout(() => endBreak('auto'), ms);

  console.log(`[electron] 휴식 시작 — ${minutes}분`);
  refreshTray();
}

function endBreak(reason) {
  if (focusSession.status !== 'onBreak') return;

  if (focusSession.breakTimer) clearTimeout(focusSession.breakTimer);
  focusSession.breakTimer = null;
  focusSession.breakEndsAt = null;
  focusSession.status = 'focusing';

  logFocusEvent('break_end', { reason });

  console.log(`[electron] 휴식 종료 (${reason})`);
  refreshTray();
}

// ---- 트레이 메뉴 ----
// "집중 시작"을 앱 켜지자마자 자동으로 띄우는 대신, 메뉴바 트레이 아이콘에서
// 사용자가 직접 눌러서 열도록 한다. 같은 메뉴에서 휴식하기/집중 재개/
// 집중 멈추기까지 전부 제어한다.
function breakRemainingLabel() {
  if (!focusSession.breakEndsAt) return '';
  const remainingMin = Math.max(0, Math.ceil((focusSession.breakEndsAt - Date.now()) / 60000));
  return ` (약 ${remainingMin}분 남음)`;
}

function buildTrayMenu() {
  const statusLabel = focusSession.status === 'focusing'
    ? '● 집중 중'
    : focusSession.status === 'onBreak'
      ? `● 휴식 중${breakRemainingLabel()}`
      : '대기 중';

  return Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: '집중 시작...', enabled: focusSession.status === 'idle', click: openFocusSetup },
    { label: '휴식하기...', enabled: focusSession.status === 'focusing', click: openBreakPicker },
    { label: '집중 재개', enabled: focusSession.status === 'onBreak', click: () => endBreak('manual') },
    { label: '집중 멈추기', enabled: focusSession.status !== 'idle', click: stopFocusSession },
    { type: 'separator' },
    {
      label: 'Zonemate 열기',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) createWindow();
        else mainWindow.show();
      },
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'tray-icon.png'));
  tray.setToolTip('Zonemate');
  refreshTray();
}

// 플로팅 알림 창의 버튼에서 올라온 사용자 선택을 처리한다.
ipcMain.on('alert-action', (event, action) => {
  console.log('[electron] 알림 액션 선택됨:', JSON.stringify(action));
  logFocusEvent('alert_action', action);

  if (action.actionId === 'return' && focusSession.lastFocusBundleId) {
    // 이탈 직전에 집중하고 있던 앱으로 되돌린다.
    activateApp(focusSession.lastFocusBundleId);
  } else if (action.actionId === 'ignore') {
    // 5분간 재알림하지 않는다(이탈 자체는 계속 추적 — 무시했다고 해서
    // 실제로 벗어나 있던 시간 기록이 사라지면 안 되니까).
    focusSession.snoozedUntil = Date.now() + SNOOZE_MS;
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('get-open-apps', async () => {
  try {
    return await getOpenAppList();
  } catch (err) {
    console.error('[electron] 열린 앱 목록 조회 실패:', err.stdout || err.message);
    return [];
  }
});

ipcMain.on('start-focus-session', (event, focusApps) => {
  startFocusSession(focusApps);
  if (focusSetupWindow && !focusSetupWindow.isDestroyed()) focusSetupWindow.close();
});

ipcMain.on('cancel-focus-setup', () => {
  if (focusSetupWindow && !focusSetupWindow.isDestroyed()) focusSetupWindow.close();
});

ipcMain.on('start-break', (event, minutes) => {
  startBreak(minutes);
  if (breakPickerWindow && !breakPickerWindow.isDestroyed()) breakPickerWindow.close();
});

ipcMain.on('cancel-break-picker', () => {
  if (breakPickerWindow && !breakPickerWindow.isDestroyed()) breakPickerWindow.close();
});

app.whenReady().then(async () => {
  createTray();
  startBackend();
  startFrontend();

  try {
    await Promise.all([
      waitForServer(BACKEND_HEALTH_URL),
      waitForServer(FRONTEND_URL),
    ]);
    console.log('[electron] 백엔드/프론트엔드 준비 완료, 창을 엽니다.');
  } catch (err) {
    console.error('[electron] 서버 준비 대기 실패:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 트레이 상주 앱이라 메인 창을 닫아도 백그라운드(트레이)는 계속 살아있게
  // 한다 — 집중 세션/알림이 메인 창 없이도 계속 동작해야 하므로 macOS 여부와
  // 관계없이 앱을 종료하지 않는다. 완전 종료는 트레이 메뉴의 "종료"로만.
});

app.on('before-quit', () => {
  stopFocusSession();
  if (backendProcess) backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
});
