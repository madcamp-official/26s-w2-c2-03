import { useOutletContext } from 'react-router-dom';
import DeadlinePlanner from '../components/DeadlinePlanner.jsx';
import CalendarGrid from '../components/CalendarGrid.jsx';

export default function DeadlinesPage() {
  const { events, addEvent, updateEvent, removeEvent } = useOutletContext();
  return (
    <>
      <DeadlinePlanner onAddEvent={addEvent} onUpdateEvent={updateEvent} onRemoveEvent={removeEvent} />
      <CalendarGrid events={events} onUpdate={updateEvent} onRemove={removeEvent} />
    </>
  );
}
