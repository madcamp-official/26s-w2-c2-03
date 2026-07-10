import { useState } from 'react';
import { generateDeadlineRoadmap } from '../api.js';
import { formatDate } from '../utils/formatDate.js';

let stepCounter = 1;
function makeStepId() {
  return `step-${stepCounter++}-${Date.now()}`;
}

export default function DeadlinePlanner({ onAddEvent, onRemoveEvent }) {
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [roadmap, setRoadmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim() || !deadline) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateDeadlineRoadmap({ description, deadline });
      onAddEvent({ title: result.eventName, date: deadline, kind: 'deadline' });
      setRoadmap(
        [...result.roadmap]
          .sort((a, b) => a.order - b.order)
          .map((step) => ({ ...step, id: makeStepId(), included: false, calendarEventId: null }))
      );
      setDescription('');
      setDeadline('');
    } catch (err) {
      setError(err.message || '로드맵을 만드는 데 실패했어요');
    } finally {
      setLoading(false);
    }
  }

  function toggleStep(step) {
    setRoadmap((prev) =>
      prev.map((s) => {
        if (s.id !== step.id) return s;
        if (!s.included) {
          const eventId = `${s.id}-evt`;
          onAddEvent({ id: eventId, title: s.title, date: s.suggestedDate, kind: 'roadmap' });
          return { ...s, included: true, calendarEventId: eventId };
        }
        onRemoveEvent(s.calendarEventId);
        return { ...s, included: false, calendarEventId: null };
      })
    );
  }

  return (
    <section className="panel">
      <div className="section-head">
        <span className="section-num">02</span>
        <h2>마감 태스크 등록</h2>
      </div>

      <form className="task-input" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="deadline-desc">언제까지 마감인 태스크가 있나요?</label>
        <input
          id="deadline-desc"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="예: 디자인 리뷰 공유"
        />

        <label className="field-label" htmlFor="deadline-datetime">마감 날짜와 시간</label>
        <input
          id="deadline-datetime"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !description.trim() || !deadline}
        >
          {loading ? '로드맵 만드는 중...' : '캘린더에 등록하고 로드맵 만들기'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {roadmap && (
        <div className="roadmap-list">
          <p className="field-label">로드맵 — 캘린더에 등록할 단계를 선택하세요</p>
          {roadmap.map((step) => (
            <label key={step.id} className="roadmap-row">
              <input type="checkbox" checked={step.included} onChange={() => toggleStep(step)} />
              <span className="roadmap-title">{step.title}</span>
              <span className="mono roadmap-date">{formatDate(step.suggestedDate)}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
