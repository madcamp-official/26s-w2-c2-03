// 집중력 게이지(0~100) 순수 산식 — 부수효과 없음, 같은 입력이면 같은 출력.
// main.js에서 매 폴 tick마다 호출한다. 순수 함수라 GUI 없이 단위 테스트 가능
// (gaugeMath.test.js 참고).
//
// 등락은 "모멘텀" 방식: 짧은 입력/공백은 조금만 움직이고(천천히), 집중(입력)이
// 이어질수록 상승 폭이 커지고, 이탈(입력 없음)이 이어질수록 하강 폭이 점진적으로
// 커진다. 연속 tick 수(activeStreak/idleStreak)에 비례해 스텝을 키우되 상한을 둔다.

const GAUGE_MOMENTUM = {
  baseUp: 1,     // 활동 첫 tick 상승폭(작게 시작 = 천천히)
  accelUp: 0.6,  // 활동이 이어질 때마다 tick당 추가 상승폭
  maxUp: 6,      // 상승폭 상한(집중이 길어져도 이 이상은 안 올림)
  baseDown: 0.6, // 유휴 첫 tick 하강폭
  accelDown: 0.4,// 유휴가 이어질 때마다 tick당 추가 하강폭(점진 가속)
  maxDown: 5,    // 하강폭 상한
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 게이지 상태 한 tick 전개.
 * @param {{gauge:number, activeStreak:number, idleStreak:number}} state
 * @param {boolean} active 이번 tick에 키/마우스 입력이 있었는가
 * @param {typeof GAUGE_MOMENTUM} [cfg]
 * @returns {{gauge:number, activeStreak:number, idleStreak:number, step:number}}
 */
function nextGauge(state, active, cfg = GAUGE_MOMENTUM) {
  let { gauge, activeStreak, idleStreak } = state;
  let step;
  if (active) {
    idleStreak = 0;
    activeStreak += 1;
    step = Math.min(cfg.maxUp, cfg.baseUp + cfg.accelUp * (activeStreak - 1));
    gauge = clamp(gauge + step, 0, 100);
  } else {
    activeStreak = 0;
    idleStreak += 1;
    step = -Math.min(cfg.maxDown, cfg.baseDown + cfg.accelDown * (idleStreak - 1));
    gauge = clamp(gauge + step, 0, 100);
  }
  return { gauge, activeStreak, idleStreak, step };
}

module.exports = { nextGauge, GAUGE_MOMENTUM, clamp };
