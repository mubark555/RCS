"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { commentsStore, COMMENT_MAX_BYTES } from "@/lib/store";
import { useRole } from "@/components/RoleProvider";

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

// شات الملاحظات أسفل كل مهمة: رسائل نصية + مرفقات، متاح لكل الأدوار (بما فيها العميل)
export default function TaskChat({ taskId, onCount }) {
  const { viewer, role, canManage } = useRole();
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setItems(await commentsStore.list(taskId));
    } catch {
      setItems((s) => s || []);
    }
  }, [taskId]);

  useEffect(() => {
    setItems(null);
    load();
    return commentsStore.subscribe(taskId, load);
  }, [taskId, load]);

  useEffect(() => {
    if (onCount) onCount(items ? items.length : 0);
  }, [items, onCount]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

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

  async function send() {
    if (sending || (!text.trim() && files.length === 0)) return;
    setSending(true);
    setError("");
    try {
      const rec = await commentsStore.create({
        task_id: taskId,
        author: viewer?.name || "مستخدم",
        author_role: role,
        body: text.trim(),
        files,
      });
      setItems((s) => (s && !s.some((x) => x.id === rec.id) ? [...s, rec] : s));
      setText("");
      setFiles([]);
    } catch (e) {
      setError(e?.message || "تعذّر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }

  async function remove(c) {
    if (!confirm("حذف هذه الرسالة؟")) return;
    try {
      await commentsStore.remove(c);
      setItems((s) => (s || []).filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e?.message || "تعذّر الحذف");
    }
  }

  function onKeyDown(e) {
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

  const me = viewer?.name;

  return (
    <div className="chat">
      <div className="chat-list" ref={listRef}>
        {items === null ? (
          <span className="muted">جارٍ التحميل…</span>
        ) : items.length === 0 ? (
          <div className="chat-empty">
            <Icon name="chat" size={26} />
            <span>لا ملاحظات بعد — ابدأ المحادثة حول هذه المهمة.</span>
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
                  {(mine || canManage) && (
                    <button className="chat-del" type="button" onClick={() => remove(c)} title="حذف">
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
                <div className="chat-bubble">
                  {c.body && <div className="chat-text">{c.body}</div>}
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

      <div className="chat-compose">
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
            rows={1}
            placeholder="اكتب ملاحظة… (Enter للإرسال، Shift+Enter لسطر جديد)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
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
      </div>
    </div>
  );
}

function Attachment({ a }) {
  const [url, setUrl] = useState(a.data_url || "");
  const isImg = (a.mime || "").startsWith("image/");

  useEffect(() => {
    if (!url && isImg) commentsStore.attachmentUrl(a).then(setUrl).catch(() => {});
  }, [a, url, isImg]);

  async function open(e) {
    e.preventDefault();
    try {
      const u = url || (await commentsStore.attachmentUrl(a));
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
