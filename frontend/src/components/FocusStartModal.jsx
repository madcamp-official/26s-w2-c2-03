import { useEffect, useState } from 'react';

// 앱 내부(React)에서 여는 집중 시작 모달.
// 1) 오늘 할 일 중 지금 집중할 태스크를 고르고(그 태스크의 예상 시간이 목표
//    시간이 되어 과몰입 판단 기준이 된다), 2) 집중 대상으로 볼 앱을 고른다.
export default function FocusStartModal({ controls, tasks, onClose }) {
  const [apps, setApps] = useState(null); // null=로딩중
  const [selectedApps, setSelectedApps] = useState(() => new Set());
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [error, setError] = useState(null);

  // 오늘 할 일 중 아직 안 끝난 '작업' 항목만 후보로.
  const candidateTasks = (tasks || []).filter((t) => t.type === 'task' && !t.done);
  const selectedTask = candidateTasks.find((t) => t.id === selectedTaskId) || null;

  useEffect(() => {
    let cancelled = false;
    controls.getOpenApps()
      .then((list) => {
        if (!cancelled) setApps(list || []);
      })
      .catch(() => {
        if (!cancelled) setError('열린 앱 목록을 불러오지 못했어요');
      });
    return () => {
      cancelled = true;
    };
  }, [controls]);

  function toggleApp(appId) {
    setSelectedApps((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function start() {
    if (!apps) return;
    const focusApps = apps.filter((a) => selectedApps.has(a.appId));
    if (focusApps.length === 0) return;
    controls.startFocus(focusApps, {
      targetMinutes: selectedTask ? selectedTask.targetMinutes : null,
      taskTitle: selectedTask ? selectedTask.title : null,
    });
    onClose();
  }

  return (
    <div className="focus-modal-backdrop" onClick={onClose}>
      <div className="focus-modal" onClick={(e) => e.stopPropagation()}>
        <div className="focus-modal-head">
          <div className="kicker mono">집중 모드 시작</div>
          <h2>무엇에 집중할까요?</h2>
          <p className="hint-text">오늘 할 일 중 지금 집중할 작업을 고르면, 그 예상 시간을 기준으로 과몰입을 알려드려요.</p>
        </div>

        <div className="focus-task-list">
          {candidateTasks.length === 0 && (
            <p className="hint-text focus-modal-pad">오늘 할 일이 없어요. 작업 없이도 집중을 시작할 수 있어요.</p>
          )}
          {candidateTasks.map((t) => (
            <label key={t.id} className={`focus-task-row${selectedTaskId === t.id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="focus-task"
                checked={selectedTaskId === t.id}
                onChange={() => setSelectedTaskId(t.id)}
              />
              <span className="focus-task-title">{t.title}</span>
              <span className="focus-task-min mono">{t.targetMinutes}분</span>
            </label>
          ))}
        </div>

        <div className="focus-modal-subhead">
          <div className="kicker mono">집중할 앱</div>
          <p className="hint-text">고른 앱에 있는 동안은 집중으로 보고, 그 외 창으로 벗어나면 알려드려요.</p>
        </div>

        <div className="focus-app-list">
          {apps === null && !error && <p className="hint-text focus-modal-pad">열린 앱을 불러오는 중...</p>}
          {error && <p className="error-text focus-modal-pad">{error}</p>}
          {apps && apps.length === 0 && !error && (
            <p className="hint-text focus-modal-pad">감지된 앱이 없어요. 집중할 앱을 먼저 실행해 주세요.</p>
          )}
          {apps && apps.map((app) => (
            <label key={app.appId} className={`focus-app-row${selectedApps.has(app.appId) ? ' is-selected' : ''}`}>
              <input
                type="checkbox"
                checked={selectedApps.has(app.appId)}
                onChange={() => toggleApp(app.appId)}
              />
              <span className="focus-app-name">{app.name}</span>
              <span className="focus-app-id mono">{app.bundleId || app.path || ''}</span>
            </label>
          ))}
        </div>

        <div className="focus-modal-foot">
          <span className="mono hint-text">
            {selectedTask ? `"${selectedTask.title}" · ${selectedApps.size}개 앱` : `${selectedApps.size}개 앱`}
          </span>
          <div className="focus-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            <button type="button" className="btn-primary" disabled={selectedApps.size === 0} onClick={start}>
              집중 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
