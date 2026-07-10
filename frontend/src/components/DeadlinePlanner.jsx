import { useState } from 'react';
import { generateDeadlineRoadmap } from '../api.js';
import { formatDate } from '../utils/formatDate.js';

let idCounter = 1;
function makeId(prefix) {
  return `${prefix}-${idCounter++}-${Date.now()}`;
}

export default function DeadlinePlanner({ onAddEvent, onUpdateEvent, onRemoveEvent }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [roadmap, setRoadmap] = useState(null);
  const [needsMoreInfo, setNeedsMoreInfo] = useState(false);
  const [lastEventId, setLastEventId] = useState(null);
  // 방금 만든 로드맵이 속한 마감 이벤트 id — lastEventId와 별개로 둔다.
  // lastEventId는 성공 시 null로 리셋되지만(다음 제출은 새 이벤트), 로드맵
  // 체크박스는 리셋 이후에도 눌릴 수 있어서 parentId 연결용으로 따로 유지한다.
  const [roadmapParentId, setRoadmapParentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !deadline) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateDeadlineRoadmap({ title, details, deadline });
      const cleanRoadmap = [...result.roadmap].sort((a, b) => a.order - b.order);

      let eventId = lastEventId;
      if (eventId) {
        // 설명을 추가해서 다시 만드는 경우 — 새 이벤트를 또 추가하지 않고 기존 걸 갱신
        onUpdateEvent(eventId, { title: result.eventName, date: deadline, roadmap: cleanRoadmap });
      } else {
        eventId = makeId('deadline');
        onAddEvent({ id: eventId, title: result.eventName, date: deadline, kind: 'deadline', roadmap: cleanRoadmap });
        setLastEventId(eventId);
      }
      setRoadmapParentId(eventId);

      setRoadmap(
        cleanRoadmap.map((step) => ({ ...step, id: makeId('step'), included: false, calendarEventId: null }))
      );
      setNeedsMoreInfo(Boolean(result.needsMoreInfo));

      if (result.needsMoreInfo) {
        // 정보가 부족했던 경우엔 입력값을 지우지 않고 설명란을 펼쳐서 바로 보완할 수 있게 함
        setShowDetails(true);
      } else {
        setTitle('');
        setDetails('');
        setDeadline('');
        setShowDetails(false);
        setLastEventId(null);
      }
    } catch (err) {
      setError(err.message || '로드맵을 만드는 데 실패했어요');
    } finally {
      setLoading(false);
    }
  }

  function toggleStep(step) {
    // onAddEvent/onRemoveEvent는 부모 state를 바꾸는 부수효과라서, setRoadmap의
    // updater 함수 밖에서 정확히 한 번만 실행되게 분리한다. (React StrictMode는
    // updater 함수를 두 번 호출하므로, 안에 부수효과가 있으면 이벤트가 중복 등록됨)
    if (!step.included) {
      const eventId = `${step.id}-evt`;
      onAddEvent({ id: eventId, title: step.title, date: step.suggestedDate, kind: 'roadmap', parentId: roadmapParentId });
      setRoadmap((prev) =>
        prev.map((s) => (s.id === step.id ? { ...s, included: true, calendarEventId: eventId } : s))
      );
    } else {
      onRemoveEvent(step.calendarEventId);
      setRoadmap((prev) =>
        prev.map((s) => (s.id === step.id ? { ...s, included: false, calendarEventId: null } : s))
      );
    }
  }

  return (
    <section className="panel">
      <div className="section-head">
        <span className="section-num">02</span>
        <h2>마감 태스크 등록</h2>
      </div>

      <form className="task-input" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="deadline-title">언제까지 마감인 태스크가 있나요?</label>
        <input
          id="deadline-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 디자인 리뷰 공유"
        />

        {showDetails ? (
          <>
            <label className="field-label" htmlFor="deadline-details">이 태스크는 어떤 일인가요? (선택)</label>
            <textarea
              id="deadline-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="예: 새 온보딩 플로우 디자인 3안을 팀 리뷰 받고 하나로 확정하기"
              rows={2}
            />
          </>
        ) : (
          <button type="button" className="btn-link" onClick={() => setShowDetails(true)}>
            + 자세히 적기 (선택)
          </button>
        )}

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
          disabled={loading || !title.trim() || !deadline}
        >
          {loading ? '로드맵 만드는 중...' : '캘린더에 등록하고 로드맵 만들기'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {loading && (
        <div className="roadmap-list">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      )}

      {!loading && needsMoreInfo && (
        <p className="hint-text">
          태스크 이름만으로는 정보가 부족해서 로드맵이 일반적으로 나왔어요. 위에 설명을 추가하고 다시 만들면 더 정확해져요.
        </p>
      )}

      {!loading && roadmap && (
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
