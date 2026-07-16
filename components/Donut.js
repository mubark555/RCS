"use client";

// رسم بياني دائري (SVG) — segments: [{ label, value, color }]
export default function Donut({ segments, size = 190, thickness = 22, centerTop, centerBottom }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#eef1f7" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </g>
      {centerTop != null && (
        <text x="50%" y="47%" textAnchor="middle" style={{ fontSize: 30, fontWeight: 800, fill: "#131a2e" }}>
          {centerTop}
        </text>
      )}
      {centerBottom != null && (
        <text x="50%" y="60%" textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: "#8a93ab" }}>
          {centerBottom}
        </text>
      )}
    </svg>
  );
}
