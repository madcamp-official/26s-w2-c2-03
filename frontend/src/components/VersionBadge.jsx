import { useEffect, useState } from 'react';

// 데스크톱 앱에서만 실제 버전을 알 수 있다(window.zonemate는 Electron
// preload가 주입 — 웹 브라우저에는 없음). 업데이트가 실제로 적용됐는지
// 화면에서 바로 확인할 수 있도록 항상 왼쪽 아래에 한 줄로 표시한다.
export default function VersionBadge() {
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (!window.zonemate?.getVersion) return;
    window.zonemate.getVersion().then(setVersion).catch(() => {});
  }, []);

  if (!version) return null;

  return <div className="version-badge num">v{version}</div>;
}
