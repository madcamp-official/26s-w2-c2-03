import { useEffect, useState } from 'react';

// 일렉트론 데스크톱 앱에서 노출한 window.zonemate 브리지를 감싼 훅.
// 일반 브라우저에서는 window.zonemate가 없으므로 isDesktop=false로 떨어지고,
// 집중 모드 UI는 렌더링하지 않는다(기존 웹 사용에는 영향 없음).
//
// 메인 프로세스가 1초마다 상태 스냅샷을 브로드캐스트한다. 실시간 타이머를
// 부드럽게 굴리려고, 스냅샷의 타임스탬프 + 로컬 시계(nowTick)로 경과 시간을
// 계산한다(같은 기기라 시계 차이는 무시 가능).
const bridge = typeof window !== 'undefined' ? window.zonemate : undefined;

export function useFocusSession() {
  const isDesktop = Boolean(bridge?.isDesktop);
  const [state, setState] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!isDesktop) return undefined;

    // 초기 상태 1회 조회 + 이후 브로드캐스트 구독
    bridge.getState().then(setState).catch(() => {});
    const unsubscribe = bridge.onState(setState);
    return unsubscribe;
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return undefined;
    const active = state && state.status !== 'idle';
    if (!active) return undefined;
    const timer = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isDesktop, state?.status]);

  const controls = {
    getOpenApps: () => bridge.getOpenApps(),
    startFocus: (apps, opts) => bridge.startFocus(apps, opts),
    stopFocus: () => bridge.stopFocus(),
    dismissSummary: () => bridge.dismissFocusSummary(),
    startBreak: (minutes) => bridge.startBreak(minutes),
    resumeFocus: () => bridge.resumeFocus(),
  };

  return { isDesktop, state, now: nowTick, controls };
}
