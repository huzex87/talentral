// A hub's banner when it has no cover photo: soft light shapes and a dotted grid over the hub's
// own colour (set as the background by the parent), so every hub page opens in its brand.
export function HubPattern({ className = 'absolute inset-0 size-full' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 320" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="hp-a" cx="0.85" cy="0.1" r="0.6"><stop offset="0" stopColor="#fff" stopOpacity="0.28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id="hp-b" cx="0.1" cy="1" r="0.55"><stop offset="0" stopColor="#000" stopOpacity="0.28" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <pattern id="hp-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#fff" fillOpacity="0.16" /></pattern>
      </defs>
      <rect width="1200" height="320" fill="url(#hp-b)" />
      <rect width="1200" height="320" fill="url(#hp-a)" />
      <rect x="640" width="560" height="320" fill="url(#hp-dots)" />
      <circle cx="1040" cy="250" r="150" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="2" />
      <circle cx="1040" cy="250" r="100" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="2" />
      <path d="M0 260 C 220 200, 380 320, 620 250 S 1000 170, 1200 230 L1200 320 L0 320 Z" fill="#fff" fillOpacity="0.06" />
    </svg>
  );
}
