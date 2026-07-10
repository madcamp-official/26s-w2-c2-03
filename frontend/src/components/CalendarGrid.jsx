import { useMemo, useState } from 'react';
import {
  WEEKDAYS,
  addMonths,
  buildMonthGrid,
  isSameDay,
  moveDateKeepTime,
  startOfMonth,
  toDateKey,
  toLocalInputValue,
} from '../utils/calendarGrid.js';
import { formatDate } from '../utils/formatDate.js';

const MAX_VISIBLE_CHIPS = 3;

export default function CalendarGrid({ events, onUpdate, onRemove }) {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedId, setSelectedId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [expandedDayKey, setExpandedDayKey] = useState(null);

  const grid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const d = new Date(ev.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = toDateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return map;
  }, [events]);

  const selectedEvent = events.find((ev) => ev.id === selectedId) || null;

  function handleDrop(e, day) {
    e.preventDefault();
    setDragOverKey(null);
    const eventId = e.dataTransfer.getData('text/plain');
    if (!eventId) return;
    const target = events.find((ev) => ev.id === eventId);
    if (!target) return;
    onUpdate(eventId, { date: moveDateKeepTime(target.date, day) });
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>캘린더</h2>
      </div>

      <div className="calendar-nav">
        <button type="button" className="btn-ghost" onClick={() => setMonthDate((d) => addMonths(d, -1))} aria-label="이전 달">‹</button>
        <span className="calendar-month-label mono">
          {monthDate.getFullYear()}. {String(monthDate.getMonth() + 1).padStart(2, '0')}
        </span>
        <button type="button" className="btn-ghost" onClick={() => setMonthDate((d) => addMonths(d, 1))} aria-label="다음 달">›</button>
        <button type="button" className="btn-ghost" onClick={() => setMonthDate(startOfMonth(new Date()))}>오늘</button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">{w}</div>
        ))}
        {grid.map((day) => {
          const key = toDateKey(day);
          const dayEvents = eventsByDay.get(key) || [];
          const inMonth = day.getMonth() === monthDate.getMonth();
          const today = isSameDay(day, new Date());
          const dragOver = dragOverKey === key;
          const expanded = expandedDayKey === key;
          const visibleEvents = expanded ? dayEvents : dayEvents.slice(0, MAX_VISIBLE_CHIPS);
          const hiddenCount = dayEvents.length - visibleEvents.length;

          return (
            <div
              key={key}
              className={[
                'calendar-cell',
                !inMonth && 'is-outside',
                dragOver && 'is-drag-over',
              ].filter(Boolean).join(' ')}
              onDragOver={(e) => { e.preventDefault(); setDragOverKey(key); }}
              onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
              onDrop={(e) => handleDrop(e, day)}
            >
              <span className={`calendar-cell-date mono${today ? ' is-today' : ''}`}>{day.getDate()}</span>
              <div className="calendar-cell-events">
                {visibleEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={`calendar-chip ${ev.kind === 'deadline' ? 'tag-urgent' : 'tag-signal'}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', ev.id)}
                    onClick={() => setSelectedId(ev.id)}
                    title={ev.title}
                  >
                    {ev.title}
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="calendar-chip-more"
                    onClick={() => setExpandedDayKey(key)}
                  >
                    +{hiddenCount}개
                  </button>
                )}
                {expanded && dayEvents.length > MAX_VISIBLE_CHIPS && (
                  <button
                    type="button"
                    className="calendar-chip-more"
                    onClick={() => setExpandedDayKey(null)}
                  >
                    접기
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedEvent && (
        <div className="calendar-editor">
          <div className="calendar-editor-row">
            <span className={`type-tag ${selectedEvent.kind === 'deadline' ? 'tag-urgent' : 'tag-signal'}`}>
              {selectedEvent.kind === 'deadline' ? '마감' : '로드맵'}
            </span>
            <input
              type="text"
              value={selectedEvent.title}
              onChange={(e) => onUpdate(selectedEvent.id, { title: e.target.value })}
            />
          </div>
          <div className="calendar-editor-row">
            <input
              type="datetime-local"
              value={toLocalInputValue(new Date(selectedEvent.date))}
              onChange={(e) => onUpdate(selectedEvent.id, { date: e.target.value })}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { onRemove(selectedEvent.id); setSelectedId(null); }}
            >
              삭제
            </button>
            <button type="button" className="btn-ghost" onClick={() => setSelectedId(null)}>닫기</button>
          </div>

          {selectedEvent.kind === 'deadline' && selectedEvent.roadmap && selectedEvent.roadmap.length > 0 && (
            <div className="calendar-editor-roadmap">
              <p className="field-label">이 마감의 로드맵</p>
              {[...selectedEvent.roadmap]
                .sort((a, b) => a.order - b.order)
                .map((step, i) => (
                  <div key={i} className="calendar-editor-roadmap-row">
                    <span className="roadmap-title">{step.title}</span>
                    <span className="mono roadmap-date">{formatDate(step.suggestedDate)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
