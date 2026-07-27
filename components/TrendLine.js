"use client";

// مخطّط خطّي/مساحي (SVG) — points: [{ label, value }]
// يرسم مساحة متدرّجة + خط + نقاط، مع أسماء المحور السفلي. RTL-friendly.
export default function TrendLine({ points = [], height = 200, color = "#e05a50", fmt = (n) => n }) {
  const rows = points.filter(Boolean);
  if (rows.length < 2) return <div className="empty" style={{ padding: "24px 0" }}>لا تكفي البيانات لعرض الاتجاه</div>;

  const W = 520;
  const H = height;
  const padX = 34;
  const padTop = 24;
  const padBottom = 40;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const max = Math.max(1, ...rows.map((p) => Number(p.value) || 0));
  const n = rows.length;

  // في التخطيط RTL نعرض أول نقطة على اليمين
  const xAt = (i) => padX + plotW - (i / (n - 1)) * plotW;
  const yAt = (v) => padTop + plotH - ((Number(v) || 0) / max) * plotH;

  const linePts = rows.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(" ");
  const areaPts = `${padX + plotW},${padTop + plotH} ${linePts} ${padX},${padTop + plotH}`;
  const gid = "grad-" + color.replace(/[^a-z0-9]/gi, "");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 320, display: "block" }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* شبكة أفقية خفيفة */}
        {[0, 0.5, 1].map((g, i) => (
          <line key={i} x1={padX} y1={padTop + plotH * g} x2={padX + plotW} y2={padTop + plotH * g} stroke="#f0ebe1" strokeWidth="1" />
        ))}
        <polygon points={areaPts} fill={`url(#${gid})`} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {rows.map((p, i) => (
          <g key={i}>
            <circle cx={xAt(i)} cy={yAt(p.value)} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />
            <text x={xAt(i)} y={padTop + plotH + 18} textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: "#8a827a" }}>
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
