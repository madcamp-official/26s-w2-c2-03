import { Resend } from 'resend';

// resend.dev 도메인은 별도 도메인 인증 없이 바로 테스트 가능 (실제 서비스 전환 시 자체 도메인으로 교체)
const FROM = 'FocusLog <onboarding@resend.dev>';

// Resend는 생성자에서 API 키가 없으면 즉시 throw 하기 때문에, 모듈 로드
// 시점(import)에 인스턴스화하면 RESEND_API_KEY가 없을 때 서버 전체가 죽는다.
// 실제로 이메일을 보낼 때만 인스턴스를 만들도록 지연시켜서, 이 기능만
// 아직 설정 안 됐을 때도 나머지 서버는 정상적으로 뜨게 한다.
export async function sendVerificationCode(email, code) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY가 설정되지 않았어요. backend/.env를 확인해주세요.');
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: '[FocusLog] 이메일 인증번호',
    html: `<p>인증번호는 <b>${code}</b> 입니다. 10분 안에 입력해주세요.</p>`,
  });
  if (error) {
    throw new Error(error.message || '이메일 전송에 실패했어요');
  }
}
