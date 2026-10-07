// دورة حياة الاجتماع: مجدول → منتهي (كتابة المحضر) → معتمد ومُرسَل للحضور
// (ملغى خارج الدورة)

export const MEETING_STATUS = {
  Scheduled: { ar: "مجدول", color: "#2563eb", step: 0 },
  Done: { ar: "منتهي — بانتظار اعتماد المحضر", short: "بانتظار الاعتماد", color: "#c88a2e", step: 1 },
  Approved: { ar: "محضر معتمد", short: "معتمد", color: "#16a34a", step: 2 },
  Cancelled: { ar: "ملغى", color: "#dc2626", step: -1 },
};

// الحضور قد يُحفظ كمصفوفة أو كنص JSON (عمود نصّي قديم) أو كنص مفصول بفواصل
export function parseAttendees(v) {
  if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
  const s = String(v || "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x || "").trim()).filter(Boolean);
    } catch {}
  }
  return s.split(/[,،]/).map((x) => x.replace(/^[\s"'[\]]+|[\s"'[\]]+$/g, "")).filter(Boolean);
}

// الحضور الفعلي (من أُكّد حضوره عند الإنهاء) وإلا المدعوون
export const presentOf = (m) => (Array.isArray(m?.present) && m.present.length ? m.present : parseAttendees(m?.attendees));

export const isLocked = (m) => m?.status === "Approved";
