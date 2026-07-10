import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchPlannerData, savePlannerData } from '../api.js';

let eventCounter = 1;
function makeEventId() {
  return `evt-${eventCounter++}-${Date.now()}`;
}

function navLinkClassName({ isActive }) {
  return `page-nav-link${isActive ? ' is-active' : ''}`;
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const saveQueueRef = useRef(Promise.resolve());
  const { user, logout } = useAuth();

  useEffect(() => {
    let cancelled = false;

    fetchPlannerData()
      .then((data) => {
        if (cancelled) return;
        setTasks(data.tasks || []);
        setEvents(data.events || []);
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
      const snapshot = { tasks, events };
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => savePlannerData(snapshot))
        .then(() => setStorageError(null))
        .catch((err) => setStorageError(err.message || '변경사항을 저장하지 못했어요'));
    }, 350);

    return () => clearTimeout(timer);
  }, [tasks, events, dataReady]);

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

  return (
    <div className="page">
      <div className="wrap">
        <header className="topbar">
          <div className="wordmark"><b>FOCUS</b>·LOG</div>
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

        {dataReady ? (
          <Outlet context={{ tasks, setTasks, events, addEvent, updateEvent, removeEvent }} />
        ) : !storageError ? (
          <section className="panel"><p className="hint-text">저장된 플래너를 불러오는 중...</p></section>
        ) : null}
      </div>
    </div>
  );
}
