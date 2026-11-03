import { test } from "node:test";
import assert from "node:assert/strict";
import { meetingRecipients, dueReminder, detectMeetingMail, diffMeeting, buildIcs, buildMeetingMail, reminderLabel } from "../lib/meetingMail.mjs";

const users = [
  { id: "1", name: "خالد", email: "boss@x.com" },
  { id: "2", name: "أمل", email: "Amal@X.com" },
  { id: "3", name: "رائد", email: "" },
  { id: "4", name: "موقوف", email: "sus@x.com", status: "suspended" },
];

test("meetingRecipients: المدعوون + المنظّم، بلا تكرار، ومن بلا بريد أو موقوف يُستبعد", () => {
  const { recipients, missing } = meetingRecipients({ attendees: ["أمل", "رائد", "موقوف", "أمل"], organizer: "خالد" }, users);
  assert.deepEqual(recipients.map((r) => r.email), ["amal@x.com", "boss@x.com"]);
  assert.deepEqual(missing, ["رائد", "موقوف"]);
});

test("meetingRecipients: الحضور كنص JSON (عمود قديم)", () => {
  const { recipients } = meetingRecipients({ attendees: '["أمل"]' }, users);
  assert.deepEqual(recipients.map((r) => r.name), ["أمل"]);
});

test("dueReminder: أصغر فترة مستحقة، وتخطّي الفترات الأكبر التي فاتت", () => {
  const now = Date.parse("2026-11-03T10:00:00Z");
  const m = { status: "Scheduled", start_at: "2026-11-03T10:50:00Z", reminders: [1440, 60] };
  assert.deepEqual(dueReminder(m, now), { offset: 60, skip: [1440] });
  assert.equal(dueReminder({ ...m, reminders_sent: [60, 1440] }, now), null);
  assert.equal(dueReminder({ ...m, start_at: "2026-11-05T10:00:00Z" }, now), null); // لم يحن بعد
  assert.equal(dueReminder({ ...m, status: "Cancelled" }, now), null);
  assert.equal(dueReminder({ ...m, start_at: "2026-11-03T09:00:00Z" }, now), null); // مضى
  assert.equal(dueReminder({ ...m, notify_attendees: false }, now), null);
});

test("detectMeetingMail: دعوة / تحديث / إلغاء / لا شيء", () => {
  const a = { title: "x", status: "Scheduled", start_at: "2026-11-03T10:00:00Z", duration: 30, attendees: ["أمل"] };
  assert.equal(detectMeetingMail(null, a), "invite");
  assert.equal(detectMeetingMail(a, { ...a, start_at: "2026-11-04T10:00:00Z" }), "update");
  assert.equal(detectMeetingMail(a, { ...a, attendees: ["أمل", "خالد"] }), "update");
  assert.equal(detectMeetingMail(a, { ...a, status: "Cancelled" }), "cancel");
  assert.equal(detectMeetingMail(a, { ...a, agenda: "بند" }), null);
  assert.equal(detectMeetingMail(a, { ...a, status: "Done" }), null);
  assert.deepEqual(diffMeeting(a, { ...a, duration: 60, location: "https://meet" }), ["المدة", "المكان / الرابط"]);
});

test("buildIcs: دعوة صالحة بأسطر مطويّة لا تتجاوز 75 بايت", () => {
  const ics = buildIcs({ id: "m1", title: "مراجعة الحملة الإعلانية الشاملة لمشروع هوميرا العقاري الرقمي", start_at: "2026-11-03T10:00:00Z", duration: 45, agenda: "بند ١\nبند ٢" },
    { method: "REQUEST", recipients: [{ name: "أمل", email: "amal@x.com" }] });
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /DTSTART:20261103T100000Z/);
  assert.match(ics, /DTEND:20261103T104500Z/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const cancel = buildIcs({ id: "m1", title: "x", start_at: "2026-11-03T10:00:00Z" }, { method: "CANCEL" });
  assert.match(cancel, /STATUS:CANCELLED/);
  assert.doesNotMatch(cancel, /VALARM/);
});

test("buildMeetingMail: رسالة كاملة مع مرفق التقويم، وبلا مستلمين → null", () => {
  const m = { id: "m1", title: "اجتماع", start_at: "2026-11-03T10:00:00Z", attendees: ["أمل"], organizer: "خالد", location: "https://meet.google.com/x" };
  const { mail } = buildMeetingMail("invite", m, users, { appUrl: "https://app" });
  assert.deepEqual(mail.to, ["amal@x.com", "boss@x.com"]);
  assert.equal(mail.attachments[0].filename, "invite.ics");
  assert.match(mail.html, /الانضمام للاجتماع/);
  assert.match(mail.subject, /دعوة اجتماع/);
  assert.equal(buildMeetingMail("reminder", m, users).mail.attachments, undefined);
  assert.equal(buildMeetingMail("invite", { ...m, attendees: ["رائد"], organizer: "" }, users).mail, null);
  assert.equal(reminderLabel(60), "قبل ساعة");
});
