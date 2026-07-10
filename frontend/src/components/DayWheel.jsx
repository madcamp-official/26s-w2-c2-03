// CENTER가 RADIUS+바깥쪽 라벨 여백보다 커야, 9시/3시 방향(가장 왼쪽/오른쪽)
// 라벨이 SVG viewBox 밖으로 잘리지 않는다.
const RADIUS = 110;
const CENTER = 155;
const SIZE = CENTER * 2;

const TYPE_COLOR = {
  task: 'var(--signal)',
  break: 'var(--noise)',
};

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

function polarPoint(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// 파이 조각(중심에서 뻗어나가는 부채꼴) 경로. sweep=1(시계 방향)로 그려서
// angle 0 = 자정(12시 방향), angle 90 = 06:00(3시 방향)이 되도록 맞춘다.
function slicePath(cx, cy, r, startAngle, endAngle) {
  const clampedEnd = Math.max(endAngle, startAngle + 0.5);
  const s = polarPoint(cx, cy, r, startAngle);
  const e = polarPoint(cx, cy, r, clampedEnd);
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
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
    .sort((a, b) => a.start - b.start);

  if (scheduled.length === 0) {
    return (
      <p className="hint-text">
        시간표를 그리려면 각 항목의 시작 시간이 필요해요. John과의 대화에서 몇 시에 시작할지 알려주면 채워져요.
      </p>
    );
  }

  const slices = [];
  let cursor = 0;
  for (const it of scheduled) {
    if (it.start > cursor) {
      slices.push({ id: `gap-${cursor}`, start: cursor, end: it.start, gap: true });
    }
    slices.push({ ...it, gap: false });
    cursor = Math.max(cursor, it.end);
  }
  if (cursor < 24 * 60) {
    slices.push({ id: `gap-${cursor}`, start: cursor, end: 24 * 60, gap: true });
  }

  const dayEndMinutes = parseTimeToMinutes(dayEndTime);

  return (
    <div className="day-wheel">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="day-wheel-svg" role="img" aria-label="오늘의 원형 시간표">
        {slices.map((s) => {
          const startAngle = (s.start / 1440) * 360;
          const endAngle = (s.end / 1440) * 360;
          const path = slicePath(CENTER, CENTER, RADIUS, startAngle, endAngle);
          const fill = s.gap ? 'var(--surface-2)' : TYPE_COLOR[s.type] || 'var(--signal)';
          return <path key={s.id} d={path} fill={fill} stroke="var(--ground)" strokeWidth="1" />;
        })}

        {[0, 6, 12, 18].map((h) => {
          const angle = (h / 24) * 360;
          const p = polarPoint(CENTER, CENTER, RADIUS + 12, angle);
          return (
            <text key={h} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="day-wheel-label">
              {String(h).padStart(2, '0')}
            </text>
          );
        })}

        {dayEndMinutes !== null && (() => {
          const angle = (dayEndMinutes / 1440) * 360;
          const inner = polarPoint(CENTER, CENTER, RADIUS * 0.32, angle);
          const outer = polarPoint(CENTER, CENTER, RADIUS + 6, angle);
          const labelPos = polarPoint(CENTER, CENTER, RADIUS + 22, angle);
          return (
            <>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="var(--urgent)" strokeWidth="2" />
              <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle" className="day-wheel-label day-wheel-label-end">
                마무리
              </text>
            </>
          );
        })()}

        <circle cx={CENTER} cy={CENTER} r={RADIUS * 0.32} fill="var(--surface)" stroke="var(--line)" />
      </svg>

      <ul className="day-wheel-legend">
        {scheduled.map((it) => (
          <li key={it.id} className="day-wheel-legend-row">
            <span className={`day-wheel-dot${it.type === 'break' ? ' is-break' : ''}`} />
            <span className="day-wheel-legend-title">{it.title}</span>
            <span className="mono day-wheel-legend-time">
              {it.startTime}–{minutesToTime(it.end)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
