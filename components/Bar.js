"use client";

// مخطّط أعمدة عمودي (SVG) — data: [{ label, value, color }]
// يعرض القيم أعلى كل عمود وأسماء الفئات أسفلها. RTL-friendly.
export default function Bar({ data = [], height = 200, fmt = (n) => n, barColor = "#e05a50" }) {
  const rows = data.filter(Boolean);
  const max = Math.max(1, ...rows.map((d) => Number(d.value) || 0));
  const W = Math.max(rows.length * 66, 240);
  const H = height;
  const padTop = 26;
  const padBottom = 42;
  const plot = H - padTop - padBottom;
  const bw = 34;
  const gap = rows.length ? (W - rows.length * bw) / (rows.length + 1) : 0;

  if (!rows.length) return <div className="empty" style={{ padding: "24px 0" }}>لا بيانات</div>;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 320), display: "block" }} preserveAspectRatio="xMidYMid meet">
        {/* خط الأساس */}
        <line x1="0" y1={padTop + plot} x2={W} y2={padTop + plot} stroke="#ece6da" strokeWidth="1.5" />
        {rows.map((d, i) => {
          const v = Number(d.value) || 0;
          const h = Math.max(2, (v / max) * plot);
          const x = gap + i * (bw + gap);
          const y = padTop + plot - h;
          const col = d.color || barColor;
          return (
            <g key={i}>
              <rect x={x} y={y} width={bw} height={h} rx="7" fill={col} opacity="0.92" />
              <text x={x + bw / 2} y={y - 8} textAnchor="middle" style={{ fontSize: 12.5, fontWeight: 800, fill: "#23201c" }}>
                {fmt(v)}
              </text>
              <text x={x + bw / 2} y={padTop + plot + 18} textAnchor="middle" style={{ fontSize: 11.5, fontWeight: 600, fill: "#8a827a" }}>
                {truncate(d.label, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}
