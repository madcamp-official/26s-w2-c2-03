import { useId } from 'react';

// John — "집중 메이트" 마스코트. 앱 아이콘과 같은 집중냥(고양이) 얼굴로,
// 뒤에 "존(zone)" 링을 둘러 집중 동반자 느낌을 낸다. 색은 전부 디자인 토큰을
// 따른다(몸=signal 앰버, 눈·코·수염=signal-ink).
export default function BotAvatar({ size = 32 }) {
  const uid = useId();
  const bodyGrad = `botBody-${uid}`;
  const glowGrad = `botGlow-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="bot-avatar"
    >
      <defs>
        <linearGradient id={bodyGrad} gradientUnits="userSpaceOnUse" x1="20" y1="5" x2="20" y2="32">
          <stop offset="0" stopColor="var(--signal-dim)" />
          <stop offset="1" stopColor="var(--signal)" />
        </linearGradient>
        <radialGradient id={glowGrad} cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 뒤를 감싸는 집중 "존" 링 */}
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="var(--signal)" strokeWidth="1.4" opacity="0.22" />

      {/* 귀 + 얼굴 */}
      <g fill={`url(#${bodyGrad})`}>
        <polygon points="11,15.5 9.5,5.5 17.5,12" />
        <polygon points="29,15.5 30.5,5.5 22.5,12" />
        <circle cx="20" cy="21" r="10.8" />
      </g>
      {/* 상단 하이라이트로 입체감 */}
      <circle cx="20" cy="21" r="10.8" fill={`url(#${glowGrad})`} />

      {/* 눈 + 반짝임 */}
      <circle cx="16.2" cy="20.2" r="2" fill="var(--signal-ink)" />
      <circle cx="23.8" cy="20.2" r="2" fill="var(--signal-ink)" />
      <circle cx="16.9" cy="19.5" r="0.6" fill="var(--signal)" opacity="0.9" />
      <circle cx="24.5" cy="19.5" r="0.6" fill="var(--signal)" opacity="0.9" />

      {/* 코 */}
      <polygon points="18.8,23.2 21.2,23.2 20,24.9" fill="var(--signal-ink)" />
      {/* 부드러운 미소 */}
      <path d="M17.5 25.3 Q20 27.6 22.5 25.3" fill="none" stroke="var(--signal-ink)" strokeWidth="1.4" strokeLinecap="round" />

      {/* 수염 */}
      <g stroke="var(--signal-ink)" strokeWidth="0.8" strokeLinecap="round" opacity="0.85">
        <path d="M16.4 23.6 L9.6 22.6" />
        <path d="M16.4 25 L9.6 26" />
        <path d="M23.6 23.6 L30.4 22.6" />
        <path d="M23.6 25 L30.4 26" />
      </g>
    </svg>
  );
}
