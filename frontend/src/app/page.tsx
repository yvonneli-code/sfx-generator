"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VideoUpload from "@/components/VideoUpload";

type Stage = "idle" | "uploading" | "analyzing" | "generating" | "error";

export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  async function handleProjectFile(file: File) {
    setError(null);
    setStage("uploading");
    setProgress("Loading project...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/load-project", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const { job_id, events } = await res.json();
      sessionStorage.setItem(`sfx-events-${job_id}`, JSON.stringify(events));
      router.push(`/review/${job_id}`);
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "Failed to load project");
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setStage("uploading");
    setProgress("Uploading video...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const { job_id } = await uploadRes.json();

      setStage("analyzing");
      setProgress("Analyzing video with Gemini AI...");
      const analyzeRes = await fetch(`/api/analyze/${job_id}`, { method: "POST" });
      if (!analyzeRes.ok) throw new Error(await analyzeRes.text());
      const { events } = await analyzeRes.json();

      if (!events || events.length === 0) {
        setError("No sound effect moments detected in this clip. Try a different video.");
        setStage("error");
        return;
      }

      setStage("generating");
      setProgress(`Generating ${events.length} sound effects with Kling AI...`);
      const sfxRes = await fetch(`/api/generate-sfx/${job_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(events),
      });
      if (!sfxRes.ok) throw new Error(await sfxRes.text());
      const { events: sfxEvents } = await sfxRes.json();

      sessionStorage.setItem(`sfx-events-${job_id}`, JSON.stringify(sfxEvents));
      router.push(`/review/${job_id}`);
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }

  const stageLabel: Record<string, string> = {
    uploading: "Uploading",
    analyzing: "Analyzing",
    generating: "Generating",
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-xl space-y-6">

        {/* Wordmark */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <SoundIcon />
            <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--accent)" }}>
              SFX Generator
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            Add sound effects<br />to any video
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            AI detects moments · Kling AI generates audio · Export in one click
          </p>
        </div>

        {/* Idle */}
        {stage === "idle" && (
          <div className="space-y-2">
            <VideoUpload onFile={handleFile} />
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-[11px]" style={{ color: "var(--text-sub)" }}>or open a saved project</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
            <label
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border cursor-pointer transition-colors duration-150"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-muted)",
                background: "var(--surface)",
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
              <FolderIcon />
              <span className="text-xs font-medium">Open .sfxproject</span>
              <input
                type="file"
                accept=".sfxproject"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleProjectFile(e.target.files[0]); }}
              />
            </label>
          </div>
        )}

        {/* Loading */}
        {(stage === "uploading" || stage === "analyzing" || stage === "generating") && (
          <div
            className="rounded-2xl p-10 flex flex-col items-center gap-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full" style={{ border: "2px solid var(--border)" }} />
              <div
                className="absolute inset-0 rounded-full animate-spin"
                style={{ border: "2px solid transparent", borderTopColor: "var(--accent)" }}
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--accent)" }}>
                {stageLabel[stage]}
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{progress}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {stage === "error" && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{ background: "var(--danger-subtle)", border: "1px solid rgba(240,67,67,0.2)" }}
          >
            <div className="flex gap-3 items-start">
              <ErrorIcon />
              <p className="text-sm leading-relaxed" style={{ color: "var(--danger)" }}>{error}</p>
            </div>
            <button
              onClick={() => { setStage("idle"); setError(null); }}
              className="text-xs font-medium transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              ← Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function SoundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5" style={{ color: "var(--danger)" }}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
