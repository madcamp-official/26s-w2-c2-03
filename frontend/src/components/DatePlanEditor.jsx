import { useEffect, useRef, useState } from 'react';
import { fetchDailyArchive, saveDailyArchive } from '../api.js';
import { toLocalInputValue } from '../utils/calendarGrid.js';
import DayWheel from './DayWheel.jsx';

let idCounter = 1;
function makeTaskId() {
  return `date-task-${idCounter++}-${Date.now()}`;
}

function withOrder(items) {
  return items.map((it, i) => ({ ...it, order: i + 1 }));
}

// 캘린더에서 특정 날짜를 눌렀을 때 그 날의 할 일과 일정을 실제로 편집하는
// 패널. 오늘 날짜면 라이브 목록(planner_tasks)을 직접 편집하고, 그 외
// 날짜면 daily_archives에 저장된 그 날의 계획을 불러와 편집·자동 저장한다.
export default function DatePlanEditor({
  date,
  isToday,
  liveTasks,
  onLiveChange,
  events,
  onUpdateEvent,
  onRemoveEvent,
  onClose,
}) {
  const [archiveTasks, setArchiveTasks] = useState(null); // null=로딩중(오늘이 아닐 때만)
  const [dayEndTime, setDayEndTime] = useState(null);
  const [loading, setLoading] = useState(!isToday);
  const [error, setError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const saveTimerRef = useRef(null);
  const dayEndRef = useRef(null);

  // 오늘이 아닌 날짜는 저장된 계획을 불러온다.
  useEffect(() => {
    if (isToday) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchDailyArchive(date)
      .then((data) => {
        if (cancelled) return;
        setArchiveTasks(withOrder(data.tasks || []));
        setDayEndTime(data.dayEndTime || null);
        dayEndRef.current = data.dayEndTime || null;
      })
      .catch((err) => !cancelled && setError(err.message || '불러오지 못했어요'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, isToday]);

  const items = isToday ? (liveTasks || []) : (archiveTasks || []);

  // 오늘이 아닌 날짜는 변경 후 잠깐 뒤 자동 저장한다.
  function scheduleArchiveSave(nextItems) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDailyArchive(date, nextItems, dayEndRef.current)
        .then(() => {
          setError(null);
          setSavedFlash(true);
          setTimeout(() => setSavedFlash(false), 1200);
        })
        .catch((err) => setError(err.message || '저장하지 못했어요'));
    }, 500);
  }

  function updateItems(updater) {
    if (isToday) {
      onLiveChange((prev) => withOrder(updater(prev || [])));
      return;
    }
    setArchiveTasks((prev) => {
      const next = withOrder(updater(prev || []));
      scheduleArchiveSave(next);
      return next;
    });
  }

  function updateTask(id, patch) {
    updateItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeTask(id) {
    updateItems((prev) => prev.filter((it) => it.id !== id));
  }
  function addTask(type) {
    updateItems((prev) => [
      ...prev,
      {
        id: makeTaskId(),
        type,
        title: type === 'break' ? '잠깐 휴식' : '새 작업',
        targetMinutes: type === 'break' ? 5 : 15,
        done: false,
      },
    ]);
  }

  const dayEvents = (events || []).filter((ev) => {
    const d = new Date(ev.date);
    if (Number.isNaN(d.getTime())) return false;
    // 로컬 기준 날짜 키 비교
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return key === date;
  });

  return (
    <div className="date-editor">
      <div className="date-editor-head">
        <p className="field-label">
          {date} 계획 {isToday && <span className="mono date-editor-today">· 오늘(라이브)</span>}
          {savedFlash && <span className="mono date-editor-saved"> · 저장됨</span>}
        </p>
        <button type="button" className="btn-ghost" onClick={onClose}>닫기</button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="hint-text">불러오는 중...</p>}

      {!loading && (
        <>
          <div className="date-editor-section-label mono">할 일</div>
          {items.length === 0 && <p className="hint-text">아직 등록된 할 일이 없어요. 아래에서 추가하세요.</p>}
          <div className="date-task-list">
            {items.map((t) => (
              <div key={t.id} className={`date-task-row${t.done ? ' is-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={Boolean(t.done)}
                  onChange={(e) => updateTask(t.id, { done: e.target.checked })}
                  title="완료"
                />
                <input
                  type="text"
                  className="date-task-title"
                  value={t.title}
                  onChange={(e) => updateTask(t.id, { title: e.target.value })}
                />
                <input
                  type="time"
                  className="date-task-time mono"
                  value={t.startTime || ''}
                  onChange={(e) => updateTask(t.id, { startTime: e.target.value || undefined })}
                  title="시작 시간"
                />
                <input
                  type="number"
                  min="1"
                  className="date-task-min mono"
                  value={t.targetMinutes}
                  onChange={(e) => updateTask(t.id, { targetMinutes: Math.max(1, Number(e.target.value) || 1) })}
                  title="소요(분)"
                />
                <span className="date-task-unit">분</span>
                <button type="button" className="date-task-remove" onClick={() => removeTask(t.id)} aria-label="삭제">×</button>
              </div>
            ))}
          </div>
          <div className="date-editor-add">
            <button type="button" className="btn-ghost" onClick={() => addTask('task')}>+ 작업</button>
            <button type="button" className="btn-ghost" onClick={() => addTask('break')}>+ 휴식</button>
            {items.some((t) => t.startTime) && (
              <button type="button" className="btn-ghost" onClick={() => setShowWheel((v) => !v)}>
                {showWheel ? '시간표 접기' : '시간표 보기'}
              </button>
            )}
          </div>

          {showWheel && <DayWheel items={items} dayEndTime={dayEndTime} />}

          {dayEvents.length > 0 && (
            <>
              <div className="date-editor-section-label mono">이 날의 일정</div>
              <div className="date-event-list">
                {dayEvents.map((ev) => (
                  <div key={ev.id} className="date-event-row">
                    <span className={`type-tag ${ev.kind === 'deadline' ? 'tag-urgent' : 'tag-signal'}`}>
                      {ev.kind === 'deadline' ? '마감' : '로드맵'}
                    </span>
                    <input
                      type="text"
                      className="date-event-title"
                      value={ev.title}
                      onChange={(e) => onUpdateEvent(ev.id, { title: e.target.value })}
                    />
                    <input
                      type="datetime-local"
                      className="date-event-time mono"
                      value={toLocalInputValue(new Date(ev.date))}
                      onChange={(e) => onUpdateEvent(ev.id, { date: e.target.value })}
                    />
                    <button type="button" className="date-task-remove" onClick={() => onRemoveEvent(ev.id)} aria-label="삭제">×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
