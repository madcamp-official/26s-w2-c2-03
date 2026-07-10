const { uIOhook } = require('uiohook-napi');
const axios = require('axios');

// 🌟 중요: 아까 backend 서버 포트인 4000번으로 주소를 정확히 맞춰줍니다.
const BACKEND_URL = 'http://localhost:4000/api/metrics';

// 사용자의 입력을 임시로 담아둘 바구니(버퍼)
let dataBuffer = [];

console.log("=========================================");
console.log("       OS 입력 수집 에이전트 가동        ");
console.log("=========================================");

// 1. 전역 마우스 클릭 이벤트 낚아채기
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

// 3. 주기적 발송 모터 달기 (5초마다 백엔드로 수집된 데이터 발송)
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

// 수집기 실행
uIOhook.start();

console.log("\n실시간 백그라운드 수집기가 작동 중입니다.");
console.log("💡 완벽한 전체 창 수집을 원하시면 터미널을 [관리자 권한]으로 실행하세요!");
console.log("-----------------------------------------");
