import { useOutletContext } from 'react-router-dom';
import DeadlinePlanner from '../components/DeadlinePlanner.jsx';
import CalendarGrid from '../components/CalendarGrid.jsx';

export default function DeadlinesPage() {
  const { events, addEvent, updateEvent, removeEvent, tasks, setTasks } = useOutletContext();
  return (
    <div className="deadlines-layout">
      <div className="deadlines-side">
        <DeadlinePlanner onAddEvent={addEvent} onUpdateEvent={updateEvent} onRemoveEvent={removeEvent} />
      </div>
      <div className="deadlines-main">
        <CalendarGrid
          events={events}
          onUpdate={updateEvent}
          onRemove={removeEvent}
          tasks={tasks}
          setTasks={setTasks}
        />
      </div>
    </div>
  );
}
