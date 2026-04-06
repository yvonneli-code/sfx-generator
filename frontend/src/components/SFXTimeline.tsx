"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.js";
import { SFXEvent, EVENT_COLORS } from "@/types";

interface Props {
  videoSrc: string;
  events: SFXEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateTimestamp: (id: string, newTimestamp: number) => void;
  onRemove: (id: string) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export default function SFXTimeline({
  videoSrc,
  events,
  selectedId,
  onSelect,
  onUpdateTimestamp,
  onRemove,
  videoRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const syncingRef = useRef(false);
  // Track when WaveSurfer has finished decoding — regions must not be added before
  // this point because getDuration() returns 0 and WaveSurfer clamps all start/end
  // positions to 0, turning every region into a zero-width marker with no background.
  const [wsReady, setWsReady] = useState(false);
  // Also gate on video metadata so duration is known when using MediaElement backend
  const [mediaReady, setMediaReady] = useState(false);

  // Track video metadata readiness
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onMeta = () => setMediaReady(true);
    if (video.readyState >= 1) {
      setMediaReady(true);
    } else {
      video.addEventListener("loadedmetadata", onMeta);
      return () => video.removeEventListener("loadedmetadata", onMeta);
    }
  }, [videoRef]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    setWsReady(false);

    const regionsPlugin = RegionsPlugin.create();
    const timelinePlugin = TimelinePlugin.create({
      timeInterval: 1,
      primaryLabelInterval: 5,
      style: { color: "var(--text-sub)", fontSize: "10px" },
    });

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "var(--border-focus)",
      progressColor: "var(--accent)",
      height: 72,
      backend: "MediaElement",
      media: videoRef.current ?? undefined,
      plugins: [regionsPlugin, timelinePlugin],
      interact: true,
      cursorColor: "var(--text-muted)",
      cursorWidth: 1,
    });

    wsRef.current = ws;
    regionsRef.current = regionsPlugin;

    // Only allow regions to be drawn once WaveSurfer knows the duration
    ws.on("ready", () => setWsReady(true));

    // Sync WaveSurfer seek → video
    ws.on("interaction", (newTime) => {
      if (syncingRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      syncingRef.current = true;
      video.currentTime = newTime;
      syncingRef.current = false;
    });

    // Region click → select
    regionsPlugin.on("region-clicked", (region, e) => {
      e.stopPropagation();
      onSelect(region.id);
    });

    // Region drag end → update timestamp
    regionsPlugin.on("region-updated", (region) => {
      onUpdateTimestamp(region.id, region.start);
    });

    return () => {
      ws.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc]);

  // Sync events → regions (only after WaveSurfer is ready AND video metadata loaded)
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions || !wsReady || !mediaReady) return;

    const existing = regions.getRegions();
    const existingIds = new Set(existing.map((r) => r.id));
    const eventIds = new Set(events.map((e) => e.sfx_id));

    // Remove deleted regions
    for (const region of existing) {
      if (!eventIds.has(region.id)) {
        region.remove();
      }
    }

    // Add / update regions
    for (const ev of events) {
      const color = EVENT_COLORS[ev.event_type] ?? "#6366f1";
      const alpha = selectedId === ev.sfx_id ? "cc" : "66";

      if (!existingIds.has(ev.sfx_id)) {
        regions.addRegion({
          id: ev.sfx_id,
          start: ev.timestamp_seconds,
          end: ev.timestamp_seconds + ev.estimated_duration_seconds,
          color: color + alpha,
          drag: true,
          resize: false,
          content: ev.event_type.replace(/_/g, " "),
        });
      } else {
        // Update color, position, and size on any change
        const region = existing.find((r) => r.id === ev.sfx_id);
        if (region) {
          region.setOptions({
            color: color + alpha,
            start: ev.timestamp_seconds,
            end: ev.timestamp_seconds + ev.estimated_duration_seconds,
          });
        }
      }
    }
  }, [events, selectedId, wsReady, mediaReady]);

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <p className="text-[11px] mb-3" style={{ color: "var(--text-sub)" }}>
        Drag regions to adjust timing · Click to select
      </p>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
