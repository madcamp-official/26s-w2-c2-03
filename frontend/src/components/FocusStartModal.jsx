import { useEffect, useState } from 'react';

// 앱 내부(React)에서 여는 집중 시작 모달 — 지금 열려 있는 앱 목록을 받아
// 집중 대상으로 쓸 앱을 고른다. 트레이의 "집중 시작..." 창과 같은 역할을
// 앱 안에서 한다.
export default function FocusStartModal({ controls, onClose }) {
  const [apps, setApps] = useState(null); // null=로딩중
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState(null);

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

  function toggle(appId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function start() {
    if (!apps) return;
    const focusApps = apps.filter((a) => selected.has(a.appId));
    if (focusApps.length === 0) return;
    controls.startFocus(focusApps);
    onClose();
  }

  return (
    <div className="focus-modal-backdrop" onClick={onClose}>
      <div className="focus-modal" onClick={(e) => e.stopPropagation()}>
        <div className="focus-modal-head">
          <div className="kicker mono">집중 모드 시작</div>
          <h2>집중할 앱을 골라주세요</h2>
          <p className="hint-text">고른 앱에 있는 동안은 집중으로 보고, 그 외 창으로 벗어나면 알려드려요.</p>
        </div>

        <div className="focus-app-list">
          {apps === null && !error && <p className="hint-text">열린 앱을 불러오는 중...</p>}
          {error && <p className="error-text">{error}</p>}
          {apps && apps.length === 0 && !error && (
            <p className="hint-text">감지된 앱이 없어요. 집중할 앱을 먼저 실행해 주세요.</p>
          )}
          {apps && apps.map((app) => (
            <label key={app.appId} className={`focus-app-row${selected.has(app.appId) ? ' is-selected' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(app.appId)}
                onChange={() => toggle(app.appId)}
              />
              <span className="focus-app-name">{app.name}</span>
              <span className="focus-app-id mono">{app.bundleId || app.path || ''}</span>
            </label>
          ))}
        </div>

        <div className="focus-modal-foot">
          <span className="mono hint-text">{selected.size}개 선택됨</span>
          <div className="focus-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            <button type="button" className="btn-primary" disabled={selected.size === 0} onClick={start}>
              집중 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
