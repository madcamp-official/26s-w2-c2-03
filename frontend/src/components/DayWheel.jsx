// 등록된 일정 중심의 가로 타임라인(간트형) 시간표.
// 제목/시간 텍스트는 막대 안에 넣지 않고 왼쪽 라벨 칸에 따로 두어(짧은
// 일정도 글자가 잘리지 않게), 막대는 시간 비율만 시각적으로 보여준다.

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
        시간표를 그리려면 각 항목의 시작 시간이 필요해요. 각 할 일에 시작 시간을 지정하면 여기에 타임라인으로 그려져요.
      </p>
    );
  }

  const dayEndMin = parseTimeToMinutes(dayEndTime);

  // 등록된 일정 구간만 확대(+마감 시각 포함). 앞뒤로 30분 여유를 둔다.
  const minStart = Math.min(...scheduled.map((s) => s.start));
  const maxEnd = Math.max(...scheduled.map((s) => s.end), dayEndMin ?? -Infinity);
  const windowStart = Math.max(0, Math.floor((minStart - 30) / 60) * 60);
  let windowEnd = Math.min(24 * 60, Math.ceil((maxEnd + 30) / 60) * 60);
  if (windowEnd - windowStart < 60) windowEnd = Math.min(24 * 60, windowStart + 60);
  const span = windowEnd - windowStart;

  const pct = (min) => `${((min - windowStart) / span) * 100}%`;

  // 시간 눈금(정시). 가장자리(windowStart/End)는 라벨이 밖으로 잘리므로
  // 내부 정시만 라벨을 단다. 구간이 길면 간격을 벌린다.
  const hourStep = span / 60 > 10 ? 2 : 1;
  const ticks = [];
  for (let t = windowStart + 60; t < windowEnd; t += 60) {
    if (((t - windowStart) / 60) % hourStep !== 0) continue;
    ticks.push(t);
  }
  const showDayEnd = dayEndMin != null && dayEndMin > windowStart && dayEndMin < windowEnd;

  return (
    <div className="timetable">
      <div className="timetable-row timetable-axis-row">
        <div className="timetable-label timetable-axis-label mono">시간</div>
        <div className="timetable-track timetable-axis-track">
          {ticks.map((t) => (
            <span key={t} className="timetable-tick" style={{ left: pct(t) }}>
              <span className="timetable-tick-label num">{minutesToTime(t)}</span>
            </span>
          ))}
          {showDayEnd && (
            <span className="timetable-endline" style={{ left: pct(dayEndMin) }} title={`마무리 ${minutesToTime(dayEndMin)}`}>
              <span className="timetable-endline-label mono">마무리</span>
            </span>
          )}
        </div>
      </div>

      {scheduled.map((it) => {
        const left = pct(it.start);
        const width = `${Math.max(((it.end - it.start) / span) * 100, 1.5)}%`;
        return (
          <div key={it.id} className={`timetable-row${it.done ? ' is-done' : ''}`}>
            <div className="timetable-label">
              <span className="timetable-label-title" title={it.title}>{it.title}</span>
              <span className="timetable-label-time num">{it.startTime}–{minutesToTime(it.end)}</span>
            </div>
            <div className="timetable-track">
              {showDayEnd && <span className="timetable-row-endline" style={{ left: pct(dayEndMin) }} />}
              <div
                className={`timetable-bar${it.type === 'break' ? ' is-break' : ''}`}
                style={{ left, width }}
                title={`${it.title} · ${it.startTime}–${minutesToTime(it.end)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
