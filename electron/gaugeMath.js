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

function resolveGaugeActivity({
  mode,
  inputAt,
  inputScore,
  now,
  systemIdleSeconds,
  trackerGraceMs = 7000,
  systemIdleThresholdSeconds = 4,
}) {
  if (mode !== 'active') return { active: false, intensity: 1, source: mode };

  // tracker가 실제 입력 시각을 한 번 제공했다면 그 값을 기준으로만 판단한다.
  // 오래된 점수 뒤에 OS idle로 되돌아가면 터치패드 미세 움직임 같은 신호가
  // 활동으로 잡혀 사용자가 손을 떼어도 게이지가 계속 오를 수 있다.
  if (Number.isFinite(inputAt)) {
    const age = now - inputAt;
    const active = age >= 0 && age < trackerGraceMs;
    const score = Number.isFinite(inputScore) ? inputScore : 0;
    return {
      active,
      intensity: active ? Math.max(0.2, score / 100) : 1,
      source: 'tracker',
    };
  }

  return {
    active: systemIdleSeconds < systemIdleThresholdSeconds,
    intensity: 1,
    source: 'system-idle',
  };
}

/**
 * 게이지 상태 한 tick 전개.
 * @param {{gauge:number, activeStreak:number, idleStreak:number}} state
 * @param {boolean} active 이번 tick에 키/마우스 입력이 있었는가
 * @param {typeof GAUGE_MOMENTUM} [cfg]
 * @param {number} [intensity] 상승폭 배율 0~1 (입력의 "질". 1=기본, 낮을수록 천천히 오름).
 *   패턴 점수(강도·리듬·밀도)가 있을 때 이걸로 상승 속도를 조절한다. 하강엔 영향 없음.
 * @returns {{gauge:number, activeStreak:number, idleStreak:number, step:number}}
 */
function nextGauge(state, active, cfg = GAUGE_MOMENTUM, intensity = 1) {
  let { gauge, activeStreak, idleStreak } = state;
  let step;
  if (active) {
    idleStreak = 0;
    activeStreak += 1;
    const scale = clamp(intensity, 0, 1);
    step = scale * Math.min(cfg.maxUp, cfg.baseUp + cfg.accelUp * (activeStreak - 1));
    gauge = clamp(gauge + step, 0, 100);
  } else {
    activeStreak = 0;
    idleStreak += 1;
    step = -Math.min(cfg.maxDown, cfg.baseDown + cfg.accelDown * (idleStreak - 1));
    gauge = clamp(gauge + step, 0, 100);
  }
  return { gauge, activeStreak, idleStreak, step };
}

module.exports = { nextGauge, resolveGaugeActivity, GAUGE_MOMENTUM, clamp };
