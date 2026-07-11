const { app, BrowserWindow, ipcMain, screen, Tray, Menu } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const http = require('node:http');

if (require('electron-squirrel-startup')) app.quit();

// get-windows는 ESM 전용이라 CommonJS인 여기서는 동적 import()로 한 번만
// 불러와서 재사용한다.
let getWindowsModulePromise = null;
function loadGetWindows() {
  if (!getWindowsModulePromise) getWindowsModulePromise = import('get-windows');
  return getWindowsModulePromise;
}

const ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const BACKEND_PORT = app.isPackaged ? Number(process.env.ZONEMATE_PORT) || 4000 : 4000;
const BACKEND_ORIGIN = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = app.isPackaged ? BACKEND_ORIGIN : 'http://localhost:5173';
const BACKEND_HEALTH_URL = `${BACKEND_ORIGIN}/api/health`;
const SMOKE_TEST = process.env.ELECTRON_SMOKE_TEST === '1';

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
  const executable = app.isPackaged ? process.execPath : 'node';
  const backendEnvironment = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    ...(app.isPackaged ? {
      ELECTRON_RUN_AS_NODE: '1',
      APP_BASE_URL: BACKEND_ORIGIN,
      API_BASE_URL: BACKEND_ORIGIN,
      DATA_DIR: app.getPath('userData'),
      DOTENV_CONFIG_PATH: path.join(app.getPath('userData'), '.env'),
      FRONTEND_DIST_DIR: path.join(FRONTEND_DIR, 'dist'),
    } : {}),
  };
  backendProcess = spawn(executable, [path.join(BACKEND_DIR, 'src', 'server.js')], {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: backendEnvironment,
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

// 백엔드/프론트엔드가 이미(예: 사용자가 별도 터미널에서) 떠 있으면 중복으로
// 다시 띄우지 않는다 — 안 그러면 포트 충돌(EADDRINUSE)로 새로 띄운 쪽이
// 죽어버린다.
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'Zonemate',
    webPreferences: {
      // React 앱(웹)에 집중 세션 제어/실시간 상태 브리지를 노출한다.
      preload: path.join(__dirname, 'main-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(FRONTEND_URL);
  // 창이 준비되면 현재 상태를 즉시 한 번 보내 초기 화면을 맞춘다.
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('focus-state', buildFocusSnapshot());
    }
  });

  if (SMOKE_TEST) {
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const apps = await getOpenAppList();
        if (apps.length === 0 || apps.some((item) => !item.appId || !item.name)) {
          throw new Error('열린 앱 목록 또는 appId가 비어 있음');
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
    // macOS에서 'panel'로 만들면 앱이 비활성화돼도(다른 앱을 클릭해도) 창이
    // 뒤로 밀려나거나 사라지지 않고 계속 떠 있는다. 일반 window 타입은 앱
    // 전체가 뒷단으로 갈 때 같이 딸려 내려가서 알림이 사라져 보였다.
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'alert-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // screen-saver 레벨 + 모든 워크스페이스(스페이스/전체화면 포함)에서 보이도록
  // 해서, 어떤 앱을 쓰고 있든 그 위에 계속 알림이 떠 있게 한다.
  alertWindow.setAlwaysOnTop(true, 'screen-saver');
  alertWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 앱이 다른 앱에 포커스를 내줘도 이 창은 화면에 계속 두게 한다(Stage
  // Manager로 앱을 못 찾아 되돌아오지 못하는 상황 방지).
  if (process.platform === 'darwin' && alertWindow.setHiddenInMissionControl) {
    alertWindow.setHiddenInMissionControl(false);
  }
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
// macOS는 bundleId로 `open -b`(추가 권한 불필요), Windows는 bundleId가 없어서
// PID 기반 WScript.Shell.AppActivate를 쓴다.
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

// "돌아가기"를 눌렀을 때 부르는 함수. 직전에 우연히 활성화됐던 아무 앱이
// 아니라, 사용자가 집중 시작 때 직접 고른 집중 앱(들)을 앞으로 가져온다.
// 집중 앱을 여러 개 골랐으면(예: 듀얼 모니터로 Claude+VSCode) 전부 활성화하되
// 마지막에 있던 집중 앱(lastFocusApp)을 맨 마지막에 올려 최종 포커스로 둔다.
function activateFocusApps() {
  const apps = focusSession.focusApps || [];
  const last = focusSession.lastFocusApp;
  // lastFocusApp을 제일 마지막에 활성화하려고 순서를 맞춘다.
  const ordered = [
    ...apps.filter((a) => !last || a.appId !== last.appId),
    ...(last ? [last] : []),
  ];
  const targets = ordered.length ? ordered : (last ? [last] : []);
  targets.forEach((appInfo, index) => {
    // 순차 활성화가 서로 덮어쓰지 않도록 약간의 간격을 둔다.
    setTimeout(() => activateApp(appInfo), index * 120);
  });
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
const BROADCAST_INTERVAL_MS = 1000;
// 집중력 게이지(EMA) 평활 계수. 폴링 tick(2초)마다 갱신되며, 집중이면 +1,
// 이탈이면 -1, 그 외(자기 창/자리비움)는 현 상태 유지 쪽으로 살짝 당긴다.
const GAUGE_ALPHA = 0.15;

// ---- 선제 알림(웰빙) 기준 ----
// 과몰입: 쉬지 않고 이어서 집중한 시간이 이 값을 넘으면 "휴식 권장" 알림.
// (지금 세션에는 작업별 "예정 시간" 개념이 없어서, 절대 시간 기준으로 잡았다.
// 나중에 목표 시간이 생기면 focusEngine처럼 예정×1.5배로 바꿀 수 있다.)
const OVERFOCUS_STREAK_MS = 50 * 60 * 1000;
// 과몰입 알림을 무시하고 계속 집중하면, 이 간격마다 다시 권한다.
const OVERFOCUS_REMIND_MS = 20 * 60 * 1000;
// 집중 저하: 누적 딴짓 시간이 누적 집중 시간의 이 배수 이상이면 "잠깐 쉬고
// 오는 걸 제안". 단 딴짓이 아래 최소치 이상일 때만(짧은 딴짓엔 안 뜨게).
const UNDERFOCUS_DRIFT_RATIO = 1.5;
const UNDERFOCUS_MIN_DRIFT_MS = 10 * 60 * 1000;
// 집중 저하 알림 재알림 간격.
const UNDERFOCUS_SNOOZE_MS = 10 * 60 * 1000;
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
  focusAppIds: new Set(),
  pollTimer: null,
  broadcastTimer: null,
  driftStartedAt: null, // ms epoch — 지금 이탈 중이면 그 시작 시각, 아니면 null
  driftAppName: null,
  snoozedUntil: 0, // 이 시각까지는 재알림하지 않음
  ignoredCurrentDrift: false, // 이번 이탈에서 "무시하기"를 누른 적이 있는지
  pendingReturnApp: null, // 무시하기 후 자연 복귀를 감지했을 때의 appInfo(확인 전 임시 보관)
  lastFocusApp: null, // 마지막으로 집중 앱에 있었던 순간의 appInfo
  breakTimer: null,
  breakEndsAt: null,
  breakStartedAt: null,

  // ---- 대시보드용 실시간 통계 ----
  sessionStartedAt: null, // 세션(집중 시작) 시각
  focusStreakStartedAt: null, // 지금 이어지는 집중이 시작된 시각(이탈/휴식하면 리셋)
  currentState: 'idle', // 'focus' | 'drift' | 'break' | 'self' | 'idle' — 통계 집계용 순간 상태
  accountedAt: null, // 마지막으로 누적 통계에 반영한 시각
  totalFocusMs: 0, // 세션 누적 집중 시간
  totalDriftMs: 0, // 세션 누적 이탈(딴짓) 시간
  totalBreakMs: 0, // 세션 누적 휴식 시간
  lastReturnMs: null, // 가장 최근 이탈에서 돌아오기까지 걸린 시간
  driftCount: 0, // 세션 중 이탈한 횟수
  gauge: 100, // 집중력 게이지(0~100)

  // 선제 알림(웰빙) 스누즈 — 이 시각 전에는 각각 다시 알리지 않는다.
  overfocusSnoozedUntil: 0, // 이번 집중 streak가 새로 시작되면 0으로 리셋
  underfocusSnoozedUntil: 0,
};

// 활성/열린 창 정보에서 플랫폼에 상관없이 앱을 식별할 키를 뽑아낸다.
// macOS는 bundleId가 안정적인 식별자지만, Windows는 그게 없어서 실행 파일
// 경로(없으면 앱 이름)를 대신 쓴다.
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

// ---- 실시간 통계 집계 ----
// 지금까지 흐른 시간을 currentState에 해당하는 버킷에 누적한다. 상태를 바꾸기
// 직전과 스냅샷을 만들기 직전에 호출해서, 진행 중인 구간까지 반영된 최신
// 통계가 나오게 한다.
function accrueStats(now = Date.now()) {
  if (focusSession.accountedAt == null) {
    focusSession.accountedAt = now;
    return;
  }
  const delta = now - focusSession.accountedAt;
  focusSession.accountedAt = now;
  if (delta <= 0) return;

  if (focusSession.currentState === 'focus') focusSession.totalFocusMs += delta;
  else if (focusSession.currentState === 'drift') focusSession.totalDriftMs += delta;
  else if (focusSession.currentState === 'break') focusSession.totalBreakMs += delta;
  // 'self'(Zonemate 자기 창)/'idle'은 어느 버킷에도 넣지 않는다.
}

// 순간 상태를 바꾼다. 바꾸기 전에 이전 상태 시간을 정산하고, 집중력 게이지도
// 함께 갱신한다.
function setCurrentState(state, now = Date.now()) {
  accrueStats(now);
  focusSession.currentState = state;
  // 게이지: 집중이면 위로, 이탈이면 아래로 당긴다. 그 외 상태는 유지.
  let target = null;
  if (state === 'focus') target = 100;
  else if (state === 'drift') target = 0;
  if (target != null) {
    focusSession.gauge = GAUGE_ALPHA * target + (1 - GAUGE_ALPHA) * focusSession.gauge;
  }
}

// React에 보낼 현재 상태 스냅샷. 진행 중인 구간까지 반영하려고 먼저 정산한다.
function buildFocusSnapshot() {
  const now = Date.now();
  if (focusSession.status !== 'idle') accrueStats(now);

  return {
    status: focusSession.status, // 'idle' | 'focusing' | 'onBreak'
    isDrifting: focusSession.status === 'focusing' && focusSession.driftStartedAt != null,
    focusApps: focusSession.focusApps.map((a) => ({ appId: a.appId, name: a.name })),
    driftAppName: focusSession.driftAppName,
    now,
    sessionStartedAt: focusSession.sessionStartedAt,
    focusStreakStartedAt: focusSession.focusStreakStartedAt,
    driftStartedAt: focusSession.driftStartedAt,
    breakStartedAt: focusSession.breakStartedAt,
    breakEndsAt: focusSession.breakEndsAt,
    totalFocusMs: focusSession.totalFocusMs,
    totalDriftMs: focusSession.totalDriftMs,
    totalBreakMs: focusSession.totalBreakMs,
    lastReturnMs: focusSession.lastReturnMs,
    driftCount: focusSession.driftCount,
    gauge: Math.round(focusSession.gauge),
  };
}

function broadcastFocusState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('focus-state', buildFocusSnapshot());
  }
}

function startBroadcasting() {
  if (focusSession.broadcastTimer) clearInterval(focusSession.broadcastTimer);
  // 1초마다: 선제 알림(과몰입/집중 저하) 판단 후 상태를 React로 브로드캐스트.
  focusSession.broadcastTimer = setInterval(() => {
    evaluateWellbeingAlerts();
    broadcastFocusState();
  }, BROADCAST_INTERVAL_MS);
}

function stopBroadcasting() {
  if (focusSession.broadcastTimer) clearInterval(focusSession.broadcastTimer);
  focusSession.broadcastTimer = null;
}

// 새 집중 streak 시작 — 과몰입 스누즈를 리셋해서 새 집중 구간에서 다시
// 권할 수 있게 한다.
function beginFocusStreak(now) {
  focusSession.focusStreakStartedAt = now;
  focusSession.overfocusSnoozedUntil = 0;
}

// 과몰입/집중 저하 같은 선제 알림을 띄울지 1초마다 판단한다. 드리프트(이탈)
// 알림과 겹치지 않게, 이미 알림 창이 떠 있으면 건너뛴다.
function evaluateWellbeingAlerts() {
  if (focusSession.status !== 'focusing') return; // 휴식 중엔 권하지 않음
  if (alertWindow) return; // 다른 알림이 떠 있으면 스킵
  const now = Date.now();

  // 1) 과몰입: 쉬지 않고 이어서 집중한 시간이 기준을 넘음(지금 실제로 집중
  //    앱에 있을 때만 — 이탈 중이면 streak가 아니다).
  const focusingNow = focusSession.currentState === 'focus' && !focusSession.driftStartedAt;
  const streakMs = focusingNow && focusSession.focusStreakStartedAt
    ? now - focusSession.focusStreakStartedAt
    : 0;
  if (focusingNow && streakMs >= OVERFOCUS_STREAK_MS && now >= focusSession.overfocusSnoozedUntil) {
    focusSession.overfocusSnoozedUntil = now + OVERFOCUS_REMIND_MS;
    logFocusEvent('overfocus_alert', { streakMs });
    showFocusAlert({
      type: 'overfocus',
      title: '오래 집중하고 있어요',
      message: `쉬지 않고 ${Math.round(streakMs / 60000)}분째 집중 중이에요. 잠깐 쉬는 건 어때요?`,
      actions: [
        { id: 'take_break', label: '휴식하기', primary: true },
        { id: 'ignore_wellbeing', label: '계속하기' },
      ],
    });
    return;
  }

  // 2) 집중 저하: 누적 딴짓이 누적 집중의 1.5배 이상 + 최소 10분 이상.
  const drift = focusSession.totalDriftMs;
  const focus = focusSession.totalFocusMs;
  if (
    drift >= UNDERFOCUS_MIN_DRIFT_MS
    && drift >= UNDERFOCUS_DRIFT_RATIO * focus
    && now >= focusSession.underfocusSnoozedUntil
  ) {
    focusSession.underfocusSnoozedUntil = now + UNDERFOCUS_SNOOZE_MS;
    logFocusEvent('underfocus_alert', { driftMs: drift, focusMs: focus });
    showFocusAlert({
      type: 'underfocus',
      title: '집중이 잘 안 되고 있어요',
      message: `지금까지 집중 ${Math.round(focus / 60000)}분, 딴짓 ${Math.round(drift / 60000)}분이에요. 시간을 정해 잠깐 쉬고 오는 건 어때요?`,
      actions: [
        { id: 'take_break', label: '휴식하기', primary: true },
        { id: 'ignore_wellbeing', label: '계속하기' },
      ],
    });
  }
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
    // Zonemate 자기 자신은 집중 대상에서 항상 제외한다 — 집중 중 대시보드나
    // 알림/설정 창을 보고 있는 건 이탈도 집중도 아니므로 아무 것도 세지 않고
    // 그냥 넘어간다. 하드코딩된 bundleId 대신 우리 창이 포커스됐는지로 판별해
    // 개발/배포 환경에 상관없이 동작하게 한다.
    const isSelfFocused = BrowserWindow.getAllWindows()
      .some((w) => !w.isDestroyed() && w.isFocused());
    if (isSelfFocused) {
      setCurrentState('self');
      return;
    }

    const { activeWindow } = await loadGetWindows();
    const info = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
    const activeApp = appIdentity(info);
    const onFocusApp = activeApp && focusSession.focusAppIds.has(activeApp.appId);
    const now = Date.now();

    if (onFocusApp) {
      if (focusSession.ignoredCurrentDrift) {
        // 무시하기를 누른 이탈에서 돌아온 경우엔 자동으로 이탈 종료 처리하지
        // 않는다 — "재개하기"를 눌러 명시적으로 확인해야 실제로 집중을
        // 재개한 것으로 본다. 확인 전까지는 이탈 상태(및 통계)를 그대로 유지.
        setCurrentState('drift');
        if (!alertWindow) {
          focusSession.pendingReturnApp = activeApp;
          const driftMs = focusSession.driftStartedAt ? now - focusSession.driftStartedAt : 0;
          showFocusAlert({
            type: 'resume_confirm',
            title: '다시 집중을 시작했나요?',
            message: `방금 전까지 ${Math.round(driftMs / 1000)}초간 "${focusSession.driftAppName || '다른 곳'}"에 있었어요.`,
            actions: [
              { id: 'confirm_resume', label: '재개하기', primary: true },
            ],
          });
        }
        return;
      }

      // 이탈에서 집중으로 복귀 — 돌아오기까지 걸린 시간을 기록하고 새 집중
      // streak을 시작한다.
      if (focusSession.driftStartedAt) {
        focusSession.lastReturnMs = now - focusSession.driftStartedAt;
        logFocusEvent('drift_end', { durationMs: focusSession.lastReturnMs });
      }
      if (focusSession.currentState !== 'focus') {
        beginFocusStreak(now);
      }
      setCurrentState('focus');
      focusSession.lastFocusApp = activeApp;
      focusSession.driftStartedAt = null;
      focusSession.driftAppName = null;
      if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
      return;
    }

    setCurrentState('drift');
    if (!focusSession.driftStartedAt) {
      focusSession.driftStartedAt = now;
      focusSession.driftAppName = info?.owner?.name || '다른 창';
      focusSession.driftCount += 1;
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
  const now = Date.now();
  focusSession.id = randomUUID();
  focusSession.status = 'focusing';
  focusSession.focusApps = focusApps;
  focusSession.focusAppIds = new Set(focusApps.map((a) => a.appId));
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;
  focusSession.snoozedUntil = 0;
  focusSession.ignoredCurrentDrift = false;
  focusSession.pendingReturnApp = null;
  focusSession.lastFocusApp = focusApps[0] || null;

  // 통계 초기화 — 새 세션 시작이므로 게이지도 만점에서 출발한다.
  focusSession.sessionStartedAt = now;
  beginFocusStreak(now);
  focusSession.currentState = 'focus';
  focusSession.accountedAt = now;
  focusSession.totalFocusMs = 0;
  focusSession.totalDriftMs = 0;
  focusSession.totalBreakMs = 0;
  focusSession.lastReturnMs = null;
  focusSession.driftCount = 0;
  focusSession.gauge = 100;
  focusSession.underfocusSnoozedUntil = 0;

  logFocusEvent('session_start', { focusApps });

  if (focusSession.pollTimer) clearInterval(focusSession.pollTimer);
  focusSession.pollTimer = setInterval(pollFocus, POLL_INTERVAL_MS);
  startBroadcasting();

  console.log('[electron] 집중 세션 시작 — 집중 앱:', focusApps.map((a) => a.name).join(', '));
  refreshTray();
  broadcastFocusState();
}

function stopFocusSession() {
  if (focusSession.status === 'idle') return;

  accrueStats();
  logFocusEvent('session_end', {
    totalFocusMs: focusSession.totalFocusMs,
    totalDriftMs: focusSession.totalDriftMs,
    totalBreakMs: focusSession.totalBreakMs,
    driftCount: focusSession.driftCount,
  });

  focusSession.status = 'idle';
  focusSession.id = null;
  focusSession.currentState = 'idle';
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;
  focusSession.ignoredCurrentDrift = false;
  focusSession.pendingReturnApp = null;
  focusSession.focusStreakStartedAt = null;
  focusSession.breakStartedAt = null;

  if (focusSession.pollTimer) clearInterval(focusSession.pollTimer);
  focusSession.pollTimer = null;
  if (focusSession.breakTimer) clearTimeout(focusSession.breakTimer);
  focusSession.breakTimer = null;
  focusSession.breakEndsAt = null;

  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();

  console.log('[electron] 집중 세션 종료');
  refreshTray();
  broadcastFocusState();
  stopBroadcasting();
}

function startBreak(minutes) {
  if (focusSession.status !== 'focusing') return;

  const now = Date.now();
  setCurrentState('break', now); // 이전 상태 정산 후 휴식 집계 시작
  focusSession.status = 'onBreak';
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;
  focusSession.ignoredCurrentDrift = false;
  focusSession.pendingReturnApp = null;
  focusSession.focusStreakStartedAt = null;
  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();

  const ms = Math.max(1, minutes) * 60000;
  focusSession.breakStartedAt = now;
  focusSession.breakEndsAt = now + ms;
  logFocusEvent('break_start', { minutes });

  if (focusSession.breakTimer) clearTimeout(focusSession.breakTimer);
  focusSession.breakTimer = setTimeout(() => endBreak('auto'), ms);

  console.log(`[electron] 휴식 시작 — ${minutes}분`);
  refreshTray();
  broadcastFocusState();
}

function endBreak(reason) {
  if (focusSession.status !== 'onBreak') return;

  const now = Date.now();
  if (focusSession.breakTimer) clearTimeout(focusSession.breakTimer);
  focusSession.breakTimer = null;
  focusSession.breakEndsAt = null;
  focusSession.breakStartedAt = null;
  focusSession.status = 'focusing';
  // 휴식 종료 = 새 집중 streak 시작.
  beginFocusStreak(now);
  setCurrentState('focus', now);

  logFocusEvent('break_end', { reason });

  console.log(`[electron] 휴식 종료 (${reason})`);
  refreshTray();
  broadcastFocusState();
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

  const win = BrowserWindow.fromWebContents(event.sender);

  if (action.actionId === 'return') {
    // 알림 창을 먼저 닫고(닫으면 macOS가 직전 활성 앱=딴짓하던 앱으로 포커스를
    // 되돌리려 하므로), 살짝 뒤에 집중 앱을 활성화해서 그쪽이 최종적으로 이기게
    // 한다. 이 순서를 안 지키면 "가장 최근에 켜져 있던 앱"으로 되돌아가 버린다.
    if (win && !win.isDestroyed()) win.close();
    setTimeout(activateFocusApps, 150);
    return;
  }

  if (action.actionId === 'take_break') {
    // 과몰입/집중 저하 알림에서 휴식 선택 — 시간 선택 창을 연다.
    if (win && !win.isDestroyed()) win.close();
    openBreakPicker();
    return;
  }

  if (action.actionId === 'ignore_wellbeing') {
    // 과몰입/집중 저하 알림을 무시하고 계속 — 스누즈는 알림을 띄울 때 이미
    // 걸어놨으므로 여기서는 그냥 닫기만 한다.
    if (win && !win.isDestroyed()) win.close();
    return;
  }

  if (action.actionId === 'ignore') {
    // 5분간 재알림하지 않는다(이탈 자체는 계속 추적 — 무시했다고 해서
    // 실제로 벗어나 있던 시간 기록이 사라지면 안 되니까). 이번 이탈은
    // "무시됨"으로 표시해서, 나중에 자연 복귀했을 때 자동으로 종료 처리하지
    // 않고 재개 확인을 받도록 한다.
    focusSession.snoozedUntil = Date.now() + SNOOZE_MS;
    focusSession.ignoredCurrentDrift = true;
  } else if (action.actionId === 'confirm_resume') {
    const now = Date.now();
    if (focusSession.driftStartedAt) {
      focusSession.lastReturnMs = now - focusSession.driftStartedAt;
      logFocusEvent('drift_end', { durationMs: focusSession.lastReturnMs, confirmedManually: true });
    }
    focusSession.lastFocusApp = focusSession.pendingReturnApp || focusSession.lastFocusApp;
    focusSession.pendingReturnApp = null;
    focusSession.driftStartedAt = null;
    focusSession.driftAppName = null;
    focusSession.ignoredCurrentDrift = false;
    focusSession.snoozedUntil = 0;
    beginFocusStreak(now);
    setCurrentState('focus', now);
    broadcastFocusState();
  }

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

// ---- 앱 내부(React) 집중 컨트롤용 ----
ipcMain.on('stop-focus-session', () => stopFocusSession());
ipcMain.on('resume-focus', () => endBreak('manual'));
ipcMain.handle('get-focus-state', () => buildFocusSnapshot());

app.whenReady().then(async () => {
  createTray();

  const [backendAlreadyRunning, frontendAlreadyRunning] = await Promise.all([
    isServerReady(BACKEND_HEALTH_URL),
    app.isPackaged ? Promise.resolve(false) : isServerReady(FRONTEND_URL),
  ]);

  if (backendAlreadyRunning) console.log('[electron] 기존 백엔드(4000)를 재사용합니다.');
  else startBackend();

  if (!app.isPackaged) {
    if (frontendAlreadyRunning) console.log('[electron] 기존 Vite(5173)를 재사용합니다.');
    else startFrontend();
  }

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
