"use client";

import { useCallback, useState } from "react";

interface Props {
  onFile: (file: File) => void;
}

export default function VideoUpload({ onFile }: Props) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) {
        onFile(file);
      }
    },
    [onFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  return (
    <label
      className="relative flex flex-col items-center justify-center gap-4 w-full rounded-2xl border-2 border-dashed p-14 cursor-pointer transition-all duration-150"
      style={{
        borderColor: dragging ? "var(--accent)" : "var(--border)",
        background: dragging ? "var(--accent-subtle)" : "var(--surface)",
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onMouseEnter={e => {
        if (!dragging) (e.currentTarget as HTMLElement).style.borderColor = "var(--border-focus)";
      }}
      onMouseLeave={e => {
        if (!dragging) (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      <input type="file" accept="video/*" className="sr-only" onChange={handleChange} />

      <div className="flex flex-col items-center gap-3 pointer-events-none">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent-subtle)" }}
        >
          <VideoIcon />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            {dragging ? "Drop to upload" : "Drop your video here"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            or <span style={{ color: "var(--accent)" }}>browse files</span>
          </p>
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-sub)" }}>
          MP4 · MOV · WebM &nbsp;·&nbsp; Max 5 minutes
        </p>
      </div>
    </label>
  );
}

function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
}
