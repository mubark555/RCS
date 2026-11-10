"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Icon from "@/components/Icon";
import { useAmalEnabled, readAmalPrefs, writeAmalPrefs, AMAL_SIZES, AMAL_PLACES, AMAL_VOICES } from "@/lib/amalPref";

// «تخصيص أمل»: كل موظف يضبط أمل على راحته (التفعيل، الشكل، الحجم، المكان، الصوت، التنبيهات)
export default function AmalSettings({ onClose }) {
  const [on, setOn] = useAmalEnabled();
  const [p, setP] = useState(null);

  useEffect(() => { setP(readAmalPrefs()); }, []);
  const set = (patch) => { setP((s) => ({ ...s, ...patch })); writeAmalPrefs(patch); };

  if (!p) return null;
  return (
    <Modal title="تخصيص أمل" onClose={onClose}>
      <div className="amal-set">
        <Row title="تفعيل أمل" sub="المساعدة الذكية تظهر لك في كل صفحات النظام">
          <Switch checked={on} onChange={setOn} label="تفعيل أمل" />
        </Row>

        <fieldset disabled={!on} className={on ? "" : "off"}>
          <Row title="طريقة الظهور">
            <Seg value={p.mini ? "mini" : "full"} options={{ full: "الشخصية كاملة", mini: "أيقونة صغيرة" }} onChange={(v) => set({ mini: v === "mini" })} />
          </Row>
          {!p.mini && (
            <Row title="الحجم">
              <Seg value={p.size} options={AMAL_SIZES} onChange={(v) => set({ size: v })} />
            </Row>
          )}
          <Row title="المكان" sub={p.pos ? "مكانها الحالي من السحب — اختر مكاناً لإرجاعها إليه" : "تقدر تسحبها بعدين لأي مكان"}>
            <Seg value={p.pos ? "" : p.place} options={AMAL_PLACES} onChange={(v) => set({ place: v, pos: null })} />
          </Row>
          <Row title="الصوت">
            <Seg value={p.voice} options={AMAL_VOICES} onChange={(v) => set({ voice: v })} />
          </Row>
          <Row title="الترحيب عند الدخول" sub="تحيّيك أول ما تفتح النظام">
            <Switch checked={!p.greetOff} onChange={(v) => set({ greetOff: !v })} label="الترحيب عند الدخول" />
          </Row>
          <Row title="ملخص الصفحات («الزبدة»)" sub="تلخّص لك أهم ما في كل صفحة تفتحها">
            <Switch checked={!p.tipsOff} onChange={(v) => set({ tipsOff: !v })} label="ملخص الصفحات" />
          </Row>
          <Row title="الجولة التعريفية" sub="تشرح لك أقسام النظام خطوة بخطوة">
            <button type="button" className="btn sm" onClick={() => { onClose(); setTimeout(() => window.dispatchEvent(new CustomEvent("amal:tour", { detail: { kind: "full" } })), 300); }}>
              <Icon name="play" size={13} /> ابدأ الجولة
            </button>
          </Row>
        </fieldset>
        {!on && <p className="muted" style={{ fontSize: 12, margin: 0 }}>فعّل أمل أولاً حتى تقدر تخصّصها.</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={onClose}>تم</button>
      </div>
    </Modal>
  );
}

function Row({ title, sub, children }) {
  return (
    <div className="amal-set-row">
      <div><b>{title}</b>{sub && <small>{sub}</small>}</div>
      {children}
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {Object.entries(options).map(([k, ar]) => (
        <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => onChange(k)}>{ar}</button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <span className={`switch ${checked ? "on" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <i />
    </span>
  );
}
