import { useState } from 'react';

export default function AccountDeletionModal({ onClose, onDelete }) {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const confirmed = confirmation.trim() === '탈퇴';

  async function handleDelete() {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err.message || '회원탈퇴를 처리하지 못했어요');
      setSubmitting(false);
    }
  }

  return (
    <div className="focus-modal-backdrop" onClick={submitting ? undefined : onClose}>
      <section
        className="focus-modal account-deletion-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-deletion-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="focus-modal-head">
          <div className="kicker mono">계정 삭제</div>
          <h2 id="account-deletion-title">정말 회원탈퇴할까요?</h2>
          <p className="hint-text">
            플래너, 캘린더, 집중 기록과 연동 기기 정보가 모두 영구 삭제되며 복구할 수 없습니다.
          </p>
        </div>

        <div className="account-deletion-body">
          <label className="field-label" htmlFor="account-deletion-confirmation">
            계속하려면 <b>탈퇴</b>를 입력하세요.
          </label>
          <input
            id="account-deletion-confirmation"
            className="account-deletion-input"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={submitting}
            autoComplete="off"
            autoFocus
          />
          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="focus-modal-foot">
          <span className="hint-text">삭제 후 로그인 화면으로 이동합니다.</span>
          <div className="focus-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={submitting}>취소</button>
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={!confirmed || submitting}>
              {submitting ? '삭제 중...' : '영구 삭제'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
