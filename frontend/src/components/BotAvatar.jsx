import { useId } from 'react';

// John — "집중 메이트" 마스코트. 평평한 앰버 원 대신, 부드러운 스퀘어클
// 몸체에 그라데이션·상단 하이라이트로 깊이를 주고, 뒤에 "존(zone)" 링을
// 둘러 집중 동반자 느낌을 낸다. 색은 전부 디자인 토큰을 따른다.
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
        <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--signal-dim)" />
          <stop offset="1" stopColor="var(--signal)" />
        </linearGradient>
        <radialGradient id={glowGrad} cx="0.5" cy="0.32" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 뒤를 감싸는 집중 "존" 링 */}
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="var(--signal)" strokeWidth="1.4" opacity="0.22" />

      {/* 몸체 — 부드러운 스퀘어클 */}
      <rect x="6" y="6" width="28" height="28" rx="11" fill={`url(#${bodyGrad})`} />
      {/* 상단 하이라이트로 입체감 */}
      <rect x="6" y="6" width="28" height="28" rx="11" fill={`url(#${glowGrad})`} />

      {/* 차분한 눈 */}
      <circle cx="15.4" cy="19" r="2.15" fill="var(--signal-ink)" />
      <circle cx="24.6" cy="19" r="2.15" fill="var(--signal-ink)" />
      {/* 눈 반짝임 */}
      <circle cx="16.1" cy="18.3" r="0.62" fill="var(--signal)" opacity="0.9" />
      <circle cx="25.3" cy="18.3" r="0.62" fill="var(--signal)" opacity="0.9" />

      {/* 부드러운 미소 */}
      <path
        d="M15.2 24.4 Q20 27.8 24.8 24.4"
        stroke="var(--signal-ink)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
