"use client";

import { useState } from "react";

interface StyleOption {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const STYLES: StyleOption[] = [
  { key: "auto", label: "Auto-Detect", description: "AI picks the best style", icon: "\u2728" },
  { key: "skit", label: "Skit / Meme", description: "Punchy, exaggerated, comedic", icon: "\uD83C\uDFAD" },
  { key: "tutorial", label: "Tutorial", description: "Clean pops, subtle transitions", icon: "\uD83D\uDCBB" },
  { key: "cinematic", label: "Cinematic", description: "Heavy, atmospheric, dramatic", icon: "\uD83C\uDFAC" },
  { key: "talking_head", label: "Talking Head", description: "Minimal, jump-cut-friendly", icon: "\uD83C\uDF99\uFE0F" },
  { key: "lifestyle", label: "Lifestyle", description: "Organic, warm, satisfying", icon: "\uD83C\uDF3F" },
];

interface Props {
  onConfirm: (style: string) => void;
}

export default function StyleSelector({ onConfirm }: Props) {
  const [selected, setSelected] = useState("auto");

  return (
    <div
      className="rounded-2xl p-6 space-y-5"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Choose a sound style
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          This guides the AI on which sounds to prioritize
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {STYLES.map((s) => {
          const isSelected = selected === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSelected(s.key)}
              className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-center transition-all duration-150 cursor-pointer"
              style={{
                background: isSelected ? "var(--accent-subtle)" : "var(--surface-2)",
                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = "var(--border-focus)";
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <span className="text-lg">{s.icon}</span>
              <span
                className="text-xs font-medium"
                style={{ color: isSelected ? "var(--accent)" : "var(--text)" }}
              >
                {s.label}
              </span>
              <span
                className="text-[10px] leading-tight"
                style={{ color: "var(--text-sub)" }}
              >
                {s.description}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onConfirm(selected)}
        className="w-full py-2.5 rounded-xl text-xs font-semibold text-white transition-colors"
        style={{ background: "var(--accent)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
      >
        Continue
      </button>
    </div>
  );
}
