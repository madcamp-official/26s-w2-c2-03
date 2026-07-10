import { formatDate } from '../utils/formatDate.js';

export default function CalendarList({ events, onUpdate, onRemove }) {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <section className="panel">
      <div className="section-head">
        <span className="section-num">03</span>
        <h2>캘린더</h2>
      </div>
      <div className="calendar-list">
        {sorted.map((ev) => (
          <div key={ev.id} className="calendar-row">
            <span className={`type-tag ${ev.kind === 'deadline' ? 'tag-urgent' : 'tag-signal'}`}>
              {ev.kind === 'deadline' ? '마감' : '로드맵'}
            </span>
            <input
              type="text"
              className="calendar-title-input"
              value={ev.title}
              onChange={(e) => onUpdate(ev.id, { title: e.target.value })}
            />
            <span className="mono calendar-date">{formatDate(ev.date)}</span>
            <button type="button" className="row-remove" onClick={() => onRemove(ev.id)} aria-label="이벤트 삭제">×</button>
          </div>
        ))}
      </div>
    </section>
  );
}
