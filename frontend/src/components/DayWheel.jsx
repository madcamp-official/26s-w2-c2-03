// 등록된 일정 중심의 가로 타임라인(간트형) 시간표.
// 기존 24시간 원형 파이는 실제 등록된 일정이 아주 작은 조각으로만 보여
// 가시성이 떨어졌다. 대신 "가장 이른 시작 ~ 가장 늦은 끝" 구간만 확대해
// 각 일정을 큰 막대로 보여줘 등록된 일정에 비중을 둔다.

function parseTimeToMinutes(time) {
  if (!time || typeof time !== 'string') return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(total) {
  const h = Math.floor(total / 60) % 24;
  const m = Math.round(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function DayWheel({ items, dayEndTime }) {
  const scheduled = items
    .filter((it) => parseTimeToMinutes(it.startTime) !== null)
    .map((it) => {
      const start = parseTimeToMinutes(it.startTime);
      const duration = Math.max(Number(it.targetMinutes) || 0, 1);
      const end = Math.min(start + duration, 24 * 60);
      return { ...it, start, end };
    })
    .filter((it) => it.end > it.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (scheduled.length === 0) {
    return (
      <p className="hint-text">
        시간표를 그리려면 각 항목의 시작 시간이 필요해요. 시작 시간을 지정하면 여기에 타임라인으로 그려져요.
      </p>
    );
  }

  const dayEndMin = parseTimeToMinutes(dayEndTime);

  // 등록된 일정 구간만 확대(+마감 시각 포함). 앞뒤로 30분 여유를 둔다.
  const minStart = Math.min(...scheduled.map((s) => s.start));
  const maxEnd = Math.max(...scheduled.map((s) => s.end), dayEndMin ?? -Infinity);
  let windowStart = Math.max(0, Math.floor((minStart - 30) / 60) * 60);
  let windowEnd = Math.min(24 * 60, Math.ceil((maxEnd + 30) / 60) * 60);
  if (windowEnd - windowStart < 60) windowEnd = Math.min(24 * 60, windowStart + 60);
  const span = windowEnd - windowStart;

  const pct = (min) => `${((min - windowStart) / span) * 100}%`;

  // 시간 눈금(정시). 구간이 길면 라벨 간격을 벌려 안 겹치게 한다.
  const totalHours = span / 60;
  const hourStep = totalHours > 10 ? 2 : 1;
  const ticks = [];
  for (let h = Math.ceil(windowStart / 60); h * 60 <= windowEnd; h += 1) {
    if ((h - Math.ceil(windowStart / 60)) % hourStep !== 0) continue;
    ticks.push(h * 60);
  }

  return (
    <div className="timetable">
      <div className="timetable-axis">
        {ticks.map((t) => (
          <span key={t} className="timetable-tick" style={{ left: pct(t) }}>
            <span className="timetable-tick-label mono">{minutesToTime(t)}</span>
          </span>
        ))}
        {dayEndMin != null && dayEndMin >= windowStart && dayEndMin <= windowEnd && (
          <span className="timetable-endline" style={{ left: pct(dayEndMin) }} title={`마무리 ${minutesToTime(dayEndMin)}`}>
            <span className="timetable-endline-label mono">마무리</span>
          </span>
        )}
      </div>

      <div className="timetable-rows">
        {scheduled.map((it) => {
          const left = pct(it.start);
          const width = `${((it.end - it.start) / span) * 100}%`;
          return (
            <div key={it.id} className="timetable-row">
              {dayEndMin != null && dayEndMin >= windowStart && dayEndMin <= windowEnd && (
                <span className="timetable-row-endline" style={{ left: pct(dayEndMin) }} />
              )}
              <div
                className={`timetable-bar${it.type === 'break' ? ' is-break' : ''}${it.done ? ' is-done' : ''}`}
                style={{ left, width }}
                title={`${it.title} · ${it.startTime}–${minutesToTime(it.end)}`}
              >
                <span className="timetable-bar-title">{it.title}</span>
                <span className="timetable-bar-time mono">{it.startTime}–{minutesToTime(it.end)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
