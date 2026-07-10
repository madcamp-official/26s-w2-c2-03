import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setNickname as apiSetNickname } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function NicknamePage() {
  const [nickname, setNicknameInput] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiSetNickname(nickname);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="wordmark"><b>Zone</b>mate</div>
        <h1>어떻게 불러드리면 될까요?</h1>
        <form onSubmit={handleSubmit} className="task-input">
          <label className="field-label" htmlFor="nickname">닉네임</label>
          <input
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNicknameInput(e.target.value)}
            required
            maxLength={20}
          />
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading || !nickname.trim()}>
            시작하기
          </button>
        </form>
      </div>
    </div>
  );
}
