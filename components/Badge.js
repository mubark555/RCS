import { metaOf } from "@/lib/constants";

export default function Badge({ map, value, fallback }) {
  const m = metaOf(map, value, fallback);
  return (
    <span
      className="badge"
      style={{ background: `${m.color}22`, color: m.color }}
    >
      <span className="dot" style={{ background: m.color }} />
      {m.ar}
    </span>
  );
}
