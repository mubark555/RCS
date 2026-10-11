"use client";

import Link from "next/link";
import { useRole } from "@/components/RoleProvider";

// يمنع فتح الصفحة برابط مباشر دون صلاحية (perm: صلاحية أو مصفوفة صلاحيات مطلوبة كلها) (البيانات نفسها محمية أيضاً في قاعدة البيانات)
export default function Guard({ perm, children }) {
  const { ready, can } = useRole();
  if (!ready) return <div className="empty">جاري التحميل…</div>;
  if (![].concat(perm).every((p) => can(p))) return <NoAccess />;
  return children;
}

export function NoAccess({ text = "لا تملك صلاحية الوصول إلى هذه الصفحة." }) {
  return (
    <div className="empty">
      <div className="big">🔒</div>
      <div style={{ marginBottom: 12 }}>{text}</div>
      <Link href="/" className="btn">العودة إلى مهامي</Link>
    </div>
  );
}
