"use client";

import { useState } from "react";
import { SFXEvent, EventType, EVENT_COLORS } from "@/types";

const ALL_EVENT_TYPES: EventType[] = [
  "impact", "footstep", "door", "explosion", "whoosh", "creak",
  "glass_break", "water_splash", "button_click", "slide",
  "crowd_reaction", "animal", "vehicle", "wind", "fire",
];

interface Props {
  events: SFXEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  onRegenerate: (id: string, description: string) => Promise<void>;
  onSetToCurrentTime: (id: string) => void;
  onUpdateDuration: (id: string, duration: number) => void;
  onUpdateName: (id: string, eventType: EventType) => void;
  onUpdateVolume: (id: string, volume: number) => void;
}

export default function SFXEventList({
  events,
  selectedId,
  onSelect,
  onRemove,
  onPreview,
  onRegenerate,
  onSetToCurrentTime,
  onUpdateDuration,
  onUpdateName,
  onUpdateVolume,
}: Props) {
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [regenErrors, setRegenErrors] = useState<Record<string, string>>({});

  function getDescription(ev: SFXEvent) {
    return descriptions[ev.sfx_id] ?? ev.description;
  }

  async function handleRegenerate(ev: SFXEvent) {
    const desc = getDescription(ev);
    setRegenerating((prev) => new Set(prev).add(ev.sfx_id));
    setRegenErrors((prev) => { const n = { ...prev }; delete n[ev.sfx_id]; return n; });
    try {
      await onRegenerate(ev.sfx_id, desc);
      setDescriptions((prev) => { const n = { ...prev }; delete n[ev.sfx_id]; return n; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Regeneration failed";
      setRegenErrors((prev) => ({ ...prev, [ev.sfx_id]: msg }));
    } finally {
      setRegenerating((prev) => { const n = new Set(prev); n.delete(ev.sfx_id); return n; });
    }
  }

  function stepDuration(ev: SFXEvent, delta: number) {
    const next = Math.round((ev.estimated_duration_seconds + delta) * 10) / 10;
    const clamped = Math.min(4.0, Math.max(0.3, next));
    onUpdateDuration(ev.sfx_id, clamped);
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>No sound effects</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {events.map((ev) => {
        const color = EVENT_COLORS[ev.event_type] ?? "#6366f1";
        const isSelected = ev.sfx_id === selectedId;
        const isRegenerating = regenerating.has(ev.sfx_id);

        return (
          <li
            key={ev.sfx_id}
            onClick={() => onSelect(ev.sfx_id)}
            className="rounded-lg cursor-pointer transition-all duration-100"
            style={{
              background: isSelected ? "var(--surface-2)" : "var(--surface)",
              border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
              padding: "10px 12px",
            }}
          >
            {/* Header row */}
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color }}
                  >
                    {ev.event_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--text-sub)" }}>
                    {ev.timestamp_seconds.toFixed(1)}s · {ev.estimated_duration_seconds.toFixed(1)}s
                  </span>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                  {getDescription(ev)}
                </p>
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  title="Preview"
                  onClick={(e) => { e.stopPropagation(); onPreview(ev.sfx_id); }}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text)";
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <PlayIcon />
                </button>
                <button
                  title="Remove"
                  onClick={(e) => { e.stopPropagation(); onRemove(ev.sfx_id); }}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = "var(--danger)";
                    (e.currentTarget as HTMLElement).style.background = "var(--danger-subtle)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <RemoveIcon />
                </button>
              </div>
            </div>

            {/* Expanded controls when selected */}
            {isSelected && (
              <div className="mt-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                {/* Divider */}
                <div style={{ height: 1, background: "var(--border)" }} />

                {/* Description */}
                <textarea
                  value={getDescription(ev)}
                  onChange={(e) => setDescriptions((prev) => ({ ...prev, [ev.sfx_id]: e.target.value }))}
                  rows={2}
                  className="w-full text-xs rounded-md px-2.5 py-2 resize-none transition-colors"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    outline: "none",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                  placeholder="Describe the sound effect..."
                />

                {/* Name (event type) */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "var(--text-muted)" }}>Name</span>
                  <select
                    value={ev.event_type}
                    onChange={(e) => onUpdateName(ev.sfx_id, e.target.value as EventType)}
                    className="flex-1 text-xs rounded-md px-2 py-1 transition-colors"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      outline: "none",
                    }}
                  >
                    {ALL_EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>

                {/* Volume slider */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "var(--text-muted)" }}>Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={Math.round((ev.volume ?? 1.0) * 100)}
                    onChange={(e) => onUpdateVolume(ev.sfx_id, parseInt(e.target.value) / 100)}
                    className="flex-1"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-xs tabular-nums w-8 text-right" style={{ color: "var(--text)" }}>
                    {Math.round((ev.volume ?? 1.0) * 100)}%
                  </span>
                </div>

                {/* Duration stepper */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "var(--text-muted)" }}>Duration</span>
                  <div
                    className="flex items-center gap-1 rounded-md px-1"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    <button
                      onClick={() => stepDuration(ev, -0.1)}
                      disabled={ev.estimated_duration_seconds <= 0.3}
                      className="px-1.5 py-0.5 text-xs transition-colors disabled:opacity-30"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                    >−</button>
                    <span className="text-xs tabular-nums w-8 text-center" style={{ color: "var(--text)" }}>
                      {ev.estimated_duration_seconds.toFixed(1)}s
                    </span>
                    <button
                      onClick={() => stepDuration(ev, 0.1)}
                      disabled={ev.estimated_duration_seconds >= 4.0}
                      className="px-1.5 py-0.5 text-xs transition-colors disabled:opacity-30"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                    >+</button>
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--text-sub)" }}>0.3 – 4.0s</span>
                </div>

                {/* Regen error */}
                {regenErrors[ev.sfx_id] && (
                  <p className="text-xs break-words" style={{ color: "var(--danger)" }}>
                    {regenErrors[ev.sfx_id]}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onSetToCurrentTime(ev.sfx_id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border-focus)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                    }}
                  >
                    <ClockIcon />
                    Set to current time
                  </button>
                  <button
                    onClick={() => handleRegenerate(ev)}
                    disabled={isRegenerating}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: "var(--accent)",
                      color: "#fff",
                    }}
                    onMouseEnter={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)"; }}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--accent)"}
                  >
                    {isRegenerating ? <SpinnerIcon /> : <RegenerateIcon />}
                    {isRegenerating ? "Generating…" : "Regenerate"}
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}

function RegenerateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 .49-4.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function PlaySmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  );
}

export { PlaySmallIcon };
