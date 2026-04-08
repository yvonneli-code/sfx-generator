"use client";

import { useState, useEffect, useRef } from "react";
import { SFXEvent, EventType, EVENT_COLORS } from "@/types";

interface Variation {
  id: string;
  sfx_url: string;
}

interface Props {
  events: SFXEvent[];
  selectedId: string | null;
  jobId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onPreview: (id: string) => void;
  onSetToCurrentTime: (id: string) => void;
  onUpdateDuration: (id: string, duration: number) => void;
  onUpdateName: (id: string, eventType: EventType) => void;
  onUpdateVolume: (id: string, volume: number) => void;
  onApplyExploration: (sfxId: string, exploreId: string, description: string) => Promise<void>;
  onApplyToSiblings: (sfxId: string, originalDescription: string) => Promise<number>;
}

export default function SFXEventList({
  events,
  selectedId,
  jobId,
  onSelect,
  onRemove,
  onPreview,
  onSetToCurrentTime,
  onUpdateDuration,
  onUpdateName,
  onUpdateVolume,
  onApplyExploration,
  onApplyToSiblings,
}: Props) {
  const [variations, setVariations] = useState<Record<string, Variation[]>>({});
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [genProgress, setGenProgress] = useState<Record<string, number>>({});
  const [editDescriptions, setEditDescriptions] = useState<Record<string, string>>({});
  const [genErrors, setGenErrors] = useState<Record<string, string>>({});
  // Track events that just had "Use" applied: sfxId → original description (before update)
  const [appliedOriginals, setAppliedOriginals] = useState<Record<string, string>>({});
  const [applyingSiblings, setApplyingSiblings] = useState<Set<string>>(new Set());
  const prevSelectedRef = useRef<string | null>(null);

  // Pre-fill description and clear variations when selection changes
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedRef.current) {
      const ev = events.find((e) => e.sfx_id === selectedId);
      if (ev && !(selectedId in editDescriptions)) {
        setEditDescriptions((prev) => ({ ...prev, [selectedId]: ev.description }));
      }
      // Clear previous selection's variations
      if (prevSelectedRef.current) {
        const prevId = prevSelectedRef.current;
        setVariations((prev) => { const n = { ...prev }; delete n[prevId]; return n; });
      }
      prevSelectedRef.current = selectedId;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function getEditDesc(ev: SFXEvent) {
    return editDescriptions[ev.sfx_id] ?? ev.description;
  }

  function stepDuration(ev: SFXEvent, delta: number) {
    const next = Math.round((ev.estimated_duration_seconds + delta) * 10) / 10;
    const clamped = Math.min(4.0, Math.max(0.3, next));
    onUpdateDuration(ev.sfx_id, clamped);
  }

  async function handleGenerate3(ev: SFXEvent) {
    const desc = getEditDesc(ev).trim();
    if (!desc) return;

    setGenerating((prev) => new Set(prev).add(ev.sfx_id));
    setGenProgress((prev) => ({ ...prev, [ev.sfx_id]: 0 }));
    setGenErrors((prev) => { const n = { ...prev }; delete n[ev.sfx_id]; return n; });
    // Clear previous variations
    setVariations((prev) => { const n = { ...prev }; delete n[ev.sfx_id]; return n; });

    const calls = Array.from({ length: 3 }, () =>
      fetch(`/api/explore-sfx/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, duration_seconds: ev.estimated_duration_seconds }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        const { explore_id, sfx_url } = await res.json();
        setGenProgress((prev) => ({ ...prev, [ev.sfx_id]: (prev[ev.sfx_id] ?? 0) + 1 }));
        return { id: explore_id, sfx_url } as Variation;
      })
    );

    const results = await Promise.allSettled(calls);
    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<Variation> => r.status === "fulfilled")
      .map((r) => r.value);
    const failCount = results.filter((r) => r.status === "rejected").length;

    if (succeeded.length > 0) {
      setVariations((prev) => ({ ...prev, [ev.sfx_id]: succeeded }));
    }
    if (failCount > 0 && succeeded.length === 0) {
      setGenErrors((prev) => ({ ...prev, [ev.sfx_id]: "All 3 generations failed. Try again." }));
    } else if (failCount > 0) {
      setGenErrors((prev) => ({ ...prev, [ev.sfx_id]: `${failCount} of 3 generations failed.` }));
    }

    setGenerating((prev) => { const n = new Set(prev); n.delete(ev.sfx_id); return n; });
    setGenProgress((prev) => { const n = { ...prev }; delete n[ev.sfx_id]; return n; });
  }

  async function handleUse(ev: SFXEvent, variation: Variation) {
    const desc = getEditDesc(ev).trim() || ev.description;
    const originalDesc = ev.description; // capture before update
    try {
      await onApplyExploration(ev.sfx_id, variation.id, desc);
      setVariations((prev) => { const n = { ...prev }; delete n[ev.sfx_id]; return n; });
      setEditDescriptions((prev) => ({ ...prev, [ev.sfx_id]: desc }));
      // Track that this event was just updated, with its original description
      setAppliedOriginals((prev) => ({ ...prev, [ev.sfx_id]: originalDesc }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply variation";
      setGenErrors((prev) => ({ ...prev, [ev.sfx_id]: msg }));
    }
  }

  async function handleApplySiblings(ev: SFXEvent) {
    const originalDesc = appliedOriginals[ev.sfx_id];
    if (!originalDesc) return;
    setApplyingSiblings((prev) => new Set(prev).add(ev.sfx_id));
    try {
      const count = await onApplyToSiblings(ev.sfx_id, originalDesc);
      // Clear the applied state after success
      setAppliedOriginals((prev) => { const n = { ...prev }; delete n[ev.sfx_id]; return n; });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply to siblings";
      setGenErrors((prev) => ({ ...prev, [ev.sfx_id]: msg }));
    } finally {
      setApplyingSiblings((prev) => { const n = new Set(prev); n.delete(ev.sfx_id); return n; });
    }
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
        const isGenerating = generating.has(ev.sfx_id);
        const progress = genProgress[ev.sfx_id] ?? 0;
        const evVariations = variations[ev.sfx_id] ?? [];

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
                  {ev.description}
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
              <div className="mt-3 space-y-0" onClick={(e) => e.stopPropagation()}>

                {/* ── Zone 1: Current Sound ── */}
                <div
                  className="rounded-lg p-3 space-y-3"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-sub)" }}>
                    Current Sound
                  </p>

                  {/* Description (read-only) */}
                  <p
                    className="text-xs leading-relaxed"
                    style={{
                      color: "var(--text-muted)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {ev.description}
                  </p>

                  {/* Controls */}
                  <div className="space-y-2">
                    {/* Name (event type) */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "var(--text-sub)" }}>Name</span>
                      <select
                        value={ev.event_type}
                        onChange={(e) => onUpdateName(ev.sfx_id, e.target.value as EventType)}
                        className="flex-1 text-xs rounded-md px-2 py-1 transition-colors"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          color: "var(--text)",
                          outline: "none",
                        }}
                      >
                        <optgroup label="Transition">
                          <option value="whoosh">Whoosh</option>
                          <option value="riser">Riser</option>
                          <option value="reverse_hit">Reverse Hit</option>
                        </optgroup>
                        <optgroup label="Emphasis">
                          <option value="stinger">Stinger</option>
                          <option value="ding">Ding</option>
                        </optgroup>
                        <optgroup label="UI / Graphics">
                          <option value="ui_pop">UI Pop</option>
                          <option value="ui_slide">UI Slide</option>
                        </optgroup>
                        <optgroup label="Foley">
                          <option value="impact">Impact</option>
                          <option value="footstep">Footstep</option>
                          <option value="door">Door</option>
                          <option value="button_click">Button Click</option>
                          <option value="body">Body</option>
                          <option value="environment">Environment</option>
                        </optgroup>
                        <optgroup label="Ambient">
                          <option value="ambient">Ambient</option>
                        </optgroup>
                        <optgroup label="Comedic">
                          <option value="meme_sfx">Meme SFX</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Volume slider */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "var(--text-sub)" }}>Volume</span>
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
                      <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "var(--text-sub)" }}>Duration</span>
                      <div
                        className="flex items-center gap-1 rounded-md px-1"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
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
                  </div>

                  {/* Actions row */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => onSetToCurrentTime(ev.sfx_id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-sub)",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-focus)";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-sub)";
                      }}
                    >
                      <ClockIcon />
                      Set to current time
                    </button>
                    <button
                      onClick={() => {
                        onUpdateDuration(ev.sfx_id, ev.estimated_duration_seconds);
                        onUpdateVolume(ev.sfx_id, ev.volume ?? 1.0);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-sub)",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-focus)";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.color = "var(--text-sub)";
                      }}
                    >
                      Update
                    </button>
                  </div>
                </div>

                {/* ── Zone 2: Try New Versions ── */}
                <div className="pt-3 space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-sub)" }}>
                    Try New Versions
                  </p>

                  {/* Editable textarea */}
                  <textarea
                    value={getEditDesc(ev)}
                    onChange={(e) => setEditDescriptions((prev) => ({ ...prev, [ev.sfx_id]: e.target.value }))}
                    rows={2}
                    placeholder="Describe a sound to try..."
                    className="w-full text-xs rounded-lg px-2.5 py-2 resize-none"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", outline: "none" }}
                    onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                  />

                  {/* Generate 3 Versions button */}
                  <button
                    onClick={() => handleGenerate3(ev)}
                    disabled={isGenerating || !getEditDesc(ev).trim()}
                    className="w-full py-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    style={{
                      background: isGenerating || !getEditDesc(ev).trim() ? "var(--surface-3)" : "var(--accent)",
                      color: isGenerating || !getEditDesc(ev).trim() ? "var(--text-sub)" : "#fff",
                      cursor: isGenerating || !getEditDesc(ev).trim() ? "not-allowed" : "pointer",
                      border: "none",
                    }}
                    onMouseEnter={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)"; }}
                    onMouseLeave={e => { if (!e.currentTarget.disabled) (e.currentTarget as HTMLElement).style.background = "var(--accent)"; }}
                  >
                    {isGenerating ? (
                      <><SpinnerIcon /> Generating {progress}/3...</>
                    ) : (
                      <>Generate 3 Versions</>
                    )}
                  </button>

                  {/* Error */}
                  {genErrors[ev.sfx_id] && (
                    <p className="text-[11px]" style={{ color: "var(--danger)" }}>{genErrors[ev.sfx_id]}</p>
                  )}

                  {/* Variation rows */}
                  {evVariations.length > 0 && (
                    <div
                      className="rounded-lg overflow-hidden"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      {evVariations.map((v, i) => (
                        <div
                          key={v.id}
                          className="flex items-center gap-2.5 px-3 py-2.5"
                          style={{
                            background: "var(--bg)",
                            borderTop: i > 0 ? "1px solid var(--border)" : "none",
                          }}
                        >
                          <button
                            title="Preview"
                            onClick={() => { new Audio(`/api${v.sfx_url}`).play(); }}
                            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors flex-shrink-0"
                            style={{ color: "var(--text-sub)", background: "var(--surface)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-sub)"; (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
                          >
                            <PlaySmallIcon />
                          </button>
                          <span className="text-xs flex-1 font-medium" style={{ color: "var(--text-muted)" }}>
                            Version {i + 1}
                          </span>
                          <button
                            onClick={() => handleUse(ev, v)}
                            className="text-[11px] font-semibold px-3 py-1 rounded-md transition-colors"
                            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                          >Use</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Apply to similar sounds */}
                  {appliedOriginals[ev.sfx_id] && (() => {
                    const originalDesc = appliedOriginals[ev.sfx_id];
                    const siblingCount = events.filter(e => e.sfx_id !== ev.sfx_id && e.description === originalDesc).length;
                    if (siblingCount === 0) return null;
                    return (
                      <button
                        onClick={() => handleApplySiblings(ev)}
                        disabled={applyingSiblings.has(ev.sfx_id)}
                        className="w-full py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border)",
                          color: applyingSiblings.has(ev.sfx_id) ? "var(--text-sub)" : "var(--text-muted)",
                          cursor: applyingSiblings.has(ev.sfx_id) ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={e => { if (!e.currentTarget.disabled) { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; } }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                      >
                        {applyingSiblings.has(ev.sfx_id) ? (
                          <><SpinnerIcon /> Applying...</>
                        ) : (
                          <>Apply to {siblingCount} similar sound{siblingCount > 1 ? "s" : ""}</>
                        )}
                      </button>
                    );
                  })()}
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
