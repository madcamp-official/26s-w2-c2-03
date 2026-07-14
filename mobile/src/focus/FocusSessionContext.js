import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchFocusSession, pushFocusSession, stopFocusSessionRemote } from '../api';

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
  const cancelledRef = useRef(false);

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

  const startFocus = useCallback(async ({ taskTitle, targetMinutes }) => {
    const title = (taskTitle || '').trim();
    if (!title) return;
    setBusy(true);
    try {
      const startedAt = new Date().toISOString();
      const minutes = Number.isFinite(targetMinutes) ? targetMinutes : (Number(targetMinutes) || null);
      await pushFocusSession({
        status: 'focusing', taskTitle: title, targetMinutes: minutes,
        source: 'mobile', gauge: null, currentState: 'focus', startedAt,
      });
      // 낙관적 반영 — 다음 폴링을 기다리지 않고 바로 오버레이가 뜨게.
      setSession({ status: 'focusing', taskTitle: title, targetMinutes: minutes, source: 'mobile', startedAt });
    } finally {
      setBusy(false);
    }
  }, []);

  const stopFocus = useCallback(async () => {
    setBusy(true);
    try {
      await stopFocusSessionRemote();
      setSession({ status: 'idle' });
    } finally {
      setBusy(false);
    }
  }, []);

  const active = session.status === 'focusing' || session.status === 'onBreak';
  const isMine = session.source === 'mobile';

  return (
    <FocusSessionContext.Provider value={{ session, now, active, isMine, busy, startFocus, stopFocus }}>
      {children}
    </FocusSessionContext.Provider>
  );
}

export function useFocusSession() {
  return useContext(FocusSessionContext);
}
