export function CesiumLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="cesium-logo-grad"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#cesium-logo-grad)" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="ui-monospace, monospace"
        fontWeight="700"
        fontSize="18"
      >
        {'}'}
      </text>
    </svg>
  );
}
