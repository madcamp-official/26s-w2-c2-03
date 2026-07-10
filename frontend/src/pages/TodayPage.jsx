import { useOutletContext } from 'react-router-dom';
import DailyPlanner from '../components/DailyPlanner.jsx';

export default function TodayPage() {
  const { tasks, setTasks } = useOutletContext();
  return <DailyPlanner items={tasks} onItemsChange={setTasks} />;
}
