# SFX Generator — CLAUDE.md

## Project Overview

A full-stack AI-powered sound effects generator. Upload a video clip → Gemini AI detects moments that need sound effects → Kling AI generates matching audio → review and edit on an interactive timeline → export the mixed video.

## Architecture

- **Frontend**: Next.js 15 (`/frontend`, port 3000)
- **Backend**: FastAPI + uvicorn (`/backend`, port 8000)
- **Frontend → Backend**: Next.js rewrites proxy `/api/*` → `http://localhost:8000/*`
- **Start**: `./start.sh` (creates Python venv, installs deps, starts both servers)
- **Env**: `backend/.env` — `GOOGLE_API_KEY`, `KLING_ACCESS_KEY`, `KLING_SECRET_KEY`

## Backend

### Entry Point
`backend/main.py` — FastAPI app with CORS, static file serving, and router registration.

### Routers (`backend/routers/`)

| File | Endpoints |
|------|-----------|
| `upload.py` | `POST /upload` — saves video to `temp/{job_id}/video.mp4`; `GET /video/{job_id}` — serves video |
| `analyze.py` | `POST /analyze/{job_id}` — calls Gemini to detect SFX moments, returns `SFXEvent[]` |
| `sfx.py` | `POST /generate-sfx/{job_id}` — bulk generate SFX for all events; `POST /regenerate-sfx/{job_id}/{sfx_id}` — force-regenerate one; `POST /add-sfx/{job_id}` — generate and add a new SFX; `POST /explore-sfx/{job_id}` — generate a variation; `POST /apply-exploration/{job_id}` — promote a variation to the active SFX; `GET /sfx/{job_id}/{sfx_id}` — serve audio file |
| `export.py` | `POST /export/{job_id}` — mix SFX into video with FFmpeg; `GET /download/{job_id}` — download mixed video |
| `project.py` | `POST /save-project/{job_id}` — bundle video + SFX + events into `.sfxproject` zip; `POST /load-project` — restore a saved project |

### Services (`backend/services/`)

**`llm_analyzer.py`** — Gemini 2.5 Flash via `google-genai` SDK
- Uploads video to Google File API, polls until ready
- Sends to `gemini-2.5-flash` with a structured system prompt
- Post-processes events: sort, deduplicate, enforce 0.5s minimum gap, max 2 events per 3s window, clamp durations to 0.3–4.0s
- 15 allowed event categories: `impact`, `footstep`, `door`, `explosion`, `whoosh`, `creak`, `glass_break`, `water_splash`, `button_click`, `slide`, `crowd_reaction`, `animal`, `vehicle`, `wind`, `fire`

**`sfx_generator.py`** — Kling AI `/v1/audio/text-to-audio`
- Auth via JWT (HS256) generated from `KLING_ACCESS_KEY` + `KLING_SECRET_KEY`
- Async task pattern: POST to create task → poll GET every 2s until `succeed` → download MP3 from result URL
- Kling minimum duration is 3.0s; shorter durations are clamped to 3.0 then trimmed after download
- Global MD5 cache at `temp/_cache/{hash}.mp3` keyed by `description|duration` — cache is written AFTER fade-out is applied
- `force=True` bypasses cache (used by regenerate/explore)
- Applies 0.1s fade-out trim via FFmpeg subprocess after generation
- Bulk generation: semaphore(3) concurrency, 3 retries with exponential backoff
- All SFX errors surfaced as proper HTTP exceptions with Kling response body

**`audio_mixer.py`** — FFmpeg filter_complex
- Builds `amix` graph with `normalize=0` (preserves original audio volume)
- Each SFX: `atrim → asetpts → volume → adelay` chain
- Falls back to stream copy when no SFX exist
- Runs synchronously in a thread executor

**`video_processor.py`** — `ffprobe` for duration/dimensions metadata

### Models (`backend/models.py`)
Key models: `SFXEvent`, `AnalyzeResponse`, `GenerateSFXResponse`, `RegenerateRequest`, `AddSFXRequest`, `ExploreRequest`, `ApplyExplorationRequest`, `ExportRequest`, `LoadProjectResponse`

`SFXEvent` fields: `sfx_id`, `timestamp_seconds`, `event_type`, `description`, `estimated_duration_seconds`, `volume` (default 1.0), `sfx_url` (optional)

## Frontend

### Pages

**`src/app/page.tsx`** — Upload flow
- Three-stage pipeline UI: uploading → analyzing → generating
- Handles `.sfxproject` file loading via drag-or-click
- Stores final events in `sessionStorage` keyed by `sfx-events-{jobId}` before navigating to review

**`src/app/review/[jobId]/page.tsx`** — Review page
- Loads events from `sessionStorage` on mount
- Manages all event mutations (update timestamp, duration, name, volume, remove, add, regenerate)
- All mutations write back to `sessionStorage` immediately
- Error handling on all async operations (regenerate, explore, apply exploration, export)
- Exports video by POSTing current events list to backend

### Components

**`VideoPlayer.tsx`** — `forwardRef` wrapper around `<video>` with `crossOrigin="anonymous"` and `preload="metadata"`

**`SFXTimeline.tsx`** — WaveSurfer.js v7 timeline
- `backend: "MediaElement"` shares the existing `<video>` element (no double decode)
- Regions plugin: colored draggable markers per SFX event
- `wsReady` state gate: regions only added after `"ready"` event fires (prevents getDuration()=0 clamping bug)
- Region drag → `onUpdateTimestamp` callback
- Region updates (color, position, size) on every `events` or `selectedId` change
- Timeline plugin: 1s intervals, labels every 5s

**`SFXEventList.tsx`** — Sidebar event list
- Collapsed view: color dot, event type, timestamp, duration, description preview
- Expanded (selected) view: description textarea, event type select, volume slider (0–200%), duration stepper (0.3–4.0s in 0.1 steps), "Set to current time", "Regenerate" button
- Per-event regeneration error state shown inline (no page crash on failure)

### Hook: `useWebAudio.ts`

Web Audio API engine for real-time SFX preview during video playback.

**Design principles:**
- One `AudioContext` created once and kept alive for the session
- Buffers loaded incrementally: per-event URL tracking in `loadedUrlRef`, only re-fetches when `sfx_url` changes (cache-busted on regeneration via `?t=timestamp`)
- Stale buffers removed when events are deleted

**Scheduling:**
- `scheduleFromPosition(videoCurrentTime)` — cancels all scheduled sources, resumes suspended context, then schedules all buffered events from the current video position
- Called on: `play`, `seeked` (if not paused)
- `cancelScheduled()` — called on `pause`
- Late-loading buffers (loaded after video starts playing): scheduled individually without cancelling existing sources — slots each new sound in at the correct `audioNow + delay` using the AudioContext clock

**Preview:** `previewSFX(sfxId)` — plays a single SFX immediately at full volume, independent of video position

## Design System

### Figma Source
**OpusUI** — `https://www.figma.com/design/kCMiFZzEmTU44Yud5FftCR/📗-OpusUI?node-id=743-2030`

This is the reference design system for the SFX Generator UI. When making UI changes, check OpusUI first for components, tokens, and patterns before inventing new ones.

### CSS Design Tokens (`frontend/src/app/globals.css`)

All colors are defined as CSS custom properties on `:root` and used throughout via `var(--token)`:

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0f0f0f` | Page background |
| `--surface` | `#1a1a1a` | Cards, panels, list items |
| `--surface-2` | `#252525` | Selected state, hover, nested surfaces |
| `--border` | `#333` | Dividers, input borders, button borders |
| `--text` | `#f0f0f0` | Primary text |
| `--text-muted` | `#888` | Secondary text, labels, placeholders |
| `--accent` | `#6366f1` | Indigo — primary actions, focus rings, WaveSurfer progress |
| `--accent-hover` | `#4f46e5` | Darker indigo for hover states |
| `--danger` | `#ef4444` | Red — destructive actions, error text |

### Typography
- Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Base size: `14px`, line-height: `1.5`
- No custom font loaded — system fonts only

### SFX Event Colors (`frontend/src/types.ts`)

Each event type has a dedicated color used for timeline regions and sidebar dots:

| Event | Color | | Event | Color |
|-------|-------|-|-------|-------|
| `impact` | `#ef4444` red | | `crowd_reaction` | `#ec4899` pink |
| `explosion` | `#dc2626` dark red | | `animal` | `#14b8a6` teal |
| `footstep` | `#f97316` orange | | `vehicle` | `#6366f1` indigo |
| `fire` | `#f97316` orange | | `wind` | `#8b5cf6` violet |
| `door` | `#eab308` yellow | | `button_click` | `#10b981` emerald |
| `slide` | `#f59e0b` amber | | `whoosh` | `#06b6d4` cyan |
| `creak` | `#84cc16` lime | | `water_splash` | `#3b82f6` blue |
| `glass_break` | `#a855f7` purple | | | |

### UI Patterns
- **Dark theme only** — no light mode
- **Rounded corners**: `rounded-lg` (8px) for list items, `rounded-xl` (12px) for cards/panels, `rounded-2xl` (16px) for major containers
- **Spacing**: Tailwind utilities (`p-3`, `p-4`, `p-6`, `gap-2`, `gap-4`)
- **Buttons**: accent background for primary actions; `var(--border)` background for secondary; `text-[var(--text-muted)] hover:text-red-400` for destructive
- **Inputs/Textareas**: `bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)]` — no outline on focus, border color change only
- **Loading states**: `animate-pulse` skeleton or `animate-spin` spinner using accent border-top trick
- **Error display**: inline `text-xs text-red-400` under the triggering control (not toast/modal)
- **WaveSurfer**: `waveColor: "#444"`, `progressColor: "#6366f1"`, region `opacity: 0.75` → `1.0` on hover, 4px handle width

## Key Implementation Notes

- **Google AI SDK**: uses `google-genai` (NOT deprecated `google-generativeai`)
- **WaveSurfer v7**: `"interaction"` event (not `"seek"`) provides time in seconds (not 0–1 progress)
- **amix normalize=0**: prevents Kling audio from being divided by N inputs in export
- **Cache after fade**: SFX cache is written after `_apply_fade_out` so cached files have the trim applied
- **SessionStorage**: events are the source of truth on the frontend; no server-side persistence of event state
- **Kling errors**: surfaced with full response body (status code + message) through the error chain up to the UI
