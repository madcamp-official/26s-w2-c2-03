import { useState } from 'react';
import DailyPlanner from './components/DailyPlanner.jsx';
import DeadlinePlanner from './components/DeadlinePlanner.jsx';
import CalendarGrid from './components/CalendarGrid.jsx';

let eventCounter = 1;
function makeEventId() {
  return `evt-${eventCounter++}-${Date.now()}`;
}

export default function App() {
  const [events, setEvents] = useState([]);

  function addEvent(event) {
    setEvents((prev) => [...prev, { ...event, id: event.id || makeEventId() }]);
  }

  function updateEvent(id, patch) {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)));
  }

  function removeEvent(id) {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  }

  return (
    <div className="page">
      <div className="wrap">
        <header className="topbar">
          <div className="wordmark"><b>FOCUS</b>·LOG</div>
        </header>

        <DailyPlanner />
        <DeadlinePlanner onAddEvent={addEvent} onRemoveEvent={removeEvent} />
        <CalendarGrid events={events} onUpdate={updateEvent} onRemove={removeEvent} />
      </div>
    </div>
  );
}
