import { useState } from 'react';
import DailyPlanner from '../components/DailyPlanner.jsx';
import DeadlinePlanner from '../components/DeadlinePlanner.jsx';
import CalendarGrid from '../components/CalendarGrid.jsx';
import { useAuth } from '../context/AuthContext.jsx';

let eventCounter = 1;
function makeEventId() {
  return `evt-${eventCounter++}-${Date.now()}`;
}

export default function PlannerPage() {
  const [events, setEvents] = useState([]);
  const { user, logout } = useAuth();

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

        <DailyPlanner />
        <DeadlinePlanner onAddEvent={addEvent} onUpdateEvent={updateEvent} onRemoveEvent={removeEvent} />
        <CalendarGrid events={events} onUpdate={updateEvent} onRemove={removeEvent} />
      </div>
    </div>
  );
}
