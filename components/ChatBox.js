"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { chatStore, notificationsStore, COMMENT_MAX_BYTES } from "@/lib/store";
import { isCloud } from "@/lib/supabase";
import { useRole } from "@/components/RoleProvider";
import { useNotifications } from "@/components/NotificationsProvider";
import { useChat } from "@/components/ChatProvider";
import { findMentions, splitMentions } from "@/lib/chat";

const ROLE_LABEL = { manager: "إدارة", member: "فريق", client: "عميل" };

function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// صندوق محادثة لأي قناة (عام / مشروع / مهمة): رسائل + مرفقات + إشارات @ + تحديث فوري
// label: اسم المحادثة في التنبيهات · link: مسار فتحها من البريد
// closed: مقفلة للقراءة فقط (مع lockNote) · notice: تنبيه أعلى صندوق الكتابة
export default function ChatBox({ channel, label, link, onCount, closed = false, lockNote = "", notice = "", emptyText = "لا رسائل بعد — ابدأ المحادثة.", tall = false }) {
  const { viewer, role, canManage, users, can } = useRole();
  const { sendEmail } = useNotifications();
  const chat = useChat();
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [mq, setMq] = useState(null); // نص البحث بعد @ أثناء الكتابة
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const canWrite = can("chat", "edit") && !closed;
  const me = viewer?.name;

  const load = useCallback(async () => {
    try {
      setItems(await chatStore.list(channel));
    } catch {
      setItems((s) => s || []);
    }
  }, [channel]);

  useEffect(() => {
    setItems(null);
    load();
    return chatStore.subscribe(channel, load);
  }, [channel, load]);

  useEffect(() => {
    if (onCount) onCount(items ? items.length : 0);
  }, [items, onCount]);

  // فتح المحادثة = قراءتها
  const { markRead } = chat;
  useEffect(() => {
    if (items) markRead(channel);
  }, [items, channel, markRead]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const people = useMemo(() => (users || []).filter((u) => u.name && u.name !== me && u.status !== "suspended"), [users, me]);
  const names = useMemo(() => (users || []).map((u) => u.name), [users]);
  const suggestions = useMemo(() => {
    if (mq === null) return [];
    const q = mq.trim();
    return people.filter((u) => !q || u.name.includes(q)).slice(0, 6);
  }, [mq, people]);

  function addFiles(list) {
    const arr = Array.from(list || []);
    const big = arr.find((f) => f.size > COMMENT_MAX_BYTES);
    if (big) {
      setError(`"${big.name}" أكبر من الحد المسموح (${fmtSize(COMMENT_MAX_BYTES)})`);
      return;
    }
    setError("");
    setFiles((s) => [...s, ...arr]);
  }

  function onType(e) {
    const v = e.target.value;
    setText(v);
    const before = v.slice(0, e.target.selectionStart);
    const m = before.match(/(^|\s)@([^\s@]{0,20})$/);
    setMq(m ? m[2] : null);
  }

  function pickMention(u) {
    const el = inputRef.current;
    const pos = el ? el.selectionStart : text.length;
    const before = text.slice(0, pos).replace(/@([^\s@]{0,20})$/, `@${u.name} `);
    const next = before + text.slice(pos);
    setText(next);
    setMq(null);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(before.length, before.length); } });
  }

  // من أُشير إليه: تنبيه في الجرس + بريد مباشر
  async function notifyMentions(body) {
    const tagged = findMentions(body, people);
    if (!tagged.length) return;
    const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    const title = `${me} أشار إليك في ${label}`;
    notificationsStore.send(tagged.map((u) => u.id), { kind: "mention", entity: "محادثة", title, body: snippet, read: false }).catch(() => {});
    const emails = tagged.map((u) => (u.email || "").trim()).filter((e) => e.includes("@"));
    let note = `تم تنبيه: ${tagged.map((u) => u.name).join("، ")}`;
    if (emails.length && isCloud) {
      const r = await sendEmail({ to: emails, subject: title, body: `${title}:\n\n«${body}»\n\nافتح المحادثة للرد.`, path: link || "/chat" });
      note += r?.ok ? " (بالبريد أيضاً)" : ` — تعذّر إرسال البريد: ${r?.error || ""}`;
    }
    setSentTo(note);
  }

  async function send() {
    if (sending || !canWrite || (!text.trim() && files.length === 0)) return;
    setSending(true);
    setError("");
    setSentTo("");
    const body = text.trim();
    try {
      const rec = await chatStore.create({ channel, author: me || "مستخدم", author_role: role, body, files });
      setItems((s) => (s && !s.some((x) => x.id === rec.id) ? [...s, rec] : s));
      setText("");
      setFiles([]);
      setMq(null);
      if (!isCloud) window.dispatchEvent(new Event("chat:local"));
      if (body.includes("@")) notifyMentions(body).catch(() => {});
    } catch (e) {
      setError(e?.message || "تعذّر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }

  async function remove(c) {
    if (!confirm("حذف هذه الرسالة؟")) return;
    try {
      await chatStore.remove(c);
      setItems((s) => (s || []).filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e?.message || "تعذّر الحذف");
    }
  }

  function onKeyDown(e) {
    if (suggestions.length && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      pickMention(suggestions[0]);
      return;
    }
    if (e.key === "Escape" && mq !== null) { setMq(null); return; }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function onPaste(e) {
    const pasted = Array.from(e.clipboardData?.files || []);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  }

  return (
    <div className={`chat${tall ? " chat-tall" : ""}`}>
      <div className="chat-list" ref={listRef}>
        {items === null ? (
          <span className="muted">جارٍ التحميل…</span>
        ) : items.length === 0 ? (
          <div className="chat-empty">
            <Icon name="chat" size={26} />
            <span>{emptyText}</span>
          </div>
        ) : (
          items.map((c) => {
            const mine = me && c.author === me;
            return (
              <div className={`chat-msg${mine ? " mine" : ""}`} key={c.id}>
                <div className="chat-meta">
                  <b>{c.author || "—"}</b>
                  {c.author_role && <span className={`chat-role r-${c.author_role}`}>{ROLE_LABEL[c.author_role] || c.author_role}</span>}
                  <small>{fmtTime(c.created_at)}</small>
                  {(mine || canManage) && !closed && (
                    <button className="chat-del" type="button" onClick={() => remove(c)} title="حذف">
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
                <div className="chat-bubble">
                  {c.body && (
                    <div className="chat-text">
                      {splitMentions(c.body, names).map((p, i) => (p.mention ? <span key={i} className={`chat-mention${p.text === `@${me}` ? " me" : ""}`}>{p.text}</span> : p.text))}
                    </div>
                  )}
                  {(c.attachments || []).length > 0 && (
                    <div className="chat-atts">
                      {c.attachments.map((a, i) => <Attachment key={i} a={a} />)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {closed ? (
        <div className="chat-locked"><Icon name="lock" size={15} /> {lockNote || "المحادثة مقفلة."}</div>
      ) : !canWrite ? (
        <div className="chat-locked"><Icon name="eye" size={15} /> صلاحيتك على المحادثات اطلاع فقط.</div>
      ) : (
        <div className="chat-compose">
          {notice && <div className="chat-notice"><Icon name="clock" size={14} /> {notice}</div>}
          {files.length > 0 && (
            <div className="chat-pending">
              {files.map((f, i) => (
                <span className="chat-chip" key={i}>
                  <Icon name="clip" size={13} />
                  <span className="nm">{f.name}</span>
                  <small>{fmtSize(f.size)}</small>
                  <button type="button" onClick={() => setFiles((s) => s.filter((_, j) => j !== i))} title="إزالة">
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="chat-mentions" role="listbox" aria-label="الإشارة إلى شخص">
              {suggestions.map((u) => (
                <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}>
                  <span className="av">{u.name.slice(0, 1)}</span>
                  <b>{u.name}</b>
                  <small>{u.title || ROLE_LABEL[u.role] || ""}</small>
                </button>
              ))}
            </div>
          )}
          <div className="chat-row">
            <button className="btn ghost chat-icon-btn" type="button" onClick={() => fileRef.current?.click()} title="إرفاق ملف">
              <Icon name="clip" size={17} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="اكتب رسالة… (@ للإشارة لشخص، Enter للإرسال، Shift+Enter لسطر جديد)"
              value={text}
              onChange={onType}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => setTimeout(() => setMq(null), 150)}
            />
            <button
              className="btn primary chat-icon-btn"
              type="button"
              onClick={send}
              disabled={sending || (!text.trim() && files.length === 0)}
              title="إرسال"
            >
              <Icon name="send" size={17} />
            </button>
          </div>
          {error && <div className="chat-error">{error}</div>}
          {sentTo && <div className="chat-sent">{sentTo}</div>}
        </div>
      )}
    </div>
  );
}

function Attachment({ a }) {
  const [url, setUrl] = useState(a.data_url || "");
  const isImg = (a.mime || "").startsWith("image/");

  useEffect(() => {
    if (!url && isImg) chatStore.attachmentUrl(a).then(setUrl).catch(() => {});
  }, [a, url, isImg]);

  async function open(e) {
    e.preventDefault();
    try {
      const u = url || (await chatStore.attachmentUrl(a));
      const link = document.createElement("a");
      link.href = u;
      link.target = "_blank";
      link.rel = "noreferrer";
      if (u.startsWith("data:")) link.download = a.name;
      link.click();
    } catch {}
  }

  if (isImg && url) {
    return (
      <a href={url} onClick={open} className="chat-img" title={a.name}>
        <img src={url} alt={a.name} />
      </a>
    );
  }
  return (
    <a href={url || "#"} onClick={open} className="chat-file" title="فتح / تنزيل">
      <Icon name="file" size={15} />
      <span className="nm">{a.name}</span>
      <small>{fmtSize(a.size)}</small>
    </a>
  );
}
