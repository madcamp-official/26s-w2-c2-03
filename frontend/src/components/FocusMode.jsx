import { useState } from 'react';

const BREAK_PRESETS = [5, 10, 15, 30];

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// 게이지(0~100)를 값에 따라 색으로 매핑 — 낮으면 urgent(주의), 높으면 signal.
function gaugeColor(value) {
  if (value >= 66) return 'var(--signal)';
  if (value >= 33) return 'var(--signal-dim)';
  return 'var(--urgent)';
}

function GaugeRing({ value }) {
  const size = 200;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * circ;

  return (
    <svg className="gauge-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={gaugeColor(value)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.6s ease' }}
      />
      <text x="50%" y="47%" textAnchor="middle" className="gauge-value num">{value}</text>
      <text x="50%" y="62%" textAnchor="middle" className="gauge-label">집중력</text>
    </svg>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`focus-stat${tone ? ` tone-${tone}` : ''}`}>
      <div className="focus-stat-value num">{value}</div>
      <div className="focus-stat-label">{label}</div>
    </div>
  );
}

// 집중 모드일 때 다른 화면을 전부 덮는 전체화면 대시보드.
export default function FocusMode({ state, now, controls }) {
  const [showBreakPicker, setShowBreakPicker] = useState(false);
  const [customMin, setCustomMin] = useState('');

  const onBreak = state.status === 'onBreak';
  const drifting = Boolean(state.isDrifting);

  const focusStreakMs = state.focusStreakStartedAt ? now - state.focusStreakStartedAt : 0;
  const driftMs = state.driftStartedAt ? now - state.driftStartedAt : 0;
  const breakRemainingMs = onBreak && state.breakEndsAt ? state.breakEndsAt - now : 0;

  const focusAppNames = (state.focusApps || []).map((a) => a.name).join(', ');

  function startBreak(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 1) return;
    controls.startBreak(m);
    setShowBreakPicker(false);
    setCustomMin('');
  }

  const statusText = onBreak
    ? '휴식 중'
    : drifting
      ? '집중에서 벗어남'
      : '집중 중';
  const statusTone = onBreak ? 'break' : drifting ? 'drift' : 'focus';

  return (
    <div className={`focus-mode tone-${statusTone}`}>
      <div className="focus-mode-inner">
        <div className={`focus-status-pill tone-${statusTone}`}>
          <span className="dot" />
          {statusText}
        </div>

        {state.taskTitle && (
          <div className="focus-current-task">
            <span className="focus-current-task-kicker mono">지금 하는 일</span>
            <span className="focus-current-task-title">{state.taskTitle}</span>
          </div>
        )}

        <GaugeRing value={onBreak ? state.gauge : state.gauge} />

        <div className="focus-primary">
          {onBreak ? (
            <>
              <div className="focus-primary-value num">{formatDuration(breakRemainingMs)}</div>
              <div className="focus-primary-label">휴식 남은 시간</div>
            </>
          ) : drifting ? (
            <>
              <div className="focus-primary-value num tone-drift">{formatDuration(driftMs)}</div>
              <div className="focus-primary-label">{`"${state.driftAppName || '다른 곳'}"에서 벗어나 있는 시간`}</div>
            </>
          ) : (
            <>
              <div className="focus-primary-value num">{formatDuration(focusStreakMs)}</div>
              <div className="focus-primary-label">지금 이어서 집중한 시간</div>
            </>
          )}
        </div>

        {focusAppNames && (
          <p className="focus-apps-line hint-text">
            집중 대상: {focusAppNames}
            {state.targetMinutes ? ` · 목표 ${state.targetMinutes}분` : ''}
          </p>
        )}

        <div className="focus-stats">
          <Stat label="총 집중 시간" value={formatDuration(state.totalFocusMs || 0)} tone="focus" />
          <Stat label="총 휴식 시간" value={formatDuration(state.totalBreakMs || 0)} tone="break" />
          <Stat label="딴짓한 시간" value={formatDuration(state.totalDriftMs || 0)} tone="drift" />
          <Stat
            label="최근 복귀 소요"
            value={state.lastReturnMs != null ? formatDuration(state.lastReturnMs) : '—'}
          />
          <Stat label="벗어난 횟수" value={`${state.driftCount || 0}회`} />
        </div>

        <div className="focus-controls">
          {onBreak ? (
            <button type="button" className="btn-primary" onClick={() => controls.resumeFocus()}>
              집중 재개
            </button>
          ) : showBreakPicker ? (
            <div className="break-inline">
              <span className="hint-text mono">얼마나 쉴까요?</span>
              {BREAK_PRESETS.map((m) => (
                <button key={m} type="button" className="btn-ghost" onClick={() => startBreak(m)}>{m}분</button>
              ))}
              <input
                type="number"
                min="1"
                max="240"
                placeholder="직접"
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                className="break-custom-input mono"
              />
              <button type="button" className="btn-ghost" disabled={!customMin} onClick={() => startBreak(customMin)}>시작</button>
              <button type="button" className="btn-link" onClick={() => setShowBreakPicker(false)}>취소</button>
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setShowBreakPicker(true)}>
              휴식하기
            </button>
          )}
          <button type="button" className="btn-danger" onClick={() => controls.stopFocus()}>
            집중 멈추기
          </button>
        </div>
      </div>
    </div>
  );
}
