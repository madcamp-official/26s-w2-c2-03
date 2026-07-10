import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchPlannerData, savePlannerData, closeDay } from '../api.js';
import { toDateKey } from '../utils/calendarGrid.js';

let eventCounter = 1;
function makeEventId() {
  return `evt-${eventCounter++}-${Date.now()}`;
}

function navLinkClassName({ isActive }) {
  return `page-nav-link${isActive ? ' is-active' : ''}`;
}

// 하루 마무리 시간이 지나자마자 바로 지워버리면 사용자가 당황할 수 있어서,
// 이 시간만큼 여유를 두고서야 실제로 초기화한다.
const CLOSE_GRACE_MINUTES = 30;

function shouldCloseDay(dayEndDate, dayEndTime) {
  if (!dayEndDate || !dayEndTime) return false;
  const todayKey = toDateKey(new Date());
  if (dayEndDate < todayKey) return true; // 하루 이상 지난 채로 남아있던 경우 — 바로 정리
  if (dayEndDate > todayKey) return false;

  const [h, m] = dayEndTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const deadline = new Date();
  deadline.setHours(h, m, 0, 0);
  deadline.setMinutes(deadline.getMinutes() + CLOSE_GRACE_MINUTES);
  return new Date() >= deadline;
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [dayEndTime, setDayEndTime] = useState(null);
  const [dayEndDate, setDayEndDate] = useState(null);
  const [dataReady, setDataReady] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [closeNotice, setCloseNotice] = useState(null);
  const saveQueueRef = useRef(Promise.resolve());
  // StrictMode가 마운트 시 effect를 두 번 실행해도, closingRef를 동기적으로
  // 먼저 세워두면 두 번째 호출이 곧바로 걸러진다 (기록이 빈 목록으로
  // 덮어써지는 걸 방지).
  const closingRef = useRef(false);
  const { user, logout } = useAuth();

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
        if (!cancelled) setStorageError(err.message || '저장된 플래너를 불러오지 못했어요');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!dataReady) return undefined;

    const timer = setTimeout(() => {
      const snapshot = { tasks, events, dayEndTime, dayEndDate };
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => savePlannerData(snapshot))
        .then(() => setStorageError(null))
        .catch((err) => setStorageError(err.message || '변경사항을 저장하지 못했어요'));
    }, 350);

    return () => clearTimeout(timer);
  }, [tasks, events, dayEndTime, dayEndDate, dataReady]);

  // 하루 마무리 시간 + 유예시간이 지났는지 주기적으로 확인해서, 지났으면
  // 오늘의 계획을 캘린더 기록으로 넘기고 새 하루를 시작할 수 있게 비운다.
  useEffect(() => {
    if (!dataReady) return undefined;

    function checkAndClose() {
      if (closingRef.current) return;
      if (!shouldCloseDay(dayEndDate, dayEndTime)) return;

      closingRef.current = true;
      const dateToClose = dayEndDate;
      closeDay(dateToClose, tasks)
        .then(() => {
          setTasks([]);
          setDayEndTime(null);
          setDayEndDate(null);
          setCloseNotice(dateToClose);
        })
        .catch((err) => setStorageError(err.message || '하루 마감 처리에 실패했어요'))
        .finally(() => {
          closingRef.current = false;
        });
    }

    checkAndClose();
    const interval = setInterval(checkAndClose, 60000);
    return () => clearInterval(interval);
    // tasks도 의존성에 넣어서, 유예시간이 지나 실제로 닫힐 때 그 순간의
    // 최신 체크리스트(완료 여부 포함)가 아카이빙되도록 한다.
  }, [dataReady, dayEndDate, dayEndTime, tasks]);

  function addEvent(event) {
    setEvents((prev) => [...prev, { ...event, id: event.id || makeEventId() }]);
  }

  function updateEvent(id, patch) {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)));
  }

  function removeEvent(id) {
    // 마감(부모) 이벤트를 지우면, 거기서 파생된 로드맵 단계 이벤트(parentId로 연결)도 같이 지운다
    setEvents((prev) => prev.filter((ev) => ev.id !== id && ev.parentId !== id));
  }

  function setDayEnd(time) {
    setDayEndTime(time);
    setDayEndDate(time ? toDateKey(new Date()) : null);
  }

  return (
    <div className="page">
      <div className="wrap">
        <header className="topbar">
          <div className="wordmark"><b>Zone</b>mate</div>
          <div className="topbar-user">
            <span className="mono">{user?.nickname}님</span>
            <button type="button" className="btn-ghost" onClick={logout}>로그아웃</button>
          </div>
        </header>

        <nav className="page-nav">
          <NavLink to="/today" className={navLinkClassName}>오늘의 계획</NavLink>
          <NavLink to="/deadlines" className={navLinkClassName}>마감 태스크 & 캘린더</NavLink>
        </nav>

        {storageError && <p className="error-text">{storageError}</p>}

        {closeNotice && (
          <p className="hint-text">
            {closeNotice}의 하루 계획을 캘린더 기록으로 저장하고 새로 시작할 수 있게 비웠어요. 캘린더에서 그날을 눌러 확인할 수 있어요.{' '}
            <button type="button" className="btn-link" onClick={() => setCloseNotice(null)}>닫기</button>
          </p>
        )}

        {dataReady ? (
          <Outlet context={{ tasks, setTasks, events, addEvent, updateEvent, removeEvent, dayEndTime, setDayEnd }} />
        ) : !storageError ? (
          <section className="panel"><p className="hint-text">저장된 플래너를 불러오는 중...</p></section>
        ) : null}
      </div>
    </div>
  );
}
