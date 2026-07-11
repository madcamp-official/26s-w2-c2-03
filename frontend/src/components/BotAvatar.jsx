// John — "집중 메이트" 마스코트. 앱 아이콘/메뉴바 아이콘과 완전히 동일한
// 집중냥(고양이) 도형을 그대로 사용한다(같은 좌표·색·수염). 브랜드 마스코트라
// 색은 테마 토큰이 아니라 앱 아이콘과 같은 고정 색을 쓴다.
export default function BotAvatar({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      className="bot-avatar"
    >
      <rect x="88" y="88" width="848" height="848" rx="190" fill="#1C1814" stroke="#3A332C" strokeWidth="3" />
      <polygon points="300,420 285,150 455,300" fill="#EBA23C" />
      <polygon points="724,420 739,150 569,300" fill="#EBA23C" />
      <circle cx="512" cy="545" r="250" fill="#EBA23C" />
      <circle cx="416" cy="520" r="44" fill="#1C1814" />
      <circle cx="608" cy="520" r="44" fill="#1C1814" />
      <circle cx="404" cy="505" r="13" fill="#EBA23C" />
      <circle cx="596" cy="505" r="13" fill="#EBA23C" />
      <polygon points="478,590 546,590 512,632" fill="#1C1814" />
      <path d="M512 632 Q512 668 478 662" fill="none" stroke="#1C1814" strokeWidth="12" strokeLinecap="round" />
      <path d="M512 632 Q512 668 546 662" fill="none" stroke="#1C1814" strokeWidth="12" strokeLinecap="round" />
      <path d="M452 600 L300 578" stroke="#1C1814" strokeWidth="10" strokeLinecap="round" />
      <path d="M452 622 L300 640" stroke="#1C1814" strokeWidth="10" strokeLinecap="round" />
      <path d="M572 600 L724 578" stroke="#1C1814" strokeWidth="10" strokeLinecap="round" />
      <path d="M572 622 L724 640" stroke="#1C1814" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}
