"use client";

// اختيار متعدد على شكل شارات (chips)
export default function ChipMulti({ options, value, onChange, empty }) {
  const val = Array.isArray(value) ? value : [];
  const toggle = (name) =>
    onChange(val.includes(name) ? val.filter((x) => x !== name) : [...val, name]);
  return (
    <div className="attendee-picker">
      {options.length === 0 ? (
        <span className="muted" style={{ fontSize: 12.5 }}>{empty || "لا خيارات"}</span>
      ) : (
        options.map((o) => {
          const name = o.name || o;
          return (
            <span key={o.id || name} className={`att-chip ${val.includes(name) ? "on" : ""}`} onClick={() => toggle(name)}>
              {name}
            </span>
          );
        })
      )}
    </div>
  );
}
