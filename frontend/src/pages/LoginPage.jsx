export default function LoginPage() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="wordmark"><b>Zone</b>mate</div>
        <h1>로그인</h1>

        <div className="oauth-buttons">
          <a className="btn-oauth btn-kakao" href="/api/auth/kakao">카카오로 시작하기</a>
          <a className="btn-oauth btn-google" href="/api/auth/google">구글로 시작하기</a>
        </div>

      </div>
    </div>
  );
}
