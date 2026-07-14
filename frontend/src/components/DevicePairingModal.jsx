import { useEffect, useRef, useState } from 'react';
import { fetchDevices, removeDevice, renameDevice, requestPairingCode } from '../api.js';

function formatCountdown(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function DevicePairingModal({ onClose }) {
  const [devices, setDevices] = useState(null); // null=로딩중
  const [devicesError, setDevicesError] = useState(null);

  const [code, setCode] = useState(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  // 코드를 발급하는 순간의 연동 기기 수를 기억해뒀다가, 폴링 중 그 수가
  // 늘어나면(=폰에서 코드 입력 성공) 자동으로 모달을 닫는다.
  const baselineDeviceCountRef = useRef(0);

  function loadDevices() {
    fetchDevices()
      .then(({ devices }) => setDevices(devices))
      .catch((err) => setDevicesError(err.message));
  }

  useEffect(() => {
    loadDevices();
  }, []);

  // 코드 발급 후 3분 카운트다운 — 0이 되면 "코드 받기" 버튼으로 되돌아간다.
  useEffect(() => {
    if (!code || remainingSec <= 0) return undefined;
    const timer = setInterval(() => setRemainingSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [code, remainingSec]);

  async function handleGetCode() {
    setCodeError(null);
    setCodeLoading(true);
    try {
      const { code, expiresInSec } = await requestPairingCode();
      baselineDeviceCountRef.current = devices ? devices.length : 0;
      setCode(code);
      setRemainingSec(expiresInSec);
    } catch (err) {
      setCodeError(err.message);
    } finally {
      setCodeLoading(false);
    }
  }

  const expired = code && remainingSec === 0;

  // 코드가 떠 있는 동안 짧은 주기로 기기 목록을 확인해서, 폰에서 코드를
  // 입력해 연동에 성공하는 순간(기기 수 증가) 이 창을 자동으로 닫는다.
  useEffect(() => {
    if (!code || expired) return undefined;
    const timer = setInterval(async () => {
      try {
        const { devices: latest } = await fetchDevices();
        setDevices(latest);
        if (latest.length > baselineDeviceCountRef.current) {
          clearInterval(timer);
          onClose();
        }
      } catch {
        // 폴링 실패는 조용히 다음 tick에 재시도
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [code, expired, onClose]);

  async function handleRename(id) {
    if (!editingName.trim()) return;
    try {
      await renameDevice(id, editingName.trim());
      setEditingId(null);
      loadDevices();
    } catch (err) {
      setDevicesError(err.message);
    }
  }

  async function handleRemove(id) {
    try {
      await removeDevice(id);
      loadDevices();
    } catch (err) {
      setDevicesError(err.message);
    }
  }

  return (
    <div className="focus-modal-backdrop" onClick={onClose}>
      <div className="focus-modal" onClick={(e) => e.stopPropagation()}>
        <div className="focus-modal-head">
          <div className="kicker mono">기기 연동</div>
          <h2>휴대폰과 연결하기</h2>
          <p className="hint-text">아래 코드를 발급받아 모바일 앱에 입력하면, 같은 계정으로 데이터가 공유돼요.</p>
        </div>

        <div className="focus-modal-pad">
          {!code || expired ? (
            <>
              {expired && <p className="error-text" style={{ marginBottom: 10 }}>코드가 만료됐어요. 다시 받아주세요.</p>}
              <button type="button" className="btn-primary" onClick={handleGetCode} disabled={codeLoading}>
                {codeLoading ? '발급 중...' : '코드 받기'}
              </button>
              {codeError && <p className="error-text" style={{ marginTop: 10 }}>{codeError}</p>}
            </>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div className="num" style={{ fontSize: 40, fontWeight: 700, letterSpacing: '0.08em' }}>{code}</div>
              <p className="hint-text mono" style={{ marginTop: 8 }}>{formatCountdown(remainingSec)} 안에 폰에서 입력해주세요</p>
            </div>
          )}
        </div>

        <div className="focus-modal-subhead">
          <div className="kicker mono">연동된 기기</div>
        </div>

        <div className="focus-app-list">
          {devices === null && !devicesError && <p className="hint-text focus-modal-pad">불러오는 중...</p>}
          {devicesError && <p className="error-text focus-modal-pad">{devicesError}</p>}
          {devices && devices.length === 0 && <p className="hint-text focus-modal-pad">아직 연동된 기기가 없어요.</p>}
          {devices && devices.map((d) => (
            <div key={d.id} className="focus-app-row" style={{ cursor: 'default' }}>
              {editingId === d.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button type="button" className="btn-link" onClick={() => handleRename(d.id)}>저장</button>
                  <button type="button" className="btn-link" onClick={() => setEditingId(null)}>취소</button>
                </>
              ) : (
                <>
                  <span className="focus-app-name">{d.name}</span>
                  <span className="focus-app-id mono">{d.platform || ''}</span>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => { setEditingId(d.id); setEditingName(d.name); }}
                  >
                    이름 변경
                  </button>
                  <button type="button" className="btn-link" onClick={() => handleRemove(d.id)}>연동 해제</button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="focus-modal-foot">
          <span />
          <div className="focus-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}
