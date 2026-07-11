// 순수 함수형 집중 상태 판별 엔진.
//
// 부수효과(I/O, DB 접근, 타이머, 네트워크) 전혀 없음 — 같은 입력이면 항상
// 같은 출력이 나오는 순수 함수들로만 구성했다. 그래서 실제 os-tracker/팀원의
// 활성 창 로직이 완성되기 전에도 합성(가짜) 이벤트로 미리 검증할 수 있다
// (focusEngine.synthetic-test.js 참고). 나중에 실제 파이프라인에서는 이
// tickFocusState()를 주기적으로(예: 1분마다) 호출하는 쪽만 새로 짜면 된다.
//
// 판단 축은 두 가지 ADHD 실패 모드에 맞춰져 있다 (판단하는 말투 없이
// 팩트만 전달하는 게 원칙):
//   - 이탈(drift): 계획과 무관한(distraction) 창에 일정 시간 이상 머무름
//   - 과몰입(overfocus): 계획한 작업을 쉬지 않고 예정 시간의 일정 배수 이상 지속

// ---- 판정 기준 상수 (튜닝 포인트) ----

// 이 이상 연속으로 "이탈" 상태가 지속되면 알림을 한 번 띄운다.
export const DRIFT_THRESHOLD_MINUTES = 10;

// 계획한 시간(targetMinutes)의 이 배수를 쉬지 않고 넘기면 "과몰입" 알림.
export const OVERFOCUS_MULTIPLIER = 1.5;

// 지수이동평균(EMA) 스무딩 계수. 1분 간격 tick 기준으로, 클수록 최근
// 샘플에 민감(짧은 딴짓에도 바로 반응), 작을수록 둔감(반응은 느리지만
// 노이즈에 강함). 0.35면 2~3분 정도의 짧은 알트탭은 무시하면서도 진짜
// 이탈에는 반응하는 정도로 잡았다.
export const EMA_ALPHA = 0.35;

// ema가 이 값 이상이면 "작업 중", 이 값 이하면 "이탈"로 간주한다. 그 사이는
// "중립"이라 어느 쪽으로도 상태가 바뀌지 않는다 — 경계값 근처에서 상태가
// 작업중↔이탈로 계속 뒤집히는(flapping) 걸 막는 히스테리시스다.
export const WORK_ENTER_THRESHOLD = 0.5;
export const DRIFT_ENTER_THRESHOLD = -0.5;

// 활동(클릭+키입력)이 이 시간 이상 0이면 "자리 비움"으로 보고 창 분류와
// 무관하게 중립 처리한다 — VS Code를 띄워둔 채 자리를 비운 걸 과몰입으로,
// 혹은 무슨 창인지 몰라서 이탈로 오판하지 않기 위함.
export const IDLE_THRESHOLD_MINUTES = 3;

// ---- 앱/도메인 분류 ----
// 목록에 없는 앱/도메인은 항상 'neutral'로 처리한다. 모르는 대상을
// 성급하게 "이탈"로 판단하지 않는 게 "팩트 기반, 판단 없는" 원칙에 맞다 —
// 확신 없는 케이스에서는 아무 판단도 하지 않는 쪽을 택한다.

export const WORK_APP_NAMES = new Set([
  'Code', 'Visual Studio Code', 'Cursor',
  'Terminal', 'iTerm2', 'iTerm',
  'Xcode', 'Android Studio',
  'Postman', 'Insomnia', 'TablePlus', 'Docker Desktop',
  'Figma', 'Notion',
]);

export const DISTRACTION_APP_NAMES = new Set([
  'Netflix', 'Steam', 'Instagram', 'TikTok', 'Twitter', 'X',
]);

export const WORK_DOMAINS = [
  'github.com', 'stackoverflow.com', 'developer.mozilla.org', 'npmjs.com', 'localhost',
];

export const DISTRACTION_DOMAINS = [
  'youtube.com', 'netflix.com', 'twitch.tv', 'instagram.com', 'tiktok.com',
  'twitter.com', 'x.com', 'reddit.com', 'facebook.com',
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matchesDomainList(hostname, list) {
  return list.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

/**
 * 활성 창 정보 하나를 'work' | 'distraction' | 'neutral'로 분류한다.
 * @param {{appName?: string, windowTitle?: string, url?: string|null}|null} window
 * @returns {'work'|'distraction'|'neutral'}
 */
export function classifyWindow(window) {
  if (!window || !window.appName) return 'neutral';

  if (window.url) {
    const hostname = hostnameOf(window.url);
    if (hostname) {
      if (matchesDomainList(hostname, DISTRACTION_DOMAINS)) return 'distraction';
      if (matchesDomainList(hostname, WORK_DOMAINS)) return 'work';
    }
    return 'neutral'; // 목록에 없는 브라우저 탭은 애매하니 중립
  }

  if (DISTRACTION_APP_NAMES.has(window.appName)) return 'distraction';
  if (WORK_APP_NAMES.has(window.appName)) return 'work';
  return 'neutral';
}

const SCORE_BY_CLASSIFICATION = { work: 1, distraction: -1, neutral: 0 };

/**
 * @param {number} [now] ms epoch
 * @returns 초기 상태 객체. tickFocusState()의 첫 prevState로 사용한다.
 */
export function createInitialFocusState(now = Date.now()) {
  return {
    ema: 0,
    status: 'neutral', // 'onTask' | 'drifting' | 'neutral'
    classification: 'neutral',
    streakStartedAt: now,
    lastSampleAt: now,
    idleStreakMinutes: 0,
    driftAlerted: false,
    overfocusAlerted: false,
  };
}

/**
 * 새 샘플 하나를 반영해서 다음 상태를 계산하는 순수 함수 — 부수효과 없음,
 * 같은 입력이면 항상 같은 출력이 나온다.
 *
 * @param {object} prevState createInitialFocusState() 또는 이 함수의 이전 반환값
 * @param {object} sample
 * @param {number} sample.timestamp ms epoch
 * @param {{appName?:string, windowTitle?:string, url?:string|null}|null} sample.window
 * @param {number} [sample.activityCount] 이번 tick 구간의 클릭+키입력 수(idle 판정용, 생략 시 idle 판정 안 함)
 * @param {{title:string, type:'task'|'break', targetMinutes:number}|null} currentTask
 *   지금 시각에 계획상 진행 중이어야 할 작업. 계획 없는 시간대면 null.
 * @param {object} [options] 기본 상수 대신 쓸 임계값(테스트용)
 * @returns {object} nextState — alerts 필드에 이번 tick에서 새로 발생한 알림 배열(보통 빈 배열)
 */
export function tickFocusState(prevState, sample, currentTask, options = {}) {
  const {
    driftThresholdMinutes = DRIFT_THRESHOLD_MINUTES,
    overfocusMultiplier = OVERFOCUS_MULTIPLIER,
    emaAlpha = EMA_ALPHA,
    workEnterThreshold = WORK_ENTER_THRESHOLD,
    driftEnterThreshold = DRIFT_ENTER_THRESHOLD,
    idleThresholdMinutes = IDLE_THRESHOLD_MINUTES,
  } = options;

  const minutesSinceLastSample = (sample.timestamp - prevState.lastSampleAt) / 60000;
  const idleStreakMinutes = sample.activityCount === 0
    ? prevState.idleStreakMinutes + Math.max(minutesSinceLastSample, 0)
    : 0;
  const isIdle = idleStreakMinutes >= idleThresholdMinutes;

  const classification = isIdle ? 'neutral' : classifyWindow(sample.window);
  const score = SCORE_BY_CLASSIFICATION[classification];
  const ema = emaAlpha * score + (1 - emaAlpha) * prevState.ema;

  let status = 'neutral';
  if (ema >= workEnterThreshold) status = 'onTask';
  else if (ema <= driftEnterThreshold) status = 'drifting';

  const statusChanged = status !== prevState.status;
  const streakStartedAt = statusChanged ? sample.timestamp : prevState.streakStartedAt;
  const streakMinutes = (sample.timestamp - streakStartedAt) / 60000;

  const alerts = [];
  let driftAlerted = statusChanged ? false : prevState.driftAlerted;
  let overfocusAlerted = statusChanged ? false : prevState.overfocusAlerted;

  if (status === 'drifting' && !driftAlerted && streakMinutes >= driftThresholdMinutes) {
    driftAlerted = true;
    const minutes = Math.round(streakMinutes);
    alerts.push({
      type: 'drift',
      minutes,
      since: streakStartedAt,
      message: `${minutes}분째 다른 창이에요`,
    });
  }

  if (
    status === 'onTask' &&
    currentTask &&
    currentTask.type === 'task' &&
    !overfocusAlerted &&
    streakMinutes >= currentTask.targetMinutes * overfocusMultiplier
  ) {
    overfocusAlerted = true;
    const minutes = Math.round(streakMinutes);
    alerts.push({
      type: 'overfocus',
      minutes,
      plannedMinutes: currentTask.targetMinutes,
      since: streakStartedAt,
      message: `예정(${currentTask.targetMinutes}분)보다 ${minutes - currentTask.targetMinutes}분 더 이어서 하고 있어요`,
    });
  }

  return {
    ema,
    status,
    classification,
    streakStartedAt,
    lastSampleAt: sample.timestamp,
    idleStreakMinutes,
    driftAlerted,
    overfocusAlerted,
    alerts,
  };
}
