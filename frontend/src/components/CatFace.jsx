// 집중냥 얼굴 — 앱 아이콘과 같은 도형(진한 동공 + 몸통색 반짝임 점, 테두리 없음)을
// 배경 상자 없이 그대로 쓴다. 상태(집중/이탈/휴식)는 표정이 아니라 몸통 색으로만
// 전달한다(tokens.css의 --cat-focus/--cat-drift/--cat-break).
export default function CatFace({ size = 104, fill = 'var(--cat-focus)', className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" className={className}>
      <polygon points="300,420 285,150 455,300" fill={fill} />
      <polygon points="724,420 739,150 569,300" fill={fill} />
      <circle cx="512" cy="545" r="250" fill={fill} />
      <circle cx="416" cy="520" r="44" fill="var(--cat-ink)" />
      <circle cx="608" cy="520" r="44" fill="var(--cat-ink)" />
      <circle cx="404" cy="505" r="13" fill={fill} />
      <circle cx="596" cy="505" r="13" fill={fill} />
      <polygon points="478,590 546,590 512,632" fill="var(--cat-ink)" />
      <path d="M512 632 Q512 668 478 662" fill="none" stroke="var(--cat-ink)" strokeWidth="12" strokeLinecap="round" />
      <path d="M512 632 Q512 668 546 662" fill="none" stroke="var(--cat-ink)" strokeWidth="12" strokeLinecap="round" />
      <path d="M452 600 L300 578" stroke="var(--cat-ink)" strokeWidth="10" strokeLinecap="round" />
      <path d="M452 622 L300 640" stroke="var(--cat-ink)" strokeWidth="10" strokeLinecap="round" />
      <path d="M572 600 L724 578" stroke="var(--cat-ink)" strokeWidth="10" strokeLinecap="round" />
      <path d="M572 622 L724 640" stroke="var(--cat-ink)" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}
