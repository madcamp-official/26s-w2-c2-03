// 원래 쓰던 uiohook-napi(SnosMe)는 macOS 14+에서 이벤트를 아예 못 잡는
// 미해결 업스트림 버그가 있어서(GitHub #36, 우리 증상과 정확히 일치:
// start()는 성공하지만 클릭/키 입력이 하나도 안 잡힘), 최신 libuiohook
// 소스를 반영한 커뮤니티 포크로 교체함. API는 100% 동일해서 이 줄만 바뀜.
const { uIOhook } = require('@mukea/uiohook-napi');
const axios = require('axios');

// 🌟 중요: 아까 backend 서버 포트인 4000번으로 주소를 정확히 맞춰줍니다.
const BACKEND_URL = 'http://localhost:4000/api/metrics';
const ACTIVE_WINDOW_POLL_MS = 2000;

// 사용자의 입력을 임시로 담아둘 바구니(버퍼)
let dataBuffer = [];
let lastWindowSignature = null;

console.log("=========================================");
console.log("       OS 입력 수집 에이전트 가동        ");
console.log("=========================================");

// 1. 전역 마우스 클릭 이벤트 낚아채기
// button 값(1=좌클릭, 2=우클릭, 3=휠클릭)은 uiohook-napi 내부의 libuiohook이
// OS별 원시 코드를 이미 이 값으로 정규화해서 넘겨주므로, Windows/Mac 둘 다
// 이 매핑을 그대로 써도 된다.
uIOhook.on('click', (e) => {
  const buttonType = e.button === 1 ? '좌클릭' : e.button === 2 ? '우클릭' : `기타(${e.button})`;

  dataBuffer.push({
    type: 'click',
    button: buttonType,
    x: e.x,
    y: e.y,
    time: new Date().toISOString()
  });
});

// 2. 전역 키보드 타이핑 이벤트 낚아채기
uIOhook.on('keydown', (e) => {
  dataBuffer.push({
    type: 'keydown',
    keycode: e.keycode,
    time: new Date().toISOString()
  });
});

// 3. 현재 활성 창 수집
// get-windows는 ESM 전용 패키지라 CommonJS 파일에서는 동적 import()로 불러온다.
// 매번 같은 창을 저장하지 않고 앱/제목/PID/창 ID가 바뀐 순간만 이벤트를 만든다.
async function startActiveWindowTracking() {
  try {
    const { activeWindow } = await import('get-windows');

    async function pollActiveWindow() {
      try {
        const windowInfo = await activeWindow({
          // 브라우저 URL은 확장에서 수집하므로 macOS 접근성 권한을 URL 용도로
          // 중복 요청하지 않는다. 창 제목에는 화면 기록 권한이 필요할 수 있다.
          accessibilityPermission: false,
        });

        if (windowInfo) {
          const signature = JSON.stringify([
            windowInfo.owner?.name,
            windowInfo.title,
            windowInfo.owner?.processId,
            windowInfo.id,
          ]);

          if (signature !== lastWindowSignature) {
            lastWindowSignature = signature;
            dataBuffer.push({
              type: 'active_window',
              platform: windowInfo.platform || process.platform,
              appName: windowInfo.owner?.name || null,
              windowTitle: windowInfo.title || null,
              processId: windowInfo.owner?.processId || null,
              processPath: windowInfo.owner?.path || null,
              bundleId: windowInfo.owner?.bundleId || null,
              windowId: windowInfo.id ?? null,
              memoryUsage: windowInfo.memoryUsage ?? null,
              time: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error('활성 창 정보를 읽지 못했어요:', err.message || err);
      } finally {
        setTimeout(pollActiveWindow, ACTIVE_WINDOW_POLL_MS);
      }
    }

    await pollActiveWindow();
  } catch (err) {
    console.error('get-windows를 불러오지 못했어요. npm install을 확인해주세요:', err.message || err);
  }
}

// 4. 주기적 발송 모터 달기 (5초마다 백엔드로 수집된 데이터 발송)
setInterval(async () => {
  // 바구니가 비어있으면 서버를 귀찮게 하지 않고 패스합니다.
  if (dataBuffer.length === 0) return;

  console.log(`[배달부] 현재 쌓인 데이터 ${dataBuffer.length}개를 서버로 발송합니다...`);

  // 발송하는 도중에 새로운 이벤트가 들어오면 꼬이므로 기존 바구니 복사 후 비우기
  const packetToSend = [...dataBuffer];
  dataBuffer = [];

  try {
    // 백엔드가 만들어둔 주소로 밀어 넣기
    const response = await axios.post(BACKEND_URL, packetToSend);
    if (response.data.status === 'success') {
      console.log('   -> ✅ 서버 전송 및 저장 성공!');
    }
  } catch (error) {
    console.error('   -> ❌ 서버 전송 실패! 사유:', error.message);
    // 실패했을 경우 유실을 막기 위해 데이터를 다시 바구니 앞쪽에 집어넣습니다.
    dataBuffer = [...packetToSend, ...dataBuffer];
  }
}, 5000); // 5000ms = 5초 주기

// 5. 플랫폼별 안내 문구 — Windows 안내를 Mac에서 그대로 띄우면(반대도 마찬가지)
// 실제 원인과 무관한 조치를 안내하게 되므로 실행 중인 OS에 맞는 안내만 띄운다.
function printPlatformGuidance() {
  if (process.platform === 'win32') {
    console.log("💡 완벽한 전체 창 수집을 원하시면 터미널을 [관리자 권한]으로 실행하세요!");
  } else if (process.platform === 'darwin') {
    console.log("💡 macOS는 손쉬운 사용(접근성) 권한이 없으면 입력을 아예 수집하지 못합니다.");
    console.log("   시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용에서 이 터미널(또는 실행 앱)에 권한을 켜주세요.");
  }
}

// 6. 수집기 실행 — macOS는 접근성 권한이 꺼져 있으면 start()가 예외를 던지며
// 즉시 크래시한다. try/catch 없이 두면 알아보기 힘든 네이티브 에러 스택만
// 남고 왜 안 되는지 안내가 없어서, 원인을 구분해 안내 메시지를 보여주고
// 깔끔하게 종료하도록 한다.
try {
  uIOhook.start();
} catch (err) {
  if (process.platform === 'darwin' && err.code === 'UIOHOOK_ERROR_AXAPI_DISABLED') {
    console.error("\n❌ macOS 접근성 권한이 꺼져 있어서 입력 수집을 시작하지 못했어요.");
    console.error("   시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용에서 이 터미널(또는 실행 앱)에 권한을 켜준 뒤 다시 실행해주세요.\n");
  } else {
    console.error('\n❌ 입력 수집기를 시작하지 못했어요:', err.message || err, '\n');
  }
  process.exit(1);
}

console.log("\n실시간 백그라운드 수집기가 작동 중입니다.");
void startActiveWindowTracking();
printPlatformGuidance();
console.log("-----------------------------------------");

// Ctrl+C로 종료할 때 프로세스를 확실히 죽인다. 처음에는 uIOhook.stop()을
// 먼저 부르고 나서 process.exit(0)을 불렀는데, 실제로 macOS에서
// uIOhook.stop()이 접근성 훅(네이티브 스레드)을 정리하다가 영영 멈춰버리는
// 게 재현됨 — stop()이 동기 호출이라 거기서 멈추면 그다음 줄인
// process.exit(0)에 아예 도달하지 못해서 Ctrl+C를 눌러도 프로세스가 안 죽는
// 원인이었다. stop()이 반환된다는 보장이 없으므로 아예 기다리지 않고
// 바로 강제 종료한다 — 어차피 프로세스가 죽으면 OS가 네이티브 훅도 같이
// 정리해준다.
function shutdown() {
  console.log('\n수집기를 종료합니다...');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
