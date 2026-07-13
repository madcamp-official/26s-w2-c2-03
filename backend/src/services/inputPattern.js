// 키보드/마우스 이벤트 "패턴" → 0~100 입력 집중 점수 (순수 함수, 부수효과 없음).
//
// os-tracker가 보내는 원시 이벤트(keydown/click, 타임스탬프 포함)를 최근 창(window)
// 단위로 보고, 단순 "입력이 있나/없나"를 넘어 다음 특징으로 집중의 질을 매긴다:
//   - 강도(intensity): 분당 이벤트 수. 활발히 손을 움직일수록 높음.
//   - 밀도(density): 창을 잘게 쪼갰을 때 이벤트가 있는 구간 비율. 꾸준할수록 높음.
//   - 리듬(rhythm): 연속 키 입력 간격의 변동계수(CV). 규칙적일수록(몰입 타이핑) 높음.
//   - 키보드 비중(keyRatio): 타이핑이 산발적 클릭보다 깊은 집중에 가깝다고 본다.
//
// 판단 없는 "팩트 기반" 원칙에 맞춰, 이벤트가 아예 없으면 0(=자리비움/손 멈춤)으로 둔다.

const WINDOW_MS = 60_000; // 점수 산출 기준 창(최근 60초)
const BUCKET_MS = 5_000; // 밀도 계산용 버킷 크기
const INTENSITY_SAT = 120; // 분당 이벤트 이 값이면 강도 만점(≈초당 2회)
const CV_ZERO_AT = 1.5; // 키 간격 CV가 이 값 이상이면 리듬 점수 0

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * 최근 창의 이벤트로 특징을 뽑는다.
 * @param {{type:string, t:number}[]} events  시간(ms) 포함 이벤트들
 * @param {number} now  기준 시각(ms)
 * @param {number} [windowMs]
 */
export function computeInputFeatures(events, now, windowMs = WINDOW_MS) {
  const from = now - windowMs;
  const recent = events.filter((e) => e.t >= from && e.t <= now);
  const keys = recent.filter((e) => e.type === 'keydown');
  const total = recent.length;
  const minutes = windowMs / 60000;

  const eventsPerMin = total / minutes;
  const keyRatio = total ? keys.length / total : 0;

  // 리듬: 연속 keydown 간격의 평균과 변동계수(CV = 표준편차/평균).
  const keyTimes = keys.map((e) => e.t).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < keyTimes.length; i += 1) gaps.push(keyTimes[i] - keyTimes[i - 1]);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const variance = gaps.length ? gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length : 0;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  // 밀도: 창을 BUCKET_MS 버킷으로 나눠 이벤트가 있는 버킷 비율.
  const nBuckets = Math.max(1, Math.round(windowMs / BUCKET_MS));
  const filled = new Set();
  for (const e of recent) filled.add(Math.floor((e.t - from) / BUCKET_MS));
  const density = filled.size / nBuckets;

  return { total, eventsPerMin, keyRatio, interKeyMean: mean, interKeyCV: cv, density };
}

/**
 * 특징을 0~100 점수로 매핑. 이벤트가 없으면 0.
 * 가중 평균: 강도 0.35 + 밀도 0.35 + 리듬 0.2 + 키보드비중 0.1.
 */
export function scoreInputWindow(events, now, windowMs = WINDOW_MS) {
  const f = computeInputFeatures(events, now, windowMs);
  if (f.total === 0) return { score: 0, features: f };

  const intensity = clamp01(f.eventsPerMin / INTENSITY_SAT);
  const density = clamp01(f.density);
  // 키가 2개 이상일 때만 리듬을 신뢰(간격이 있어야 CV가 의미 있음).
  const rhythm = f.interKeyMean > 0 ? clamp01(1 - f.interKeyCV / CV_ZERO_AT) : 0;
  const keyLean = clamp01(f.keyRatio);

  const score = 100 * (0.35 * intensity + 0.35 * density + 0.2 * rhythm + 0.1 * keyLean);
  return { score: Math.round(score), features: f };
}

export const INPUT_PATTERN_WINDOW_MS = WINDOW_MS;
