export default function BotAvatar({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="bot-avatar"
    >
      <circle cx="20" cy="20" r="20" fill="var(--signal)" />
      <circle cx="13.5" cy="18" r="2.6" fill="var(--signal-ink)" />
      <circle cx="26.5" cy="18" r="2.6" fill="var(--signal-ink)" />
      <path
        d="M12 25 Q20 31 28 25"
        stroke="var(--signal-ink)"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
