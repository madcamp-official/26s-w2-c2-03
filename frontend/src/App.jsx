import { useState } from 'react';
import TaskInput from './components/TaskInput.jsx';
import QuestList from './components/QuestList.jsx';
import { decomposeQuests } from './api.js';

export default function App() {
  const [quests, setQuests] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit({ tasks, deadlineTasks }) {
    setLoading(true);
    setError(null);
    try {
      const result = await decomposeQuests({ tasks, deadlineTasks });
      setQuests(result.quests);
    } catch (err) {
      setError(err.message || '퀘스트 분해에 실패했어요');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="wrap">
        <header className="topbar">
          <div className="wordmark"><b>FOCUS</b>·LOG</div>
        </header>

        <TaskInput onSubmit={handleSubmit} loading={loading} />

        {error && <p className="error-text">{error}</p>}

        {quests && <QuestList quests={quests} />}
      </div>
    </div>
  );
}
