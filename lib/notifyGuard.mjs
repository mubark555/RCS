// قواعد مسار إرسال البريد (/api/notify) — دوال نقية قابلة للاختبار.

const norm = (e) => String(e || "").trim().toLowerCase();

// المستقبِلون المسموح بهم: بريد مستخدمي النظام النشطين + البريد الإضافي من إعدادات الإشعارات
export function allowedRecipients(users, notifySettings) {
  const set = new Set();
  for (const u of users || []) {
    if (u && u.status !== "suspended" && norm(u.email).includes("@")) set.add(norm(u.email));
  }
  const extra = String(notifySettings?.extraEmails || "").split(/[,،;\s]+/).map(norm).filter((e) => e.includes("@"));
  extra.forEach((e) => set.add(e));
  return set;
}

// المُرسِل: مستخدم نشط في النظام
export function isActiveUserEmail(users, email) {
  const e = norm(email);
  return Boolean(e) && (users || []).some((u) => norm(u.email) === e && u.status !== "suspended");
}

// يُرجع { ok, recipients } أو { ok:false, rejected }
export function checkRecipients(to, allowed) {
  const list = [...new Set((Array.isArray(to) ? to : [to]).map(norm).filter((e) => e.includes("@")))];
  const rejected = list.filter((e) => !allowed.has(e));
  return rejected.length ? { ok: false, rejected, recipients: list } : { ok: true, recipients: list };
}
