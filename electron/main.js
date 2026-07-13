// 서비스 전체 시간을 사용자 기준(현재는 서울/KST)으로 통일한다. 다른 어떤
// 모듈보다 먼저 TZ를 고정해야 메인 프로세스·렌더러(Chromium)·자식 백엔드가
// 모두 같은 타임존으로 시간을 계산한다. 나중에 사용자 국가를 받게 되면 이
// 값을 그 국가 타임존으로 바꾸면 된다.
process.env.TZ = process.env.TZ || 'Asia/Seoul';

const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor,
  systemPreferences, desktopCapturer, dialog, shell,
} = require('electron');
const { spawn, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const { nextGauge, resolveGaugeActivity } = require('./gaugeMath');

// Windows Squirrel 인스톨러 전용 처리. 이 모듈은 패키징 빌드에만 필요하고
// macOS/개발 환경에는 없을 수 있어서, 없으면 조용히 건너뛴다(없다고 앱이
// 아예 안 뜨면 안 되므로).
try {
  if (require('electron-squirrel-startup')) app.quit();
} catch {
  // 미설치(개발/비Windows) — 무시
}

// 자동 업데이트: 설치된 앱이 재설치 없이 GitHub Releases의 새 버전을 받아
// 스스로 갱신한다(update.electronjs.org 경유, public 저장소 필요).
// - Windows(Squirrel): 서명 없이도 동작.
// - macOS(Squirrel.Mac): 앱이 Apple Developer ID로 코드서명+노터라이즈된
//   경우에만 동작(미서명이면 update-electron-app이 조용히 건너뛴다).
// 개발 모드나 미서명 mac에서는 no-op이므로 여기서 호출해도 안전하다.
if (app.isPackaged) {
  try {
    const { updateElectronApp } = require('update-electron-app');
    updateElectronApp({ updateInterval: '30 minutes' });
  } catch (err) {
    console.error('[electron] 자동 업데이트 초기화 실패:', err.message);
  }
}

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

// 패키지 빌드는 이제 로컬 백엔드를 자체적으로 띄우지 않고, 팀이 공유하는
// Railway 서버 하나를 바라본다 — 그래야 로그인/플래너/캘린더 데이터가
// 기기(PC마다 따로 있던 SQLite)가 아니라 계정 기준으로 공유되고, 나중에
// 모바일 앱도 같은 서버에 붙을 수 있다. 카카오/구글 OAuth 키도 이제
// 서버에만 있고 배포본에는 들어가지 않는다. Railway 점검 등으로 원격
// 서버를 잠시 못 쓸 때는 ZONEMATE_LOCAL_BACKEND=1로 예전처럼 로컬 백엔드
// 스폰 경로를 켤 수 있다(비상용 폴백, 평소엔 안 씀). 개발(비패키지) 모드는
// 이 로직과 무관하게 항상 localhost 백엔드/Vite를 그대로 쓴다.
const REMOTE_ORIGIN = process.env.ZONEMATE_REMOTE_ORIGIN
  || 'https://26s-w2-c2-03-production.up.railway.app';
const USE_REMOTE = app.isPackaged && process.env.ZONEMATE_LOCAL_BACKEND !== '1';

const BACKEND_ORIGIN = USE_REMOTE ? REMOTE_ORIGIN : `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = USE_REMOTE ? REMOTE_ORIGIN : (app.isPackaged ? BACKEND_ORIGIN : 'http://localhost:5173');
const BACKEND_HEALTH_URL = `${BACKEND_ORIGIN}/api/health`;
const SMOKE_TEST = process.env.ELECTRON_SMOKE_TEST === '1';

let backendProcess = null;
let frontendProcess = null;
let osTrackerProcess = null;
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

// 로컬 백엔드는 http, 공유 Railway 서버는 https라 URL에 맞는 모듈을 골라야
// 한다 — http.get/request는 프로토콜이 안 맞으면 즉시 예외를 던져서(이
// 예외가 app.whenReady() 체인을 끊어 창이 아예 안 뜨는 버그로 실제 발생함,
// v0.1.16 배포 직후 발견) 안전하지 않다.
function httpClientFor(url) {
  return url.startsWith('https:') ? https : http;
}

function waitForServer(url, { timeoutMs = 20000, intervalMs = 300 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      httpClientFor(url).get(url, (res) => {
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
    const request = httpClientFor(url).get(url, (res) => {
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

// 렌더러(로그인된 브라우저 세션)가 로그인 시 authToken 쿠키에서 읽어 건네준
// 값 — 메인 프로세스는 별도 Node 프로세스라 브라우저 쿠키 저장소에 직접
// 접근할 수 없어서, 백엔드에 자기 명의로(집중 이벤트 기록·실시간 세션
// 동기화) 요청하려면 이렇게 받아둔 토큰을 Authorization 헤더로 실어야 한다.
let currentAuthToken = null;
ipcMain.on('set-auth-token', (event, token) => {
  currentAuthToken = token || null;
});

function authedRequestOptions(method) {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {}),
    },
  };
}

// 대시보드용 기록 — 세션/이탈/휴식 이벤트를 백엔드에 남긴다. 로그인 전이라
// currentAuthToken이 아직 없으면(예: 앱 시작 직후) 서버가 401로 거부하므로,
// 이 경우 조용히 건너뛴다 — 기록 실패가 집중 세션 자체를 막아서는 안 된다.
function logFocusEvent(type, meta) {
  if (!focusSession.id || !currentAuthToken) return;
  const payload = JSON.stringify({ sessionId: focusSession.id, clientId: 'zonemate-desktop', type, meta });
  const eventsUrl = `${BACKEND_ORIGIN}/api/focus-events`;
  const options = authedRequestOptions('POST');
  options.headers['Content-Length'] = Buffer.byteLength(payload);
  const req = httpClientFor(eventsUrl).request(eventsUrl, options, (res) => res.resume());
  req.on('error', (err) => console.error('[electron] 집중 이벤트 기록 실패:', err.message));
  req.write(payload);
  req.end();
}

// 다른 기기(모바일)가 폴링해서 "지금 집중 중이에요"를 따라 보여줄 수 있게,
// 이 계정의 실시간 상태를 서버에 밀어 넣는다. 로그인 전이면 조용히
// 건너뛴다(로컬 상태만으로도 이 앱 자체는 정상 동작해야 하므로).
function pushLiveFocusSession(status) {
  if (!currentAuthToken) return;
  const payload = JSON.stringify({
    status,
    taskTitle: focusSession.taskTitle,
    targetMinutes: focusSession.targetMinutes,
    source: 'desktop',
    gauge: Math.round(focusSession.gauge),
    currentState: focusSession.currentState,
    startedAt: focusSession.sessionStartedAt ? new Date(focusSession.sessionStartedAt).toISOString() : null,
  });
  const url = `${BACKEND_ORIGIN}/api/focus-session`;
  const options = authedRequestOptions('PUT');
  options.headers['Content-Length'] = Buffer.byteLength(payload);
  const req = httpClientFor(url).request(url, options, (res) => res.resume());
  req.on('error', () => {}); // 실시간 미러링은 부가 기능 — 실패해도 로그 스팸 안 낸다(2초마다 시도되므로)
  req.write(payload);
  req.end();
}

function stopLiveFocusSession() {
  if (!currentAuthToken) return;
  const url = `${BACKEND_ORIGIN}/api/focus-session/stop`;
  const req = httpClientFor(url).request(url, authedRequestOptions('POST'), (res) => res.resume());
  req.on('error', () => {});
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
  // 활성 창 제목만으로 분류한 알림은 다음 poll에서 즉시 닫히지 않도록
  // 출처와 표시 시작 시각을 창에 보관한다.
  alertWindow.zonemateAlertType = alert.type || null;
  alertWindow.zonemateAlertSource = alert.source || null;
  alertWindow.zonemateAlertShownAt = Date.now();

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

const DRIFT_ALERT_MS = 30 * 1000;
const SNOOZE_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const BROADCAST_INTERVAL_MS = 1000;
const FOCUS_TIMELINE_SAMPLE_MS = 10 * 1000;
// ---- 집중력 게이지 튜닝 포인트 ----
// 게이지(0~100)는 활성 창이 아니라 키보드/마우스 활동으로 움직인다.
// powerMonitor.getSystemIdleTime()이 마지막 키/마우스 입력 이후 흐른 초를 주므로
// (네이티브 모듈·추가 권한 불필요), 최근 입력이 있으면 올리고 끊기면 내린다.
// 폴링 tick(2초)마다 갱신. 등락 폭(모멘텀 스텝)은 gaugeMath.js의 GAUGE_MOMENTUM에서 조절.
// (창 분류는 집중/이탈 상태·알림·통계 쪽에서 계속 쓴다.)
const GAUGE_ACTIVE_IDLE_SEC = 4; // 이 초 미만 유휴면 "활발히 입력 중"으로 본다
// 이탈(집중 선택 앱이 아닌 곳)일 때 한 tick(2초)마다 내리는 양. 입력이 있어도 무조건
// 이만큼 하강 — 집중 앱의 유휴 하강(모멘텀, 처음엔 완만)보다 훨씬 뚜렷하게 떨어진다.
const GAUGE_DRIFT_DROP = 6;
// os-tracker(키/마우스 패턴)를 쓸 때: 이 clientId로 spawn하고 백엔드 focus-state를 폴링한다.
// tracker 입력을 한 번이라도 받으면 lastEventAt으로 활동 여부를 판정하고, tracker 정보가
// 전혀 없을 때만 powerMonitor.getSystemIdleTime()을 폴백으로 사용한다.
const OS_TRACKER_CLIENT_ID = 'zonemate-desktop';
// os-tracker는 5초마다 묶어서 보내므로 2초의 전송 여유를 둔다. 마지막 실제
// 클릭/키 입력 후 이 시간이 지나면 최근 60초 점수가 남아 있어도 유휴로 본다.
const INPUT_ACTIVE_GRACE_MS = 7 * 1000;
// 게이지 기반 알림: 게이지가 이 값 미만으로 아래 시간 이상 지속되면 "손이 멈췄어요" 알림
const GAUGE_LOW_THRESHOLD = 25;
const GAUGE_LOW_ALERT_MS = 3 * 60 * 1000;
const GAUGE_ALERT_SNOOZE_MS = 10 * 60 * 1000;

// ---- 선제 알림(웰빙) 기준 ----
// 과몰입: 집중 시작 때 받은 목표 시간(targetMinutes)의 이 배수를 쉬지 않고
// 넘기면 "휴식 권장" 알림. 목표 시간을 입력하지 않았으면 아래 절대 시간을
// 대신 쓴다.
const OVERFOCUS_MULTIPLIER = 1.5;
const OVERFOCUS_STREAK_MS = 50 * 60 * 1000; // 목표 시간 미입력 시 폴백
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
  targetMinutes: null, // 이번 집중 세션의 목표 시간(분), 없으면 null
  taskTitle: null, // 지금 집중 중인 할 일 제목(오늘 할 일에서 고른 것), 없으면 null
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
  gauge: 50, // 집중력 게이지(0~100). 중간값 50에서 시작해 키/마우스 활동으로 오르내린다.
  activeStreak: 0, // 연속 활동 tick 수(모멘텀 상승 가속용)
  idleStreak: 0,   // 연속 유휴 tick 수(모멘텀 하강 가속용)
  gaugeLowSince: null, // 게이지가 저점 아래로 내려간 시각(null이면 정상)
  inputScore: 0,   // os-tracker 패턴 점수(0~100, 백엔드 focus-state 폴링 캐시)
  inputAt: null,   // 그 점수의 마지막 입력 시각(신선도 판단용)

  // 선제 알림(웰빙) 스누즈 — 이 시각 전에는 각각 다시 알리지 않는다.
  overfocusSnoozedUntil: 0, // 이번 집중 streak가 새로 시작되면 0으로 리셋
  underfocusSnoozedUntil: 0,
  lastPageSignature: null,
  classifyingPage: false,
  focusSegmentCount: 0,
  timeline: [],
  lastCompletedSummary: null,
  // ---- 브라우저 탭 관련성 판정 캐시 ----
  // classifyCurrentBrowserPage()가 비동기로 채우고, pollFocus()가 동기로
  // 읽는다. pageWindowTitle이 "지금 활성 창 제목"과 같을 때만 pageClassification을
  // 신뢰한다 — 탭을 막 바꿔서 아직 재판정 전이면(제목 불일치) 이탈로 오판하지
  // 않고 그대로 집중으로 취급한다(모르면 이탈로 단정하지 않는다는 원칙).
  pageWindowTitle: null,
  pageClassification: null, // 'related' | 'unrelated' | 'uncertain' | null
  pageLabel: null, // 알림에 보여줄 사람이 읽기 좋은 페이지 이름
};

// URL/제목만으로 플랫폼·콘텐츠 종류를 규칙 기반으로 알아낸다(LLM 호출 없이
// 즉시 계산 — 알림 문구에 쓸 라벨은 매 tick 필요할 수 있어 지연이 있으면 안 됨).
// "관련 있는지"는 LLM(classifyPageProductivity)이 판단하고, 이 함수는 오직
// "뭐라고 부를지"만 담당한다.
function describeBrowserPage(url, title, windowTitle) {
  const cleanTitle = (raw, suffixPattern) => {
    if (!raw) return null;
    const stripped = suffixPattern ? raw.replace(suffixPattern, '').trim() : raw.trim();
    return stripped || null;
  };

  if (url) {
    try {
      const { hostname, pathname } = new URL(url);
      const host = hostname.replace(/^www\./, '');
      if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be') {
        if (pathname.startsWith('/shorts/')) return '유튜브 쇼츠';
        const t = cleanTitle(title, / - YouTube$/);
        return t ? `유튜브: ${t}` : '유튜브';
      }
      if (/(^|\.)instagram\.com$/.test(host)) {
        if (pathname.startsWith('/reel')) return '인스타그램 릴스';
        return '인스타그램';
      }
      if (/(^|\.)tiktok\.com$/.test(host)) return '틱톡';
      if (/(^|\.)(twitter\.com|x\.com)$/.test(host)) return 'X(트위터)';
      if (/(^|\.)netflix\.com$/.test(host)) {
        const t = cleanTitle(title, / - Netflix$/);
        return t ? `넷플릭스: ${t}` : '넷플릭스';
      }
      if (/(^|\.)twitch\.tv$/.test(host)) return '트위치';
      // 그 외 사이트: 제목에서 흔한 " - 사이트명" 꼬리표를 떼고, 없으면
      // 도메인 이름을 그대로 보여준다.
      const t = cleanTitle(title, / [-|·] [^-|·]{1,30}$/);
      return t || host;
    } catch {
      // URL 파싱 실패 시 아래 windowTitle 폴백으로
    }
  }
  return title || windowTitle || '다른 페이지';
}

async function classifyCurrentBrowserPage(windowTitle = null) {
  if (focusSession.status !== 'focusing' || !focusSession.taskTitle || focusSession.classifyingPage) return;

  const sessionId = focusSession.id;
  const taskTitle = focusSession.taskTitle;
  focusSession.classifyingPage = true;
  try {
    const stateResponse = await fetch(`${BACKEND_ORIGIN}/api/metrics/focus-state`);
    if (!stateResponse.ok) return;
    const { sessions = [] } = await stateResponse.json();
    const tab = (
      sessions.find((session) => session.clientId === 'local-device' && session.latestBrowserTab)
      || sessions.find((session) => session.latestBrowserTab)
    )?.latestBrowserTab;
    const url = tab?.url && /^https?:/i.test(tab.url) ? tab.url : null;
    const title = tab?.title || null;
    if (!url && !title && !windowTitle) return;

    const signature = `${taskTitle}\n${url || ''}\n${title || ''}\n${windowTitle || ''}`;
    if (signature === focusSession.lastPageSignature) return;

    const response = await fetch(`${BACKEND_ORIGIN}/api/metrics/classify-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, windowTitle, taskTitle }),
    });
    if (!response.ok) return;
    const { classification } = await response.json();
    if (
      focusSession.status !== 'focusing'
      || focusSession.id !== sessionId
      || focusSession.taskTitle !== taskTitle
    ) return;
    focusSession.lastPageSignature = signature;
    // pollFocus가 동기로 읽어서 이탈 여부를 override할 캐시. windowTitle을
    // 키로 남겨서, 탭이 이미 바뀐 뒤(재판정 전)에는 이 값을 안 쓰게 한다.
    focusSession.pageWindowTitle = windowTitle;
    focusSession.pageClassification = classification;
    focusSession.pageLabel = describeBrowserPage(url, title, windowTitle);
  } catch (err) {
    console.error('[electron] page classification failed:', err.message);
  } finally {
    focusSession.classifyingPage = false;
  }
}

// macOS Sonoma부터는 화면 기록 권한이 없으면 CGWindowListCopyWindowInfo가
// 다른 앱의 창 정보를 아예 안 돌려준다(get-windows의 activeWindow/openWindows가
// screenRecordingPermission:false로 title만 빼도 owner조차 못 얻어 집중 대상
// 앱을 인식하지 못하는 문제로 나타남). desktopCapturer.getSources() 호출 자체가
// macOS의 화면 기록 권한 다이얼로그를 띄우는 표준적인 트리거라 이를 이용해
// 앱을 처음 켤 때 자동으로 권한을 요청한다. 이미 허용/거부된 상태면 OS가
// 다이얼로그를 다시 띄우지 않으므로 매 실행마다 호출해도 안전하다.
async function ensureScreenRecordingPermission() {
  if (process.platform !== 'darwin') return;

  if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    try {
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    } catch (err) {
      console.error('[electron] 화면 기록 권한 요청 실패:', err.message);
    }
  }

  if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return;

  // '허용 안함'을 이미 눌렀거나 시스템이 다이얼로그를 안 띄운 경우(재실행 등) —
  // 직접 안내하고 정확한 설정 화면으로 보낸다.
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Zonemate 권한이 필요해요',
    message: '집중 상태를 판단하려면 화면 기록 권한이 필요해요',
    detail: '지금 어떤 앱을 보고 있는지 확인하는 용도로만 쓰이고, 화면 내용을 저장하거나 전송하지 않아요.\n\n"설정 열기"를 누른 뒤 목록에서 Zonemate를 켜고, Zonemate를 재시작해주세요.',
    buttons: ['설정 열기', '나중에'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
}

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
  // 게이지는 pollFocus가 상태(집중/이탈/자기창)에 맞는 mode로 updateGauge()를
  // 호출해 갱신한다 — 집중 앱에선 키/마우스 활동, 이탈 중엔 무조건 하강.
}

// React에 보낼 현재 상태 스냅샷. 진행 중인 구간까지 반영하려고 먼저 정산한다.
function recordFocusTimeline(now = Date.now(), force = false) {
  if (focusSession.status === 'idle' || focusSession.sessionStartedAt == null) return;

  const last = focusSession.timeline[focusSession.timeline.length - 1];
  if (!force && last && now - last.at < FOCUS_TIMELINE_SAMPLE_MS) return;

  const point = {
    at: now,
    elapsedMs: Math.max(0, now - focusSession.sessionStartedAt),
    gauge: Math.round(focusSession.gauge),
    state: focusSession.currentState,
  };
  if (last && last.at === now) focusSession.timeline[focusSession.timeline.length - 1] = point;
  else focusSession.timeline.push(point);
  if (focusSession.timeline.length > 1000) {
    focusSession.timeline = focusSession.timeline.filter((_, index) => index % 2 === 0);
  }
}

function buildFocusSnapshot() {
  const now = Date.now();
  if (focusSession.status !== 'idle') {
    accrueStats(now);
    recordFocusTimeline(now);
  }

  return {
    status: focusSession.status, // 'idle' | 'focusing' | 'onBreak'
    // 자기 창(Zonemate 대시보드)을 보는 중(state 'self')엔 이탈로 표시하지 않는다
    // — 트레이 열기든 알트탭이든 Zonemate를 보는 건 이탈이 아니다.
    isDrifting: focusSession.status === 'focusing'
      && focusSession.driftStartedAt != null
      && focusSession.currentState !== 'self',
    targetMinutes: focusSession.targetMinutes,
    taskTitle: focusSession.taskTitle,
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
    lastCompletedSummary: focusSession.lastCompletedSummary,
  };
}

function broadcastFocusState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('focus-state', buildFocusSnapshot());
  }
}

// 실시간 세션 미러링(모바일이 폴링) 푸시 간격 — 1초 브로드캐스트 타이머에
// 얹되, 서버에는 이보다 훨씬 뜸하게만 보낸다(매초 PUT은 과함).
const LIVE_SESSION_PUSH_INTERVAL_MS = 5000;
let lastLiveSessionPushAt = 0;

function startBroadcasting() {
  if (focusSession.broadcastTimer) clearInterval(focusSession.broadcastTimer);
  // 1초마다: 선제 알림(과몰입/집중 저하) 판단 후 상태를 React로 브로드캐스트.
  // pollFocus는 status==='focusing'일 때만 돌아서 휴식 중엔 반영이 안 되므로,
  // 상태 무관하게 도는 이 타이머에서 실시간 미러링 푸시도 같이 처리한다.
  focusSession.broadcastTimer = setInterval(() => {
    evaluateWellbeingAlerts();
    broadcastFocusState();
    const now = Date.now();
    if (now - lastLiveSessionPushAt >= LIVE_SESSION_PUSH_INTERVAL_MS) {
      lastLiveSessionPushAt = now;
      pushLiveFocusSession(focusSession.status);
    }
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
  focusSession.focusSegmentCount += 1;
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
  // 목표 시간이 있으면 그 1.5배, 없으면 절대 시간(폴백)을 과몰입 기준으로.
  const overfocusThresholdMs = focusSession.targetMinutes
    ? focusSession.targetMinutes * 60000 * OVERFOCUS_MULTIPLIER
    : OVERFOCUS_STREAK_MS;
  if (focusingNow && streakMs >= overfocusThresholdMs && now >= focusSession.overfocusSnoozedUntil) {
    focusSession.overfocusSnoozedUntil = now + OVERFOCUS_REMIND_MS;
    logFocusEvent('overfocus_alert', { streakMs, targetMinutes: focusSession.targetMinutes });
    const streakMin = Math.round(streakMs / 60000);
    const message = focusSession.targetMinutes
      ? `예정한 ${focusSession.targetMinutes}분을 넘겨 ${streakMin}분째 이어서 집중 중이에요. 잠깐 쉬는 건 어때요?`
      : `쉬지 않고 ${streakMin}분째 집중 중이에요. 잠깐 쉬는 건 어때요?`;
    showFocusAlert({
      type: 'overfocus',
      title: '오래 집중하고 있어요',
      message,
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
    return;
  }

  // 3) 게이지 저하(손이 멈춤): 집중력 게이지가 저점 아래로 일정 시간 이상 지속.
  //    창 기반 '집중 저하'(딴짓 누적)와는 다른 신호 — 집중 앱에 있어도 손이 오래
  //    멈춰 있으면(딴생각/자리 이탈 직전) 부드럽게 환기한다.
  if (
    focusSession.gaugeLowSince != null
    && now - focusSession.gaugeLowSince >= GAUGE_LOW_ALERT_MS
    && now >= focusSession.gaugeAlertSnoozedUntil
  ) {
    focusSession.gaugeAlertSnoozedUntil = now + GAUGE_ALERT_SNOOZE_MS;
    const lowMin = Math.round((now - focusSession.gaugeLowSince) / 60000);
    logFocusEvent('gauge_low_alert', { gauge: Math.round(focusSession.gauge), lowForMs: now - focusSession.gaugeLowSince });
    showFocusAlert({
      type: 'gauge_low',
      title: '집중이 흐트러진 것 같아요',
      message: `${lowMin}분째 키보드·마우스 움직임이 거의 없어요. 잠깐 스트레칭하거나 짧게 쉬어가는 건 어때요?`,
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

// 집중력 게이지를 키보드/마우스 활동으로 갱신한다. 등락 폭은 모멘텀 방식
// (gaugeMath.nextGauge): 집중(입력)이 이어질수록 상승이 빨라지고, 이탈(공백)이
// 이어질수록 하강이 점진 가속된다.
//   - os-tracker 패턴 점수가 신선하면: 활동 여부 + "질"(intensity)을 그 점수로 판단
//     — 규칙적/활발한 타이핑은 빠르게, 산발적 입력은 천천히 오름.
//   - 없으면(미실행/권한없음): powerMonitor.getSystemIdleTime() 이진 판정으로 폴백.
// 창 종류와 무관하게 "지금 손을 움직이고 있는가"만 본다(창 판단은 pollFocus에서 따로).
// 백엔드 focus-state를 폴링해 os-tracker 패턴 점수를 캐시한다(게이지 상승 조절용).
function fetchInputStateOnce() {
  const focusStateUrl = `${BACKEND_ORIGIN}/api/metrics/focus-state`;
  const req = httpClientFor(focusStateUrl).get(focusStateUrl, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        const s = (data.sessions || []).find((x) => x.clientId === OS_TRACKER_CLIENT_ID);
        if (s) {
          focusSession.inputScore = typeof s.inputScore === 'number' ? s.inputScore : 0;
          focusSession.inputAt = s.lastEventAt || null;
        }
      } catch { /* 파싱 실패는 무시 — 폴백 로직이 처리 */ }
    });
  });
  req.on('error', () => {}); // 백엔드 응답 없으면 getSystemIdleTime 폴백
  req.setTimeout(1500, () => req.destroy());
}

// os-tracker(전역 키/마우스 캡처)를 자식 프로세스로 띄운다. 패키지 빌드에선
// 네이티브 모듈 번들 검증이 필요해 아직 dev(비패키지)에서만 실행 — 실패
// (미설치/권한없음)해도 게이지는 getSystemIdleTime 폴백으로 계속 동작한다.
function startOsTracker() {
  if (app.isPackaged || osTrackerProcess) return;
  const entry = path.join(ROOT, 'os-tracker', 'tracker.js');
  if (!fs.existsSync(entry)) return;
  try {
    osTrackerProcess = spawn('node', [entry], {
      cwd: path.join(ROOT, 'os-tracker'),
      stdio: 'inherit',
      env: { ...process.env, METRICS_CLIENT_ID: OS_TRACKER_CLIENT_ID },
    });
    osTrackerProcess.on('exit', () => { osTrackerProcess = null; });
    osTrackerProcess.on('error', (err) => {
      console.error('[electron] os-tracker 시작 실패(게이지는 폴백):', err.message);
      osTrackerProcess = null;
    });
  } catch (err) {
    console.error('[electron] os-tracker spawn 예외:', err.message);
  }
}

function stopOsTracker() {
  if (osTrackerProcess) { osTrackerProcess.kill(); osTrackerProcess = null; }
}

// 집중력 게이지를 상태(mode)에 맞게 한 tick 갱신한다.
//   - 'active'(집중 앱에 있음): 키/마우스 활동으로 오르내림. 패턴 점수가 신선하면
//     그 점수로 상승 "질"을 조절, 없으면 getSystemIdleTime 폴백.
//   - 'fall'(이탈 중): 딴 앱에서 아무리 타이핑해도 집중 점수는 떨어져야 하므로
//     입력과 무관하게 GAUGE_DRIFT_DROP만큼 뚜렷하게 하강.
//   - 'hold'(자기 창=Zonemate 보는 중): 유지(올리지도 내리지도 않음).
function updateGauge(mode) {
  if (mode === 'hold') return;

  if (mode === 'fall') {
    // 이탈 중 — 입력과 무관하게 눈에 띄게 하강한다(고정폭).
    focusSession.activeStreak = 0;
    focusSession.idleStreak += 1;
    focusSession.gauge = Math.max(0, focusSession.gauge - GAUGE_DRIFT_DROP);
  } else {
    // 'active' — 집중 앱에 있음. 키/마우스 활동으로 오르내림.
    const now = Date.now();
    const fresh = focusSession.inputAt != null && now - focusSession.inputAt < INPUT_FRESH_MS;
    let active;
    let intensity = 1;
    if (fresh) {
      active = focusSession.inputScore > 0;
      // 활동이 있으면 최소 0.2는 보장(아주 산발적이어도 조금은 오르게), 최대 1.
      intensity = active ? Math.max(0.2, focusSession.inputScore / 100) : 1;
    } else {
      active = powerMonitor.getSystemIdleTime() < GAUGE_ACTIVE_IDLE_SEC;
    }
    const next = nextGauge(
      {
        gauge: focusSession.gauge,
        activeStreak: focusSession.activeStreak,
        idleStreak: focusSession.idleStreak,
      },
      active,
      undefined,
      intensity,
    );
    focusSession.gauge = next.gauge;
    focusSession.activeStreak = next.activeStreak;
    focusSession.idleStreak = next.idleStreak;
  }

  // 게이지 저하 지속시간 추적(게이지 기반 알림용).
  if (focusSession.gauge < GAUGE_LOW_THRESHOLD) {
    if (focusSession.gaugeLowSince == null) focusSession.gaugeLowSince = Date.now();
  } else {
    focusSession.gaugeLowSince = null;
  }
}

async function pollFocus() {
  if (focusSession.status !== 'focusing') return;
  fetchInputStateOnce();
  try {
    // Zonemate 자기 자신은 집중 대상에서 항상 제외한다(대시보드/알림/설정 창을
    // 보는 건 이탈도 집중도 아님). 게이지는 'hold'로 유지한다.
    // 1) 우리 창이 포커스됐으면(트레이 열기/클릭) 바로 self.
    if (BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocused())) {
      updateGauge('hold');
      setCurrentState('self');
      return;
    }

    const { activeWindow } = await loadGetWindows();
    const info = await activeWindow({ accessibilityPermission: false, screenRecordingPermission: false });
    const activeApp = appIdentity(info);

    // 2) 알트탭 등으로 활성 창이 우리 앱 자신이면(isFocused가 아직 안 잡혀도) self.
    //    isFocused()만 믿으면 알트탭 진입 순간 우리 창을 '딴 앱'으로 오판해 이탈로
    //    잡히는 버그가 있었다 — 활성 창 소유 프로세스가 우리 pid면 self로 처리.
    if (info?.owner?.processId != null && info.owner.processId === process.pid) {
      updateGauge('hold');
      setCurrentState('self');
      return;
    }

    let onFocusApp = activeApp && focusSession.focusAppIds.has(activeApp.appId);
    const now = Date.now();
    const activeWindowTitle = info?.title || null;
    const isBrowser = activeApp && /chrome|edge|firefox|safari|brave|opera|vivaldi|arc/i.test(activeApp.name);

    if (isBrowser) {
      void classifyCurrentBrowserPage(activeWindowTitle);
    }

    // 브라우저가 집중 대상 앱으로 선택돼 있어도, 지금 보는 탭이 작업과
    // 무관하다고 LLM이 판정했으면(캐시가 지금 창 제목 기준으로 신선할 때만)
    // 다른 앱을 켠 것과 동일하게 이탈로 취급한다 — "허용한 앱이지만 관련
    // 없는 탭"까지 걸러내는 게 이 기능의 핵심이라 앱 단위 판정만으론 부족.
    // 아직 재판정 전(탭을 막 바꿔서 캐시가 이전 제목 기준)이면 이탈로
    // 단정하지 않고 그대로 집중으로 둔다.
    let pageDriftLabel = null;
    if (
      onFocusApp && isBrowser
      && focusSession.pageWindowTitle === activeWindowTitle
      && focusSession.pageClassification === 'unrelated'
    ) {
      onFocusApp = false;
      pageDriftLabel = focusSession.pageLabel || '관련 없는 페이지';
    }

    if (onFocusApp) {
      if (focusSession.ignoredCurrentDrift) {
        // 무시하기를 누른 이탈에서 돌아온 경우엔 자동으로 이탈 종료 처리하지
        // 않는다 — "재개하기"를 눌러 명시적으로 확인해야 실제로 집중을
        // 재개한 것으로 본다. 확인 전까지는 이탈 상태(및 통계)를 그대로 유지.
        setCurrentState('drift');
        updateGauge('fall'); // 이탈 중 → 입력 있어도 게이지 하강
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
      updateGauge('active'); // 집중 앱에 있음 → 키/마우스 활동으로 게이지 오르내림
      focusSession.lastFocusApp = activeApp;
      focusSession.driftStartedAt = null;
      focusSession.driftAppName = null;
      if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
      return;
    }

    setCurrentState('drift');
    updateGauge('fall'); // 이탈 중 → 입력 있어도 게이지 하강
    if (!focusSession.driftStartedAt) {
      focusSession.driftStartedAt = now;
      // 브라우저의 관련 없는 탭 때문에 이탈로 판정된 경우엔 앱 이름("Chrome")
      // 대신 그 페이지가 뭔지(pageDriftLabel, 예: "유튜브 쇼츠")를 보여준다 —
      // 안 그러면 "허용한 브라우저에서 벗어났어요"처럼 앞뒤가 안 맞게 뜬다.
      focusSession.driftAppName = pageDriftLabel || info?.owner?.name || '다른 창';
      focusSession.driftCount += 1;
      logFocusEvent('drift_start', { toApp: focusSession.driftAppName, viaPageClassification: Boolean(pageDriftLabel) });
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

function startFocusSession(focusApps, targetMinutes = null, taskTitle = null) {
  const now = Date.now();
  focusSession.id = randomUUID();
  focusSession.targetMinutes = Number.isFinite(targetMinutes) && targetMinutes >= 1
    ? Math.round(targetMinutes)
    : null;
  focusSession.taskTitle = typeof taskTitle === 'string' && taskTitle.trim() ? taskTitle.trim() : null;
  focusSession.status = 'focusing';
  focusSession.focusApps = focusApps;
  focusSession.focusAppIds = new Set(focusApps.map((a) => a.appId));
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;
  focusSession.snoozedUntil = 0;
  focusSession.ignoredCurrentDrift = false;
  focusSession.pendingReturnApp = null;
  focusSession.lastFocusApp = focusApps[0] || null;
  // 이전 세션(다른 작업)의 페이지 관련성 캐시가 새 세션에 잘못 적용되지
  // 않도록 초기화.
  focusSession.lastPageSignature = null;
  focusSession.pageWindowTitle = null;
  focusSession.pageClassification = null;
  focusSession.pageLabel = null;

  // 통계 초기화 — 새 세션 시작이므로 게이지도 만점에서 출발한다.
  focusSession.sessionStartedAt = now;
  focusSession.focusSegmentCount = 0;
  focusSession.timeline = [];
  focusSession.lastCompletedSummary = null;
  beginFocusStreak(now);
  focusSession.currentState = 'focus';
  focusSession.accountedAt = now;
  focusSession.totalFocusMs = 0;
  focusSession.totalDriftMs = 0;
  focusSession.totalBreakMs = 0;
  focusSession.lastReturnMs = null;
  focusSession.driftCount = 0;
  focusSession.gauge = 50;
  focusSession.activeStreak = 0;
  focusSession.idleStreak = 0;
  focusSession.gaugeLowSince = null;
  focusSession.inputScore = 0;
  focusSession.inputAt = null;
  focusSession.underfocusSnoozedUntil = 0;

  logFocusEvent('session_start', {
    focusApps: focusApps.map((a) => a.name),
    taskTitle: focusSession.taskTitle,
    targetMinutes: focusSession.targetMinutes,
  });

  if (focusSession.pollTimer) clearInterval(focusSession.pollTimer);
  focusSession.pollTimer = setInterval(pollFocus, POLL_INTERVAL_MS);
  startBroadcasting();
  lastLiveSessionPushAt = Date.now();
  pushLiveFocusSession('focusing'); // 5초 주기까지 안 기다리고 시작을 바로 반영

  console.log('[electron] 집중 세션 시작 — 집중 앱:', focusApps.map((a) => a.name).join(', '));
  refreshTray();
  broadcastFocusState();
}

function stopFocusSession() {
  if (focusSession.status === 'idle') return;

  const endedAt = Date.now();
  accrueStats(endedAt);
  recordFocusTimeline(endedAt, true);
  const activeMs = focusSession.totalFocusMs + focusSession.totalDriftMs;
  const averageFocusMs = focusSession.focusSegmentCount > 0
    ? Math.round(focusSession.totalFocusMs / focusSession.focusSegmentCount)
    : 0;
  focusSession.lastCompletedSummary = {
    id: focusSession.id,
    taskTitle: focusSession.taskTitle,
    startedAt: focusSession.sessionStartedAt,
    endedAt,
    totalElapsedMs: Math.max(0, endedAt - focusSession.sessionStartedAt),
    totalFocusMs: focusSession.totalFocusMs,
    totalDriftMs: focusSession.totalDriftMs,
    totalBreakMs: focusSession.totalBreakMs,
    averageFocusMs,
    focusSegmentCount: focusSession.focusSegmentCount,
    focusRate: activeMs > 0 ? Math.round((focusSession.totalFocusMs / activeMs) * 100) : 0,
    driftCount: focusSession.driftCount,
    timeline: focusSession.timeline.map((point) => ({ ...point })),
  };
  logFocusEvent('session_end', {
    totalFocusMs: focusSession.totalFocusMs,
    totalDriftMs: focusSession.totalDriftMs,
    totalBreakMs: focusSession.totalBreakMs,
    driftCount: focusSession.driftCount,
    averageFocusMs,
    focusSegmentCount: focusSession.focusSegmentCount,
    focusRate: focusSession.lastCompletedSummary.focusRate,
    totalElapsedMs: focusSession.lastCompletedSummary.totalElapsedMs,
    timeline: focusSession.lastCompletedSummary.timeline,
  });

  stopOsTracker(); // 집중 세션 끝나면 키/마우스 수집도 중단
  stopLiveFocusSession(); // 다른 기기가 폴링 중이면 바로 idle로 보이게(스테일 대기 없이)

  focusSession.status = 'idle';
  focusSession.id = null;
  focusSession.currentState = 'idle';
  focusSession.taskTitle = null;
  focusSession.driftStartedAt = null;
  focusSession.driftAppName = null;
  focusSession.ignoredCurrentDrift = false;
  focusSession.pendingReturnApp = null;
  focusSession.focusStreakStartedAt = null;
  focusSession.breakStartedAt = null;
  focusSession.sessionStartedAt = null;
  focusSession.accountedAt = null;

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
  lastLiveSessionPushAt = Date.now();
  pushLiveFocusSession('onBreak');
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
  lastLiveSessionPushAt = Date.now();
  pushLiveFocusSession('focusing');
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
  let trayImage;
  if (process.platform === 'darwin') {
    // macOS 메뉴바는 템플릿 이미지(검정+알파)를 받으면 다크/라이트에 맞춰
    // 흰색·검정으로 자동 렌더한다. @2x는 옆에 있으면 자동으로 로드된다.
    trayImage = nativeImage.createFromPath(path.join(__dirname, 'tray-iconTemplate.png'));
    trayImage.setTemplateImage(true);
  } else {
    // 윈도우/리눅스는 템플릿을 지원하지 않으므로 흰색 아이콘을 그대로 쓴다.
    trayImage = path.join(__dirname, 'tray-icon.png');
  }
  tray = new Tray(trayImage);
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

ipcMain.on('start-focus-session', (event, payload) => {
  // 예전 형태(배열=focusApps)와 새 형태({ focusApps, targetMinutes, taskTitle }) 모두 허용.
  const focusApps = Array.isArray(payload) ? payload : (payload?.focusApps || []);
  const targetMinutes = Array.isArray(payload) ? null : payload?.targetMinutes;
  const taskTitle = Array.isArray(payload) ? null : payload?.taskTitle;
  startFocusSession(focusApps, targetMinutes, taskTitle);
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
ipcMain.on('dismiss-focus-summary', () => {
  focusSession.lastCompletedSummary = null;
  broadcastFocusState();
});
ipcMain.on('resume-focus', () => endBreak('manual'));
ipcMain.handle('get-focus-state', () => buildFocusSnapshot());
ipcMain.handle('get-app-version', () => app.getVersion());

app.whenReady().then(async () => {
  createTray();
  // 창이 뜨기를 기다리지 않고 바로 요청 — 사용자가 앱을 여는 순간 macOS
  // 권한 다이얼로그가 뜨도록 한다. 백엔드/프론트 기동을 막지 않기 위해
  // await하지 않는다.
  void ensureScreenRecordingPermission();

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
  stopOsTracker();
});
