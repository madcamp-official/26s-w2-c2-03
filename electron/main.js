const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { spawn, execFile } = require('node:child_process');
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
const SMOKE_TEST = process.env.ELECTRON_SMOKE_TEST === '1';

let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;

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
  backendProcess.on('error', (err) => {
    console.error('[electron] 백엔드 프로세스 시작 실패:', err.message);
  });
}

// 개발 중에는 Vite dev 서버를 그대로 띄워서 프론트엔드 HMR을 유지한다.
// 프로덕션 빌드 시에는 이 대신 정적 빌드 결과물을 loadFile로 읽으면 된다
// (아직 배포는 고려 안 함, 지금은 "감싸기"가 실제로 되는지 검증이 목적).
function startFrontend() {
  // Windows의 node_modules/.bin/vite는 vite.cmd라 shell 없이 직접 spawn하면
  // 실행되지 않을 수 있다. 실제 JS 진입점을 시스템 Node로 실행하면 양쪽 OS에서
  // 같은 명령을 사용할 수 있고, 백엔드의 Node 22+ 요구사항과도 일치한다.
  const viteEntry = path.join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
  frontendProcess = spawn('node', [viteEntry, '--port', '5173', '--strictPort'], {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
  });
  frontendProcess.on('exit', (code) => {
    console.log(`[electron] 프론트엔드 프로세스 종료 (code: ${code})`);
  });
  frontendProcess.on('error', (err) => {
    console.error('[electron] 프론트엔드 프로세스 시작 실패:', err.message);
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
  if (SMOKE_TEST) {
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const apps = await getOpenAppList();
        if (apps.length === 0 || apps.some((item) => !item.appId || !item.name)) {
          throw new Error('Windows 열린 앱 목록 또는 appId가 비어 있음');
        }
        console.log(`[electron] SMOKE_APPS_OK — 열린 앱 ${apps.length}개 조회`);
        console.log('[electron] SMOKE_TEST_OK — 메인 창 로드 완료');
      } catch (err) {
        console.error('[electron] SMOKE_TEST_FAILED:', err.message);
        process.exitCode = 1;
      }
      setTimeout(() => app.quit(), 500);
    });
  }
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

// 집중하던 앱을 다시 포커스로 가져온다.
// macOS는 bundleId, Windows는 WScript.Shell.AppActivate(PID)를 사용한다.
function activateApp(appInfo) {
  if (!appInfo) return;
  if (process.platform === 'darwin') {
    if (!appInfo.bundleId) return;
    execFile('open', ['-b', appInfo.bundleId], (err) => {
      if (err) console.error('[electron] 앱 활성화 실패:', appInfo.bundleId, err.message);
    });
  } else if (process.platform === 'win32') {
    const processId = Number(appInfo.processId);
    if (!Number.isInteger(processId) || processId <= 0) return;
    const script = `$shell = New-Object -ComObject WScript.Shell; if (-not $shell.AppActivate(${processId})) { exit 1 }`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (err) => {
      if (err) console.error('[electron] 앱 활성화 실패 (PID):', processId, err.message);
    });
  }
}

function isServerReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

// 플로팅 알림 창의 버튼에서 올라온 사용자 선택을 처리한다.
ipcMain.on('alert-action', (event, action) => {
  console.log('[electron] 알림 액션 선택됨:', JSON.stringify(action));

  if (action.actionId === 'return' && focusSession.lastFocusApp) {
    // 이탈 직전에 집중하고 있던 앱으로 되돌린다.
    activateApp(focusSession.lastFocusApp);
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

// ---- 집중 세션 ----
// 사용자가 "집중 시작" 시 고른 앱들(focusAppIds)에 있는 동안은 집중으로
// 보고, 그 외 창으로 벗어난 시간이 임계값을 넘으면 알림을 띄운다.

// 테스트 편의를 위해 임계값을 아주 짧게(6초) 잡아둔다. 실제 배포에서는
// 30초~수 분 수준으로 올린다.
const DRIFT_ALERT_SECONDS = 6;
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
const focusSession = {
  active: false,
  focusAppIds: new Set(),
  timer: null,
  driftSeconds: 0,
  alerted: false,
  lastFocusApp: null,
};

function appIdentity(windowInfo) {
  const owner = windowInfo?.owner;
  if (!owner?.name) return null;
  const appId = process.platform === 'darwin'
    ? owner.bundleId
    : owner.path || owner.name;
  if (!appId) return null;
  return {
    appId,
    name: owner.name,
    bundleId: owner.bundleId || null,
    processId: owner.processId || null,
    path: owner.path || null,
  };
}

async function getOpenAppList() {
  const { openWindows } = await loadGetWindows();
  const windows = await openWindows({ accessibilityPermission: false, screenRecordingPermission: false });
  const seen = new Map();
  for (const w of windows) {
    const appInfo = appIdentity(w);
    if (!appInfo || SYSTEM_BUNDLE_IDS.has(appInfo.bundleId)) continue;
    if (!seen.has(appInfo.appId)) seen.set(appInfo.appId, appInfo);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function openFocusSetup() {
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

async function pollFocus() {
  if (!focusSession.active) return;
  try {
    const { activeWindow } = await loadGetWindows();
    const info = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
    const activeApp = appIdentity(info);
    const onFocusApp = activeApp && focusSession.focusAppIds.has(activeApp.appId);

    if (onFocusApp) {
      focusSession.lastFocusApp = activeApp;
      focusSession.driftSeconds = 0;
      focusSession.alerted = false;
    } else {
      focusSession.driftSeconds += POLL_INTERVAL_MS / 1000;
      if (!focusSession.alerted && focusSession.driftSeconds >= DRIFT_ALERT_SECONDS) {
        focusSession.alerted = true;
        const driftAppName = info?.owner?.name || '다른 창';
        showFocusAlert({
          type: 'drift',
          title: '집중하던 앱에서 벗어났어요',
          message: `${Math.round(focusSession.driftSeconds)}초째 "${driftAppName}"에 있어요.`,
          actions: [
            { id: 'return', label: '돌아가기', primary: true },
            { id: 'ignore', label: '무시하기' },
          ],
        });
      }
    }
  } catch (err) {
    console.error('[electron] 활성 창 확인 실패:', err.stdout || err.message);
  }
}

function startFocusSession(focusApps) {
  focusSession.active = true;
  focusSession.focusAppIds = new Set(focusApps.map((a) => a.appId));
  focusSession.driftSeconds = 0;
  focusSession.alerted = false;
  focusSession.lastFocusApp = focusApps[0] || null;
  if (focusSession.timer) clearInterval(focusSession.timer);
  focusSession.timer = setInterval(pollFocus, POLL_INTERVAL_MS);
  console.log('[electron] 집중 세션 시작 — 집중 앱:', focusApps.map((a) => a.name).join(', '));
}

function stopFocusSession() {
  focusSession.active = false;
  if (focusSession.timer) clearInterval(focusSession.timer);
  focusSession.timer = null;
}

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

app.whenReady().then(async () => {
  const [backendAlreadyRunning, frontendAlreadyRunning] = await Promise.all([
    isServerReady(BACKEND_HEALTH_URL),
    isServerReady(FRONTEND_URL),
  ]);

  if (backendAlreadyRunning) console.log('[electron] 기존 백엔드(4000)를 재사용합니다.');
  else startBackend();

  if (frontendAlreadyRunning) console.log('[electron] 기존 Vite(5173)를 재사용합니다.');
  else startFrontend();

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

  // 테스트 편의: 앱이 뜨면 바로 집중 설정 창을 연다. 실제 서비스에서는
  // 메인 UI의 "집중하기" 버튼이 openFocusSetup()을 호출하는 형태가 된다.
  if (!SMOKE_TEST) setTimeout(openFocusSetup, 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopFocusSession();
  if (backendProcess) backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopFocusSession();
  if (backendProcess) backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
});
