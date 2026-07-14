import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchPlannerData, savePlannerData } from '../api';
import { syncPlannedBreakNotifications } from '../notifications/plannedBreakNotifications';

const PlannerDataContext = createContext(null);

let eventCounter = 1;
function makeEventId() {
  return `evt-${eventCounter++}-${Date.now()}`;
}

// 데스크톱(frontend/src/pages/PlannerPage.jsx)과 같은 패턴 — tasks/events/
// dayEndTime을 한 스냅샷으로 들고, 바뀔 때마다 350ms 뒤 debounce로 서버에
// 저장한다. Today·Calendar 두 화면이 이 컨텍스트 하나를 공유해서, 마감
// 태스크에서 만든 로드맵 일정이 오늘의 계획에도 바로 반영될 수 있게 한다.
export function PlannerDataProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [dayEndTime, setDayEndTime] = useState(null);
  const [dayEndDate, setDayEndDate] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const saveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    fetchPlannerData()
      .then((data) => {
        if (cancelled) return;
        setTasks(data.tasks || []);
        setEvents(data.events || []);
        setDayEndTime(data.dayEndTime || null);
        setDayEndDate(data.dayEndDate || null);
        setDataReady(true);
      })
      .catch((err) => {
        if (!cancelled) setSaveError(err.message);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!dataReady) return undefined;
    const timer = setTimeout(() => {
      const snapshot = { tasks, events, dayEndTime, dayEndDate };
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => savePlannerData(snapshot))
        .then(() => setSaveError(null))
        .catch((err) => setSaveError(err.message));
    }, 350);
    return () => clearTimeout(timer);
  }, [tasks, events, dayEndTime, dayEndDate, dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    syncPlannedBreakNotifications(tasks, dayEndDate)
      .catch((err) => console.warn('[notifications] 휴식 알림 예약 실패:', err?.message || err));
  }, [tasks, dayEndDate, dataReady]);

  const addEvent = useCallback((event) => {
    setEvents((prev) => [...prev, { ...event, id: event.id || makeEventId() }]);
  }, []);
  const updateEvent = useCallback((id, patch) => {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)));
  }, []);
  const removeEvent = useCallback((id) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id && ev.parentId !== id));
  }, []);
  const setDayEnd = useCallback((time) => {
    setDayEndTime(time);
    if (!time) { setDayEndDate(null); return; }
    // 데스크톱과 달리 자정 넘김 보정 없이 오늘 날짜로 단순 저장 — 모바일은
    // 하루 마감 자동 정리 기능을 아직 안 쓰므로(2단계 범위 밖) 단순하게 둔다.
    const now = new Date();
    setDayEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  }, []);

  return (
    <PlannerDataContext.Provider value={{
      tasks, setTasks, events, addEvent, updateEvent, removeEvent,
      dayEndTime, setDayEnd, dataReady, saveError,
    }}
    >
      {children}
    </PlannerDataContext.Provider>
  );
}

export function usePlannerData() {
  return useContext(PlannerDataContext);
}
