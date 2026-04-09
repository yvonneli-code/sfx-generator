"use client";

import { use, useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { SFXEvent, EventType } from "@/types";
import VideoPlayer from "@/components/VideoPlayer";
import SFXEventList from "@/components/SFXEventList";
import { useWebAudio } from "@/hooks/useWebAudio";

const EVENT_TYPES: EventType[] = [
  "whoosh", "riser", "reverse_hit",
  "stinger", "ding",
  "ui_pop", "ui_slide",
  "impact", "footstep", "door", "button_click", "body", "environment",
  "ambient",
  "meme_sfx",
];

const SFXTimeline = dynamic(() => import("@/components/SFXTimeline"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl p-4 h-28 animate-pulse" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} />
  ),
});

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default function ReviewPage({ params }: PageProps) {
  const { jobId } = use(params);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [events, setEvents] = useState<SFXEvent[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = sessionStorage.getItem(`sfx-events-${jobId}`);
    return stored ? (JSON.parse(stored) as SFXEvent[]) : [];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);


  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    description: "",
    event_type: "environment" as EventType,
    timestamp: "0.0",
    duration: "1.0",
  });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const videoSrc = `/api/video/${jobId}`;
  const { previewSFX } = useWebAudio({ events, videoRef });


  const handleRemove = useCallback((id: string) => {
    setEvents((prev) => {
      const updated = prev.filter((e) => e.sfx_id !== id);
      sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(updated));
      return updated;
    });
    if (selectedId === id) setSelectedId(null);
  }, [jobId, selectedId]);

  const handleUpdateTimestamp = useCallback((id: string, ts: number) => {
    setEvents((prev) => {
      const updated = prev.map((e) =>
        e.sfx_id === id ? { ...e, timestamp_seconds: parseFloat(ts.toFixed(2)) } : e
      );
      sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(updated));
      return updated;
    });
  }, [jobId]);

  const handleUpdateDuration = useCallback((id: string, duration: number) => {
    setEvents((prev) => {
      const updated = prev.map((e) =>
        e.sfx_id === id ? { ...e, estimated_duration_seconds: duration } : e
      );
      sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(updated));
      return updated;
    });
  }, [jobId]);

  const handleUpdateName = useCallback((id: string, eventType: EventType) => {
    setEvents((prev) => {
      const updated = prev.map((e) =>
        e.sfx_id === id ? { ...e, event_type: eventType } : e
      );
      sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(updated));
      return updated;
    });
  }, [jobId]);

  const handleUpdateVolume = useCallback((id: string, volume: number) => {
    setEvents((prev) => {
      const updated = prev.map((e) =>
        e.sfx_id === id ? { ...e, volume } : e
      );
      sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(updated));
      return updated;
    });
  }, [jobId]);

  const handleApplyExploration = useCallback(async (sfxId: string, exploreId: string, description: string) => {
    const res = await fetch(`/api/apply-exploration/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_sfx_id: sfxId, explore_id: exploreId, description }),
    });
    if (!res.ok) throw new Error(await res.text());
    const cleanUrl = `/sfx/${jobId}/${sfxId}`;
    setEvents((prev) => {
      const forStorage = prev.map((e) =>
        e.sfx_id === sfxId ? { ...e, description, sfx_url: cleanUrl } : e
      );
      sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(forStorage));
      return forStorage.map((e) =>
        e.sfx_id === sfxId ? { ...e, sfx_url: `${cleanUrl}?t=${Date.now()}` } : e
      );
    });
  }, [jobId]);

  const handleApplyToSiblings = useCallback(async (sfxId: string, originalDescription: string) => {
    const sourceEvent = events.find(e => e.sfx_id === sfxId);
    if (!sourceEvent) return 0;

    const siblings = events.filter(e => e.sfx_id !== sfxId && e.description === originalDescription);
    if (siblings.length === 0) return 0;

    // Copy the source event's audio to each sibling
    await Promise.all(siblings.map(sib =>
      fetch(`/api/copy-sfx/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_sfx_id: sfxId, target_sfx_id: sib.sfx_id }),
      })
    ));

    // Update all siblings' description and sfx_url in state
    const siblingIds = new Set(siblings.map(s => s.sfx_id));
    const now = Date.now();
    const newDesc = sourceEvent.description;
    setEvents((prev) => {
      const forStorage = prev.map((e) =>
        siblingIds.has(e.sfx_id) ? { ...e, description: newDesc, sfx_url: `/sfx/${jobId}/${e.sfx_id}` } : e
      );
      sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(forStorage));
      return forStorage.map((e) =>
        siblingIds.has(e.sfx_id) ? { ...e, sfx_url: `/sfx/${jobId}/${e.sfx_id}?t=${now}` } : e
      );
    });

    return siblings.length;
  }, [jobId, events]);

  const handleSetToCurrentTime = useCallback((id: string) => {
    const currentTime = videoRef.current?.currentTime ?? 0;
    handleUpdateTimestamp(id, parseFloat(currentTime.toFixed(2)));
  }, [videoRef, handleUpdateTimestamp]);

  const handleOpenAddForm = useCallback(() => {
    const currentTime = videoRef.current?.currentTime ?? 0;
    setAddForm((prev) => ({ ...prev, timestamp: currentTime.toFixed(1) }));
    setAddError(null);
    setShowAddForm(true);
  }, [videoRef]);

  const handleAddSfx = useCallback(async () => {
    const ts = parseFloat(addForm.timestamp);
    const dur = parseFloat(addForm.duration);
    if (!addForm.description.trim()) { setAddError("Description is required."); return; }
    if (isNaN(ts) || ts < 0) { setAddError("Invalid timestamp."); return; }
    if (isNaN(dur) || dur < 0.3 || dur > 4.0) { setAddError("Duration must be 0.3 – 4.0s."); return; }

    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/add-sfx/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: addForm.description.trim(),
          duration_seconds: dur,
          timestamp_seconds: ts,
          event_type: addForm.event_type,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newEvent: SFXEvent = await res.json();
      setEvents((prev) => {
        const updated = [...prev, newEvent].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
        sessionStorage.setItem(`sfx-events-${jobId}`, JSON.stringify(updated));
        return updated;
      });
      setShowAddForm(false);
      setAddForm({ description: "", event_type: "impact", timestamp: "0.0", duration: "1.0" });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to generate SFX.");
    } finally {
      setAdding(false);
    }
  }, [jobId, addForm]);

  const handleSaveProject = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/save-project/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${jobId}.sfxproject`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/export/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { download_url } = await res.json();
      window.location.href = `/api${download_url}`;
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-5 h-12"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>
          <div style={{ width: 1, height: 16, background: "var(--border)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>Review Sound Effects</span>
          <span
            className="text-[11px] px-1.5 py-0.5 rounded-md font-medium tabular-nums"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
          >
            {events.length} SFX
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveProject}
            disabled={saving || events.length === 0}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: saving || events.length === 0 ? "var(--text-sub)" : "var(--text-muted)",
              cursor: saving || events.length === 0 ? "not-allowed" : "pointer",
            }}
            onMouseEnter={e => { if (!saving && events.length > 0) e.currentTarget.style.borderColor = "var(--border-focus)"; }}
            onMouseLeave={e => { (e.currentTarget.style.borderColor = "var(--border)"); }}
          >
            {saving ? "Saving…" : "Save Project"}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || events.length === 0}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors"
            style={{
              background: exporting || events.length === 0 ? "var(--surface-3)" : "var(--accent)",
              color: exporting || events.length === 0 ? "var(--text-sub)" : "#fff",
              cursor: exporting || events.length === 0 ? "not-allowed" : "pointer",
              border: "none",
            }}
            onMouseEnter={e => { if (!exporting && events.length > 0) (e.currentTarget.style.background = "var(--accent-hover)"); }}
            onMouseLeave={e => { if (!exporting && events.length > 0) (e.currentTarget.style.background = "var(--accent)"); }}
          >
            {exporting ? (
              <>
                <div className="w-3 h-3 rounded-full border animate-spin" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                Exporting…
              </>
            ) : (
              <>
                <ExportIcon />
                Export Video
              </>
            )}
          </button>
        </div>
      </header>

      {/* Export error */}
      {exportError && (
        <div className="px-5 py-2.5 text-xs flex items-center gap-2" style={{ background: "var(--danger-subtle)", borderBottom: "1px solid rgba(240,67,67,0.15)", color: "var(--danger)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {exportError}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — video + timeline */}
        <div className="flex-1 flex flex-col gap-4 p-5 overflow-auto min-w-0">
          <VideoPlayer ref={videoRef} src={videoSrc} onTimeUpdate={() => {}} />

          <SFXTimeline
            videoSrc={videoSrc}
            events={events}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdateTimestamp={handleUpdateTimestamp}
            onRemove={handleRemove}
            videoRef={videoRef}
          />

          {events.length === 0 && (
            <p className="text-center text-xs py-3" style={{ color: "var(--text-muted)" }}>
              All sound effects removed. Export will include original audio only.
            </p>
          )}
        </div>

        {/* Right — sidebar */}
        <aside
          className="w-[346px] flex-shrink-0 flex flex-col overflow-y-auto"
          style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)" }}
        >
          {/* Sidebar header */}
          <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>Sound Effects</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenAddForm}
                  className="flex items-center gap-1 text-[11px] font-medium transition-colors px-2 py-1 rounded-md"
                  style={{ color: "var(--accent)", background: "var(--accent-subtle)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.14)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--accent-subtle)")}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add SFX
                </button>
                {events.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm("Remove all sound effects?")) {
                        setEvents([]);
                        sessionStorage.removeItem(`sfx-events-${jobId}`);
                      }
                    }}
                    className="text-[11px] transition-colors"
                    style={{ color: "var(--text-sub)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-sub)")}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>


          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">

            {/* Add SFX form */}
            {showAddForm && (
              <div
                className="mb-3 p-3 rounded-xl space-y-2.5"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>New Sound Effect</p>

                <select
                  value={addForm.event_type}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, event_type: e.target.value as EventType }))}
                  className="w-full text-xs rounded-lg px-2.5 py-1.5 outline-none"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
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

                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  placeholder='e.g. "heavy wooden door slamming shut"'
                  className="w-full text-xs rounded-lg px-2.5 py-1.5 resize-none outline-none"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                  onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                />

                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Timestamp (s)</label>
                    <div className="flex gap-1">
                      <input
                        type="number" value={addForm.timestamp}
                        onChange={(e) => setAddForm((prev) => ({ ...prev, timestamp: e.target.value }))}
                        step="0.1" min="0"
                        className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                        onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                        onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                      />
                      <button
                        title="Use current video time"
                        onClick={() => setAddForm((prev) => ({ ...prev, timestamp: (videoRef.current?.currentTime ?? 0).toFixed(1) }))}
                        className="px-2 rounded-lg text-xs transition-colors"
                        style={{ background: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                      >↺</button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Duration (s)</label>
                    <input
                      type="number" value={addForm.duration}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, duration: e.target.value }))}
                      step="0.1" min="0.3" max="4.0"
                      className="w-full text-xs rounded-lg px-2 py-1.5 outline-none"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                      onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                      onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
                    />
                  </div>
                </div>

                {addError && <p className="text-[11px]" style={{ color: "var(--danger)" }}>{addError}</p>}

                <div className="flex gap-2 pt-0.5">
                  <button
                    onClick={() => { setShowAddForm(false); setAddError(null); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: "var(--surface-3)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
                  >Cancel</button>
                  <button
                    onClick={handleAddSfx}
                    disabled={adding}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                    style={{ background: adding ? "var(--surface-3)" : "var(--accent)", cursor: adding ? "not-allowed" : "pointer" }}
                    onMouseEnter={e => { if (!adding) (e.currentTarget.style.background = "var(--accent-hover)"); }}
                    onMouseLeave={e => { if (!adding) (e.currentTarget.style.background = "var(--accent)"); }}
                  >
                    {adding ? "Generating…" : "Generate & Add"}
                  </button>
                </div>
              </div>
            )}

            <SFXEventList
              events={events}
              selectedId={selectedId}
              jobId={jobId}
              onSelect={setSelectedId}
              onRemove={handleRemove}
              onPreview={previewSFX}
              onSetToCurrentTime={handleSetToCurrentTime}
              onUpdateDuration={handleUpdateDuration}
              onUpdateName={handleUpdateName}
              onUpdateVolume={handleUpdateVolume}
              onApplyExploration={handleApplyExploration}
              onApplyToSiblings={handleApplyToSiblings}
            />

          </div>
        </aside>
      </div>
    </div>
  );
}

function ExportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
