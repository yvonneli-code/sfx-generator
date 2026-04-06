"use client";

import { useEffect, useRef, useCallback } from "react";
import { SFXEvent } from "@/types";

interface UseWebAudioOptions {
  events: SFXEvent[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export function useWebAudio({ events, videoRef }: UseWebAudioOptions) {
  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const loadedUrlRef = useRef<Map<string, string>>(new Map()); // sfx_id → last loaded url
  const scheduledRef = useRef<AudioBufferSourceNode[]>([]);
  const eventsRef = useRef<SFXEvent[]>(events);

  // Keep eventsRef current without causing re-renders
  useEffect(() => { eventsRef.current = events; }, [events]);

  // Create AudioContext once and keep it alive
  useEffect(() => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    return () => {
      ctx.close();
      buffersRef.current.clear();
      loadedUrlRef.current.clear();
    };
  }, []);

  // Incrementally sync buffers when events change:
  // - Remove buffers for deleted events
  // - Load buffers for new events or events whose sfx_url changed (regenerated)
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.state === "closed") return;

    const currentIds = new Set(events.map((e) => e.sfx_id));

    // Remove stale buffers
    for (const id of buffersRef.current.keys()) {
      if (!currentIds.has(id)) {
        buffersRef.current.delete(id);
        loadedUrlRef.current.delete(id);
      }
    }

    // Load missing or updated buffers
    async function loadBuffers() {
      for (const ev of events) {
        if (!ev.sfx_url) {
          console.log(`[useWebAudio] skipping ${ev.sfx_id} — no sfx_url`);
          continue;
        }
        const alreadyLoaded = loadedUrlRef.current.get(ev.sfx_id);
        if (alreadyLoaded === ev.sfx_url) continue; // same file, skip

        try {
          console.log(`[useWebAudio] fetching ${ev.sfx_url}`);
          const res = await fetch(`/api${ev.sfx_url}`);
          if (!res.ok) { console.warn(`[useWebAudio] fetch failed ${res.status} for ${ev.sfx_url}`); continue; }
          const arrayBuffer = await res.arrayBuffer();
          const currentCtx = ctxRef.current;
          if (!currentCtx || currentCtx.state === "closed") return;
          const audioBuffer = await currentCtx.decodeAudioData(arrayBuffer);
          buffersRef.current.set(ev.sfx_id, audioBuffer);
          loadedUrlRef.current.set(ev.sfx_id, ev.sfx_url);
          console.log(`[useWebAudio] buffer ready: ${ev.sfx_id} (${audioBuffer.duration.toFixed(2)}s)`);

          // If video is already playing, schedule just this one new buffer
          // without cancelling the other already-scheduled sources
          const video = videoRef.current;
          if (video && !video.paused && currentCtx.state === "running") {
            const videoTime = video.currentTime;
            const delay = ev.timestamp_seconds - videoTime;
            if (delay >= -ev.estimated_duration_seconds) {
              const source = currentCtx.createBufferSource();
              source.buffer = audioBuffer;
              const gain = currentCtx.createGain();
              gain.gain.value = ev.volume ?? 1.0;
              source.connect(gain);
              gain.connect(currentCtx.destination);
              const audioNow = currentCtx.currentTime;
              if (delay <= 0) {
                const offset = Math.min(-delay, audioBuffer.duration - 0.01);
                source.start(audioNow, offset);
                console.log(`[useWebAudio] late-schedule ${ev.sfx_id} START NOW offset=${offset.toFixed(2)}s`);
              } else {
                source.start(audioNow + delay);
                console.log(`[useWebAudio] late-schedule ${ev.sfx_id} in ${delay.toFixed(2)}s`);
              }
              scheduledRef.current.push(source);
            }
          }
        } catch (err) {
          console.warn(`[useWebAudio] Failed to load SFX ${ev.sfx_id}:`, err);
        }
      }
      console.log(`[useWebAudio] loadBuffers done — total buffers: ${buffersRef.current.size}`);
    }

    loadBuffers();
  }, [events]);

  const cancelScheduled = useCallback(() => {
    for (const node of scheduledRef.current) {
      try { node.stop(); } catch {}
      node.disconnect();
    }
    scheduledRef.current = [];
  }, []);

  const scheduleFromPosition = useCallback(async (videoCurrentTime: number) => {
    const ctx = ctxRef.current;
    if (!ctx) { console.warn("[useWebAudio] scheduleFromPosition: no AudioContext"); return; }

    cancelScheduled();

    console.log(`[useWebAudio] scheduleFromPosition — ctx.state=${ctx.state} videoTime=${videoCurrentTime.toFixed(2)} buffers=${buffersRef.current.size} events=${eventsRef.current.length}`);

    if (ctx.state === "suspended") {
      console.log("[useWebAudio] resuming suspended AudioContext...");
      await ctx.resume();
      console.log(`[useWebAudio] AudioContext resumed, state=${ctx.state}`);
    }

    // Re-read currentTime after potential async resume to avoid drift
    const video = videoRef.current;
    const syncedVideoTime = video ? video.currentTime : videoCurrentTime;
    const audioNow = ctx.currentTime;

    let scheduled = 0;
    for (const ev of eventsRef.current) {
      const buffer = buffersRef.current.get(ev.sfx_id);
      if (!buffer) {
        console.log(`[useWebAudio] no buffer for ${ev.sfx_id} (${ev.event_type} @ ${ev.timestamp_seconds}s)`);
        continue;
      }

      const delay = ev.timestamp_seconds - syncedVideoTime;
      if (delay < -ev.estimated_duration_seconds) {
        console.log(`[useWebAudio] skipping ${ev.sfx_id} — already passed (delay=${delay.toFixed(2)}s)`);
        continue;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = ev.volume ?? 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);

      if (delay <= 0) {
        const offset = Math.min(-delay, buffer.duration - 0.01);
        source.start(audioNow, offset);
        console.log(`[useWebAudio] START NOW ${ev.sfx_id} offset=${offset.toFixed(2)}s`);
      } else {
        source.start(audioNow + delay);
        console.log(`[useWebAudio] SCHEDULED ${ev.sfx_id} in ${delay.toFixed(2)}s`);
      }

      scheduledRef.current.push(source);
      scheduled++;
    }
    console.log(`[useWebAudio] scheduled ${scheduled} sources`);
  }, [cancelScheduled, videoRef]);

  // Wire up to video element events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { console.log(`[useWebAudio] video play at ${video.currentTime.toFixed(2)}s`); scheduleFromPosition(video.currentTime); };
    const onPause = () => { console.log("[useWebAudio] video paused"); cancelScheduled(); };
    const onSeeked = () => {
      if (!video.paused) scheduleFromPosition(video.currentTime);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [videoRef, scheduleFromPosition, cancelScheduled]);

  // Preview a single SFX in isolation
  const previewSFX = useCallback(async (sfxId: string) => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") await ctx.resume();

    const buffer = buffersRef.current.get(sfxId);
    if (buffer && ctx) {
      const ev = eventsRef.current.find((e) => e.sfx_id === sfxId);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = ev?.volume ?? 1.0;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      return;
    }

    // Fallback: use HTML Audio element when buffer isn't loaded yet
    const ev = eventsRef.current.find((e) => e.sfx_id === sfxId);
    if (ev?.sfx_url) {
      console.log(`[useWebAudio] preview fallback via Audio element for ${sfxId}`);
      const audio = new Audio(`/api${ev.sfx_url}`);
      audio.volume = ev.volume ?? 1.0;
      audio.play().catch((err) => console.warn("[useWebAudio] fallback play failed:", err));
    }
  }, []);

  return { previewSFX };
}
