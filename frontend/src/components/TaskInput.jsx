import { useState } from 'react';

export default function TaskInput({ onSubmit, loading }) {
  const [tasks, setTasks] = useState('');
  const [deadlineTasks, setDeadlineTasks] = useState([]);
  const [deadlineDraft, setDeadlineDraft] = useState({ description: '', deadline: '' });

  function addDeadlineTask() {
    if (!deadlineDraft.description.trim() || !deadlineDraft.deadline) return;
    setDeadlineTasks((prev) => [...prev, deadlineDraft]);
    setDeadlineDraft({ description: '', deadline: '' });
  }

  function removeDeadlineTask(index) {
    setDeadlineTasks((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!tasks.trim()) return;
    onSubmit({ tasks, deadlineTasks });
  }

  return (
    <form className="task-input" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="tasks">오늘 할 일을 알려주세요</label>
      <textarea
        id="tasks"
        value={tasks}
        onChange={(e) => setTasks(e.target.value)}
        placeholder="예: 로그인 리팩토링, PR 리뷰, 문서 정리"
        rows={4}
      />

      <label className="field-label">언제까지 마감인 태스크가 있나요?</label>
      <div className="deadline-row">
        <input
          type="text"
          placeholder="태스크 설명"
          value={deadlineDraft.description}
          onChange={(e) => setDeadlineDraft((d) => ({ ...d, description: e.target.value }))}
        />
        <input
          type="time"
          value={deadlineDraft.deadline}
          onChange={(e) => setDeadlineDraft((d) => ({ ...d, deadline: e.target.value }))}
        />
        <button type="button" className="btn-ghost" onClick={addDeadlineTask}>추가</button>
      </div>

      {deadlineTasks.length > 0 && (
        <ul className="deadline-list">
          {deadlineTasks.map((t, i) => (
            <li key={i}>
              <span>{t.description}</span>
              <span className="mono">D · {t.deadline}</span>
              <button type="button" onClick={() => removeDeadlineTask(i)} aria-label="삭제">×</button>
            </li>
          ))}
        </ul>
      )}

      <button type="submit" className="btn-primary" disabled={loading || !tasks.trim()}>
        {loading ? '퀘스트 만드는 중...' : '퀘스트로 쪼개기'}
      </button>
    </form>
  );
}
