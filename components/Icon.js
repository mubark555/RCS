// مجموعة أيقونات SVG أنيقة أحادية اللون (ترث لون النص) — بديل احترافي للإيموجي
const P = {
  home: "M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  projects: "M4 5h7v6H4zM13 5h7v4h-7zM13 12h7v7h-7zM4 14h7v5H4z",
  calendar: "M4 7h16v13H4zM4 7V5m16 2V5M8 3v4m8-4v4M4 11h16",
  archive: "M3 7h18v4H3zM5 11v9h14v-9M9 15h6",
  users: "M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 20v-1a4 4 0 0 0-3-3.8M17.5 4.2a3.5 3.5 0 0 1 0 6.6",
  edit: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 6.5l3 3",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  link: "M10 13a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 0 0-5.7-5.7L11.5 6M14 11a4 4 0 0 0-6-.5L5.5 13a4 4 0 0 0 5.7 5.7L12.5 18",
  upload: "M12 15V4m0 0L8 8m4-4 4 4M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-2 9-2 9h16s-2-2-2-9M10.5 20a2 2 0 0 0 3 0",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  flag: "M5 21V4m0 0h11l-1.5 4L16 12H5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  check: "M4 12l5 5L20 6",
  alert: "M12 3 2 20h20L12 3zM12 9v5M12 17.5v.5",
  pin: "M12 21s6-5 6-10a6 6 0 1 0-12 0c0 5 6 10 6 10zM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  arrow: "M14 6l6 6-6 6M20 12H4",
  briefcase: "M4 8h16v11H4zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h7M15 18h5M13 4v4M7 10v4M11 16v4",
  palette: "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5 1-2 2-2h1a3 3 0 0 0 3-3c0-5-4-9-8-9zM7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM10.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM15 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
};

export default function Icon({ name, size = 18, stroke = 1.8, style, className }) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {d.split("M").filter(Boolean).map((seg, i) => (
        <path key={i} d={"M" + seg} />
      ))}
    </svg>
  );
}
