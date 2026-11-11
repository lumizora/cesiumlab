/** Decorative homepage illustration only. Live CesiumJS remains in the detail Viewer. */
export default function FeaturedGlobe({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? 'globe-art globe-art--small' : 'globe-art'}
      viewBox="0 0 640 430"
      role="img"
      aria-label="概念示意：夜间地球上的网络节点与汇聚光线"
    >
      <defs>
        <radialGradient id="globeFill">
          <stop offset="0" stopColor="#20547a" />
          <stop offset="0.75" stopColor="#102c4d" />
          <stop offset="1" stopColor="#08162c" />
        </radialGradient>
        <linearGradient id="arcGlow" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#8aefff" />
          <stop offset="0.65" stopColor="#edbb59" />
          <stop offset="1" stopColor="#fff3ae" />
        </linearGradient>
        <clipPath id="globeClip">
          <circle cx="330" cy="217" r="180" />
        </clipPath>
        <filter id="pointGlow">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <g opacity=".34" stroke="#6a9ab5" strokeWidth=".5">
        {Array.from({ length: 13 }, (_, i) => (
          <path key={'grid-a-' + i} d={'M ' + i * 54 + ' 0 V 430'} />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <path key={'grid-b-' + i} d={'M 0 ' + i * 54 + ' H 640'} />
        ))}
      </g>
      <g fill="#82dafa" opacity=".6">
        {Array.from({ length: 55 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 109 + 43) % 637}
            cy={(i * 73 + 29) % 427}
            r={i % 5 === 0 ? 1.4 : 0.7}
          />
        ))}
      </g>
      <circle cx="330" cy="217" r="182" fill="none" stroke="#58b6df" strokeWidth="2" />
      <circle cx="330" cy="217" r="179" fill="url(#globeFill)" />
      <g clipPath="url(#globeClip)">
        <g fill="none" stroke="#40799c" opacity=".49" strokeWidth=".7">
          {[-132, -86, -42, 0, 42, 86, 132].map((x, i) => (
            <ellipse key={i} cx="330" cy="217" rx={Math.abs(x) + 18} ry="180" />
          ))}
          {[-110, -72, -36, 0, 36, 72, 110].map((y, i) => (
            <ellipse key={i} cx="330" cy={217 + y * 0.32} rx="180" ry={180 - Math.abs(y) * 0.65} />
          ))}
        </g>
        <path
          d="M210 145l41-24 36 11 18-16 28 21 25-10 39 20 14 24 35 4-3 22-37 18-11 29-34-1-20 35-24-22-36 18-28-32-27-10-4-36-25-12z"
          fill="#1d5867"
          stroke="#5b9ba7"
          strokeWidth="1.4"
          opacity=".78"
        />
        <path
          d="M232 264l-15 30 28 76 28-31-4-35-18-31zM381 312l15 22-3 54-13 4-15-36z"
          fill="#1b5162"
          stroke="#5b9ba7"
          strokeWidth="1.2"
          opacity=".72"
        />
        <g
          stroke="url(#arcGlow)"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          className="globe-arcs"
        >
          <path d="M238 194 Q302 120 375 218" />
          <path d="M255 260 Q302 167 375 218" />
          <path d="M308 151 Q358 170 375 218" />
          <path d="M446 184 Q413 153 375 218" />
          <path d="M274 226 Q324 193 375 218" />
          <path d="M329 276 Q358 231 375 218" />
          <path d="M382 160 Q391 183 375 218" />
        </g>
        <g fill="#a8f4ff" stroke="#e7ffff" strokeWidth=".7">
          {[
            [238, 194],
            [255, 260],
            [308, 151],
            [446, 184],
            [274, 226],
            [329, 276],
            [382, 160],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.4" />
          ))}
        </g>
        <g fill="none" stroke="#ffcb74" opacity=".8">
          <ellipse cx="375" cy="218" rx="29" ry="12" />
          <ellipse cx="375" cy="218" rx="51" ry="22" />
          <ellipse cx="375" cy="218" rx="74" ry="32" opacity=".4" />
        </g>
        <circle cx="375" cy="218" r="12" fill="#ffecb6" opacity=".5" filter="url(#pointGlow)" />
        <circle cx="375" cy="218" r="7" fill="#fff6cd" />
      </g>
      <circle cx="330" cy="217" r="181" fill="none" stroke="#54b5da" strokeWidth="1" />
    </svg>
  );
}
