import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchFocusSession, pushFocusSession, stopFocusSessionRemote, logFocusEvent } from '../api';
import { startShield, stopShield } from '../../modules/focus-shield';

// 세션 식별자 — 데스크톱은 uuid를 쓰지만 모바일은 간단히 시각+난수로 만든다.
function genSessionId() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const FocusSessionContext = createContext(null);

// 계정 전체(모든 기기)가 공유하는 "지금 집중 중" 상태를 앱 전역에서 항상
// 폴링한다. 데스크톱(electron/main.js의 pollRemoteMirror)이 전역으로 폴링하는
// 것과 대칭 — 예전엔 모바일이 집중 탭을 열고 있을 때만 폴링해서, PC에서
// 집중을 켜도 다른 탭에 있으면 감지를 못 하고 두 기기가 따로 놀았다.
//
// 세션이 활성(status !== 'idle')이면 어느 탭에 있든 전체화면 오버레이가
// 뜨고, 타이머는 양쪽 다 서버가 준 startedAt 하나만 기준으로 계산해서
// 5초 폴링 오차 안에서 동기화된다.
const POLL_MS = 5000;

export function FocusSessionProvider({ children }) {
  const [session, setSession] = useState({ status: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null); // 방금 끝난 집중 세션 요약(종료 시 표시)
  const cancelledRef = useRef(false);
  // stopFocus가 항상 최신 session을 읽도록 ref로도 들고 있는다(useCallback 의존성 안정).
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 딴짓(앱 이탈) 집계용. 모바일은 데스크톱처럼 활성 창을 못 보므로, 대신
  // "Zonemate를 벗어나 백그라운드로 감 = 딴짓"으로 본다(폰 집중=폰 내려놓기).
  // accStart부터 지금까지를 현재 상태(집중/딴짓) 버킷에 누적한다.
  const focusSessionIdRef = useRef(null);
  const accStartRef = useRef(0);
  const driftingRef = useRef(false);
  const driftMsRef = useRef(0);
  const driftCountRef = useRef(0);

  useEffect(() => {
    cancelledRef.current = false;
    async function poll() {
      try {
        const { session: latest } = await fetchFocusSession();
        if (cancelledRef.current) return;
        const state = latest || { status: 'idle' };
        setSession(state);
        // 이 폰이 소유자(source 'mobile')이고 아직 집중 중이면, 5초마다
        // 다시 밀어 넣어 updated_at을 갱신한다 — 안 그러면 서버가 45초 뒤
        // STALE로 보고 양쪽 다 idle 처리해 버린다(데스크톱 소유자가
        // syncFocusSession에서 매주기 assert하는 것과 대칭). startedAt은
        // 서버 값을 그대로 유지해 타이머가 리셋되지 않게 한다.
        if (state.status !== 'idle' && state.source === 'mobile') {
          pushFocusSession({
            status: state.status, taskTitle: state.taskTitle || null,
            targetMinutes: Number.isFinite(state.targetMinutes) ? state.targetMinutes : null,
            source: 'mobile', gauge: null,
            currentState: state.status === 'onBreak' ? 'break' : 'focus',
            startedAt: state.startedAt,
          }).catch(() => {});
        }
      } catch {
        // 폴링 실패는 조용히 다음 tick에 재시도 — 미러링은 부가 기능
      }
    }
    poll();
    const pollTimer = setInterval(poll, POLL_MS);
    // 오버레이 타이머를 매초 부드럽게 갱신(경과 시간 표시용).
    const tickTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelledRef.current = true;
      clearInterval(pollTimer);
      clearInterval(tickTimer);
    };
  }, []);

  // 앱을 벗어난 시간을 딴짓으로 집계한다. 내가 시작한(mobile) 집중 세션이
  // 진행 중일 때만 동작. 'background'(완전히 벗어남)만 딴짓으로 보고,
  // 'inactive'(알림센터/앱스위처 등 잠깐 가려짐)는 무시해 오검을 줄인다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const s = sessionRef.current;
      const id = focusSessionIdRef.current;
      if (!id || !s || s.status !== 'focusing' || s.source !== 'mobile') return;
      const now = Date.now();
      if (next === 'active') {
        // 포그라운드 복귀 → 딴짓 종료
        if (driftingRef.current) {
          driftMsRef.current += Math.max(0, now - accStartRef.current);
          accStartRef.current = now;
          driftingRef.current = false;
          logFocusEvent(id, 'drift_end', { destination: '다른 앱' });
        }
      } else if (next === 'background') {
        // 앱을 벗어남 → 딴짓 시작
        if (!driftingRef.current) {
          accStartRef.current = now;
          driftingRef.current = true;
          driftCountRef.current += 1;
          logFocusEvent(id, 'drift_start', { destination: '다른 앱' });
        }
      }
    });
    return () => sub.remove();
  }, []);

  const startFocus = useCallback(async ({ taskTitle, targetMinutes }) => {
    const title = (taskTitle || '').trim();
    if (!title) return;
    setBusy(true);
    try {
      const startedAt = new Date().toISOString();
      const minutes = Number.isFinite(targetMinutes) ? targetMinutes : (Number(targetMinutes) || null);
      // 딴짓 집계 초기화 + 세션 시작 이벤트(캘린더 기록용).
      const sessionId = genSessionId();
      focusSessionIdRef.current = sessionId;
      driftMsRef.current = 0;
      driftCountRef.current = 0;
      driftingRef.current = false;
      accStartRef.current = Date.now();
      await pushFocusSession({
        status: 'focusing', taskTitle: title, targetMinutes: minutes,
        source: 'mobile', gauge: null, currentState: 'focus', startedAt,
      });
      // 낙관적 반영 — 다음 폴링을 기다리지 않고 바로 오버레이가 뜨게.
      setSession({ status: 'focusing', taskTitle: title, targetMinutes: minutes, source: 'mobile', startedAt });
      // Forest식 앱 차단 — 미리 고른 앱들에 차단막을 씌운다(iOS 개발 빌드 전용,
      // 그 외 환경에선 no-op). 선택한 앱이 없으면 아무 일도 안 한다.
      startShield();
      logFocusEvent(sessionId, 'session_start', { taskTitle: title, source: 'mobile' });
    } finally {
      setBusy(false);
    }
  }, []);

  const stopFocus = useCallback(async () => {
    setBusy(true);
    try {
      const s = sessionRef.current;
      // 이 폰에서 시작한(mobile) 세션을 끝낼 때만 요약을 남긴다. 데스크톱
      // 세션을 미러링만 하던 경우엔 요약을 띄우지 않는다(그건 PC가 보여줌).
      if (s && s.status !== 'idle' && s.source === 'mobile' && s.startedAt) {
        const now = Date.now();
        const id = focusSessionIdRef.current;
        // 마지막 구간을 정산(딴짓 중에 종료했다면 그만큼 딴짓에 더한다).
        if (driftingRef.current) driftMsRef.current += Math.max(0, now - accStartRef.current);
        const totalMs = Math.max(0, now - new Date(s.startedAt).getTime());
        const driftMs = Math.min(totalMs, driftMsRef.current);
        const focusMs = Math.max(0, totalMs - driftMs); // 경과-딴짓 = 집중
        const driftCount = driftCountRef.current;
        setSummary({
          taskTitle: s.taskTitle || null,
          targetMinutes: Number.isFinite(s.targetMinutes) ? s.targetMinutes : null,
          totalMs,
          focusMs,
          driftMs,
          driftCount,
        });
        // 캘린더에도 남도록 세션 종료 이벤트를 기록(데스크톱 session_end와 같은 meta 형태).
        if (id) {
          logFocusEvent(id, 'session_end', {
            totalElapsedMs: totalMs,
            totalFocusMs: focusMs,
            totalDriftMs: driftMs,
            totalBreakMs: 0,
            driftCount,
            focusRate: totalMs > 0 ? Math.round((focusMs / totalMs) * 100) : 100,
            averageFocusMs: Math.round(focusMs / (driftCount + 1)),
            driftDestinations: driftMs > 0 ? [{ name: '다른 앱', ms: driftMs, count: driftCount }] : [],
          });
        }
      }
      focusSessionIdRef.current = null;
      driftingRef.current = false;
      await stopFocusSessionRemote();
      setSession({ status: 'idle' });
      stopShield(); // 차단막 해제
    } finally {
      setBusy(false);
    }
  }, []);

  const dismissSummary = useCallback(() => setSummary(null), []);

  const active = session.status === 'focusing' || session.status === 'onBreak';
  const isMine = session.source === 'mobile';

  return (
    <FocusSessionContext.Provider value={{ session, now, active, isMine, busy, startFocus, stopFocus, summary, dismissSummary }}>
      {children}
    </FocusSessionContext.Provider>
  );
}

export function useFocusSession() {
  return useContext(FocusSessionContext);
}
