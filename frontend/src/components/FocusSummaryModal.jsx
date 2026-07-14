function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

function stateColor(state) {
  if (state === 'focus') return 'var(--signal)';
  if (state === 'drift') return 'var(--urgent)';
  if (state === 'break') return 'var(--noise)';
  return 'var(--line)';
}

export function DriftDestinationList({ destinations = [], compact = false }) {
  const grouped = new Map();
  destinations.forEach((destination) => {
    if (!destination?.appName) return;
    const screenTitle = destination.screenTitle || null;
    const key = `${destination.appName}\n${screenTitle || ''}`;
    const previous = grouped.get(key) || {
      appName: destination.appName,
      screenTitle,
      durationMs: 0,
      visits: 0,
    };
    previous.durationMs += Math.max(0, Number(destination.durationMs) || 0);
    previous.visits += 1;
    grouped.set(key, previous);
  });

  const items = [...grouped.values()].sort((a, b) => b.durationMs - a.durationMs);
  if (items.length === 0) return null;
  const visibleItems = compact ? items.slice(0, 5) : items.slice(0, 8);

  return (
    <section className={`focus-drift-destinations${compact ? ' compact' : ''}`}>
      <div className="focus-drift-destinations-head">
        <h3>이탈한 앱과 화면</h3>
        <span className="mono">{items.length}곳</span>
      </div>
      <ul>
        {visibleItems.map((item) => (
          <li key={`${item.appName}-${item.screenTitle || ''}`}>
            <div>
              <strong>{item.appName}</strong>
              {item.screenTitle && <span title={item.screenTitle}>{item.screenTitle}</span>}
            </div>
            <span className="focus-drift-duration num">
              {formatDuration(item.durationMs)}{item.visits > 1 ? ` · ${item.visits}회` : ''}
            </span>
          </li>
        ))}
      </ul>
      {items.length > visibleItems.length && (
        <p className="focus-drift-more">그 외 {items.length - visibleItems.length}곳</p>
      )}
    </section>
  );
}

export function FocusGraph({ timeline, totalElapsedMs }) {
  const width = 720;
  const height = 230;
  const left = 42;
  const right = 14;
  const top = 14;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const duration = Math.max(1, totalElapsedMs || timeline.at(-1)?.elapsedMs || 1);
  const samples = timeline.length > 0 ? timeline : [{ elapsedMs: 0, gauge: 50, state: 'focus' }];

  const xOf = (elapsedMs) => left + (Math.min(duration, Math.max(0, elapsedMs)) / duration) * plotWidth;
  const yOf = (gauge) => top + (1 - Math.min(100, Math.max(0, gauge)) / 100) * plotHeight;
  const points = samples.map((point) => `${xOf(point.elapsedMs)},${yOf(point.gauge)}`).join(' ');
  const lastSample = samples.at(-1);

  return (
    <div className="focus-summary-chart-wrap">
      <svg className="focus-summary-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="집중 게이지 변화 그래프">
        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line
              x1={left}
              y1={yOf(value)}
              x2={width - right}
              y2={yOf(value)}
              className="focus-summary-grid"
            />
            <text x={left - 9} y={yOf(value) + 4} textAnchor="end" className="focus-summary-axis">{value}</text>
          </g>
        ))}

        {samples.map((point, index) => {
          const nextElapsed = samples[index + 1]?.elapsedMs ?? duration;
          const x = xOf(point.elapsedMs);
          return (
            <rect
              key={`${point.elapsedMs}-${index}`}
              className="focus-summary-state-segment"
              x={x}
              y={height - bottom + 12}
              width={Math.max(2, xOf(nextElapsed) - x)}
              height="8"
              rx="2"
              fill={stateColor(point.state)}
              style={{ animationDelay: `${120 + Math.min(index, 20) * 35}ms` }}
            />
          );
        })}

        <polyline points={points} pathLength="1" className="focus-summary-line" />
        <circle
          className="focus-summary-end-dot"
          cx={xOf(lastSample.elapsedMs)}
          cy={yOf(lastSample.gauge)}
          r="5"
        />
        <text x={left} y={height - 5} textAnchor="start" className="focus-summary-axis">시작</text>
        <text x={width - right} y={height - 5} textAnchor="end" className="focus-summary-axis">
          {formatDuration(duration)}
        </text>
      </svg>
      <div className="focus-summary-legend">
        <span><i className="tone-focus" />집중</span>
        <span><i className="tone-drift" />이탈</span>
        <span><i className="tone-break" />휴식</span>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }) {
  return (
    <div className={`focus-summary-stat${tone ? ` tone-${tone}` : ''}`}>
      <strong className="num">{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function FocusSummaryModal({ summary, onClose }) {
  return (
    <div className="focus-modal-backdrop" onClick={onClose}>
      <section className="focus-summary-modal" onClick={(event) => event.stopPropagation()}>
        <header className="focus-summary-head">
          <div>
            <div className="kicker mono">Focus session complete</div>
            <h2>집중 세션을 마쳤어요</h2>
            {summary.taskTitle && <p>{summary.taskTitle}</p>}
          </div>
          <div className="focus-summary-rate num">{summary.focusRate || 0}%</div>
        </header>

        <div className="focus-summary-stats">
          <SummaryStat label="평균 연속 집중 시간" value={formatDuration(summary.averageFocusMs)} tone="focus" />
          <SummaryStat label="총 집중 시간" value={formatDuration(summary.totalFocusMs)} tone="focus" />
          <SummaryStat label="총 이탈 시간" value={formatDuration(summary.totalDriftMs)} tone="drift" />
          <SummaryStat label="집중 구간" value={`${summary.focusSegmentCount || 0}회`} />
        </div>

        <DriftDestinationList destinations={summary.driftDestinations || []} />

        <div className="focus-summary-graph-head">
          <div>
            <h3>집중 그래프</h3>
            <p>게이지 변화와 집중·이탈·휴식 구간을 함께 표시합니다.</p>
          </div>
          <span className="mono">이탈 {summary.driftCount || 0}회</span>
        </div>
        <FocusGraph timeline={summary.timeline || []} totalElapsedMs={summary.totalElapsedMs} />

        <footer className="focus-summary-foot">
          <span>전체 세션 {formatDuration(summary.totalElapsedMs)}</span>
          <button type="button" className="btn-primary" onClick={onClose}>확인</button>
        </footer>
      </section>
    </div>
  );
}
