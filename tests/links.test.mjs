import { test } from "node:test";
import assert from "node:assert/strict";
import { toHref, firstUrl, splitLinks } from "../lib/links.mjs";

test("رابط بدون https يُفتح خارج النظام", () => {
  assert.equal(toHref("meet.google.com/xsg-tatr-yez"), "https://meet.google.com/xsg-tatr-yez");
  assert.equal(toHref("https://zoom.us/j/1"), "https://zoom.us/j/1");
  assert.equal(toHref("مكتب الإدارة"), "");
});

test("استخراج رابط الاجتماع من حقل المكان", () => {
  assert.equal(firstUrl("Google Meet: https://meet.google.com/xsg-tatr-yez"), "https://meet.google.com/xsg-tatr-yez");
  assert.equal(firstUrl("meet.google.com/xsg-tatr-yez"), "https://meet.google.com/xsg-tatr-yez");
  assert.equal(firstUrl("مكتب الرياض"), "");
});

test("الروابط داخل رسالة الشات تصير قابلة للضغط", () => {
  const parts = splitLinks("رابط مكالمة الفيديو: https://meet.google.com/xsg-tatr-yez.");
  assert.deepEqual(parts, [
    { text: "رابط مكالمة الفيديو: " },
    { text: "https://meet.google.com/xsg-tatr-yez", href: "https://meet.google.com/xsg-tatr-yez" },
    { text: "." },
  ]);
  assert.deepEqual(splitLinks("بدون روابط هنا"), [{ text: "بدون روابط هنا" }]);
  assert.equal(splitLinks("شوف www.vuletmedia.com")[1].href, "https://www.vuletmedia.com");
});
