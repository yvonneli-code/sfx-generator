# SFX Generator — API & Function Reference

## Sound Effect Categories

### Category Table

| Class | Event Type | Color | Description |
|-------|-----------|-------|-------------|
| **Transition** | `whoosh` | `#06b6d4` cyan | Cut transition, swoosh, swipe, air sweep between scenes |
| | `riser` | `#0ea5e9` sky | Building tone leading to a reveal, drop, or punchline |
| | `reverse_hit` | `#38bdf8` light sky | Decaying resolve, outro settle, energy winding down |
| **Emphasis** | `stinger` | `#f43f5e` rose | Bass drop, impact hit, orchestra hit, drum accent |
| | `ding` | `#fbbf24` amber | Positive ping, bright accent, confirmation tone |
| **UI / Graphics** | `ui_pop` | `#a3e635` lime | Text appear, card pop-up, callout, element snap |
| | `ui_slide` | `#34d399` emerald | Lower third sliding in, panel motion, smooth reveal |
| **Foley** | `impact` | `#ef4444` red | Object collision, hit, punch, drop, slap |
| | `footstep` | `#f97316` orange | Walking, running, stepping |
| | `door` | `#eab308` yellow | Door, gate, hatch, lid open/close |
| | `button_click` | `#10b981` emerald | Mouse click, keyboard, switch, physical tap |
| | `body` | `#ec4899` pink | Hand clap, snap, slap, human-produced sounds |
| | `environment` | `#8b5cf6` violet | Water, wind, fire, animals, vehicles, cooking, etc. |
| **Ambient** | `ambient` | `#64748b` slate | Room tone, atmosphere, background bed |
| **Comedic** | `meme_sfx` | `#f59e0b` amber | Recognizable meme sound (library reference only) |

### Priority Order

1. **Transitions** — most impactful in short-form content, placed at scene changes
2. **UI / Motion Graphics** — text overlays, callouts, animated elements
3. **Emphasis / Stingers** — emotional punctuation on key beats
4. **Foley** — physical actions (only when prominent)
5. **Ambient** — scene-setting atmosphere (used sparingly)
6. **Comedic / Meme** — flagged as library references, not generated

---

## Genre Style Modifiers

When a user selects a sound style, a short modifier is prepended to the Gemini system prompt. The base prompt is never changed.

| Genre | Key | SFX Priority |
|-------|-----|-------------|
| **Auto-Detect** | `auto` | AI classifies the video genre first, then applies the matching modifier |
| **Skit / Meme** | `skit` | Punchy whooshes on cuts, comedic stingers on punchlines, exaggerated Foley for physical gags, meme SFX flags. High energy, tight timing. |
| **Tutorial** | `tutorial` | Clean UI pops on text/callouts, subtle whooshes on section transitions, gentle dings for key points. Minimal Foley. Polished and non-distracting. |
| **Cinematic** | `cinematic` | Heavy atmospheric whooshes, deep bass risers, dramatic stingers, rich ambient beds, naturalistic Foley. Longer durations, reverberant tails. |
| **Talking Head** | `talking_head` | Subtle whooshes on jump cuts, light UI pops on text overlays/lower thirds, 1-2 emphasis stingers for key statements. Minimal and unobtrusive. |
| **Lifestyle** | `lifestyle` | Rich environmental Foley (sizzling, pouring, chopping), gentle ambient beds, soft breathy whooshes, warm tonal dings. Organic and satisfying. |

---

## Backend API Endpoints

### Upload & Video

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload video file. Returns `{job_id, video_url}`. Saves to `temp/{job_id}/video.mp4` |
| `GET` | `/video/{job_id}` | Serve video file with byte-range support |
| `GET` | `/health` | Health check. Returns `{"status": "ok"}` |

### Analysis

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/analyze/{job_id}` | `{"style": "auto"}` (optional) | Analyze video with Gemini AI. Returns `{job_id, events[]}` |
| `POST` | `/detect-genre/{job_id}` | — | Extract first frame, classify genre via Gemini. Returns `{genre}` |

### SFX Generation

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/generate-sfx/{job_id}` | `SFXEvent[]` | Bulk generate SFX for all events. Deduplicates identical descriptions. Returns `{job_id, events[]}` |
| `POST` | `/regenerate-sfx/{job_id}/{sfx_id}` | `{description, duration_seconds}` | Force-regenerate single SFX (bypasses cache). Returns `{sfx_url}` |
| `POST` | `/add-sfx/{job_id}` | `{description, duration_seconds, timestamp_seconds, event_type}` | Generate and add a new SFX event. Returns full `SFXEvent` |
| `POST` | `/explore-sfx/{job_id}` | `{description, duration_seconds}` | Generate a variation. Returns `{explore_id, sfx_url}` |
| `POST` | `/apply-exploration/{job_id}` | `{target_sfx_id, explore_id, description}` | Promote a variation to the active SFX. Returns `{sfx_url}` |
| `GET` | `/sfx/{job_id}/{sfx_id}` | — | Serve generated SFX audio file |

### Export & Project

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/export/{job_id}` | `{events: SFXEvent[]}` | Mix SFX into video with FFmpeg. Returns `{job_id, download_url}` |
| `GET` | `/download/{job_id}` | — | Download the exported video |
| `POST` | `/save-project/{job_id}` | `{events: SFXEvent[]}` | Bundle video + SFX + events into `.sfxproject` zip |
| `POST` | `/load-project` | FormData (`.sfxproject` file) | Restore a saved project. Returns `{job_id, events[]}` |

---

## Backend Service Functions

### `llm_analyzer.py` — Video Analysis

| Function | Signature | Description |
|----------|-----------|-------------|
| `analyze_video` | `async (video_path, job_id, style="auto") -> List[SFXEvent]` | Upload video to Gemini File API, send with system prompt + style modifier + duration context, parse JSON response, post-process events |
| `_post_process_events` | `(raw_events, video_duration) -> List[SFXEvent]` | Normalize timestamps if 0-1 range detected, sort, enforce 0.5s min gap (ambient exempt), max 3 events per 3s window, cap at 15 events per 60s, clamp durations 0.3-4.0s |

### `sfx_generator.py` — Audio Generation

| Function | Signature | Description |
|----------|-----------|-------------|
| `generate_sfx_for_events` | `async (job_id, events) -> List[SFXEvent]` | Bulk generate with semaphore(3) concurrency. Deduplicates by description+duration — generates once per unique sound, copies to duplicates |
| `_generate_single_sfx` | `async (job_id, sfx_id, description, duration, force=False, event=None) -> str` | Generate one SFX via Kling API with quality gate. Checks cache first. On quality failure, retries once and picks the best |
| `_kling_generate` | `async (job_id, sfx_id, description, duration, suffix="") -> str` | Raw Kling API call: create task, poll until succeed, download MP3, apply fade-out trim |
| `_kling_auth_token` | `() -> str` | Generate short-lived JWT (HS256) for Kling API |
| `_cache_key` | `(description, duration) -> str` | MD5 hash of `"{description}|{duration}"` for global cache lookup |
| `_apply_fade_out` | `(path, duration)` | FFmpeg: trim to target duration, apply 0.1s fade-out to prevent abrupt cutoff |

### `audio_quality.py` — Quality Gate

| Function | Signature | Description |
|----------|-----------|-------------|
| `score_audio_quality` | `(audio_path, event) -> dict` | Full quality analysis. Returns `{passed, scores, rejection_reasons}` |
| `pick_best` | `(candidates) -> (path, report)` | Select best audio from candidates. Prefers passed, then highest energy profile |
| `_check_clipping` | `(samples) -> (ratio, reason)` | Reject if >5% of samples clipped |
| `_check_silence` | `(samples, sample_rate, expected_duration) -> (ratio, reason)` | Reject if >50% silent (60% threshold for <0.5s events) |
| `_check_duration` | `(actual, expected) -> (ratio, reason)` | Reject if actual is <40% or >250% of expected |
| `_score_energy_profile` | `(samples, event_type) -> float` | Score 0.0-1.0 based on whether energy shape matches event type (e.g., transient for impacts, sustained for ambient) |

### `audio_mixer.py` — Export Mixing

| Function | Signature | Description |
|----------|-----------|-------------|
| `mix_audio` | `async (job_id, events) -> str` | Async wrapper that runs mixer in thread executor |
| `_mix_sync` | `(job_id, events) -> str` | Build FFmpeg filter graph: per-SFX chain of `atrim -> asetpts -> volume -> adelay`, then `amix` with `normalize=0`. Falls back to stream copy when no SFX |

### `video_processor.py` — Metadata

| Function | Signature | Description |
|----------|-----------|-------------|
| `get_video_metadata` | `(video_path) -> dict` | Extract `{duration, width, height}` via ffprobe |

---

## Frontend Functions

### Upload Page (`page.tsx`)

| Function | Description |
|----------|-------------|
| `handleFile(file)` | Upload video, get job_id, transition to style selector |
| `handleStyleConfirm(style)` | If "auto": detect genre first. Then analyze with Gemini, generate SFX with Kling, save to sessionStorage, navigate to review |
| `handleProjectFile(file)` | Load `.sfxproject` file, restore events, navigate to review |

### Review Page (`review/[jobId]/page.tsx`)

| Function | Description |
|----------|-------------|
| `handleRemove(id)` | Remove SFX event, update sessionStorage |
| `handleUpdateTimestamp(id, ts)` | Update event timestamp |
| `handleUpdateDuration(id, duration)` | Update event duration |
| `handleUpdateName(id, eventType)` | Update event type |
| `handleUpdateVolume(id, volume)` | Update event volume (0-200%) |
| `handleSetToCurrentTime(id)` | Set event timestamp to current video playback time |
| `handleRegenerate(id, description)` | Force-regenerate single SFX via Kling |
| `handleRegenerateAll()` | Regenerate all SFX, preserve timestamps/volumes |
| `handleGenerateExploration()` | Generate a variation of the selected SFX |
| `handleApplyExploration(exploreId, description)` | Promote variation to active SFX |
| `handleAddSfx()` | Generate and add a new SFX event at specified timestamp |
| `handleSaveProject()` | Download `.sfxproject` bundle |
| `handleExport()` | Export mixed video with all SFX |

### Components

| Component | File | Description |
|-----------|------|-------------|
| `SFXTimeline` | `SFXTimeline.tsx` | WaveSurfer.js v7 timeline with draggable colored regions per event. Syncs with video element via MediaElement backend |
| `SFXEventList` | `SFXEventList.tsx` | Sidebar list with collapsed/expanded views. Controls: description, event type, volume, duration, regenerate, preview |
| `StyleSelector` | `StyleSelector.tsx` | 2x3 grid of genre pill cards (auto, skit, tutorial, cinematic, talking_head, lifestyle) with confirm button |
| `VideoPlayer` | `VideoPlayer.tsx` | `forwardRef` wrapper around `<video>` with `crossOrigin="anonymous"` |
| `VideoUpload` | `VideoUpload.tsx` | Drag-and-drop + click upload zone for video files |

### Hook: `useWebAudio`

| Export | Description |
|--------|-------------|
| `previewSFX(sfxId)` | Play single SFX immediately at full volume |
| (internal) `scheduleFromPosition(time)` | Cancel all sources, reschedule all events from given video position using AudioContext clock |
| (internal) `cancelScheduled()` | Stop all playing/scheduled sources on pause |

Maintains one persistent `AudioContext`, incrementally loads `AudioBuffer` per event, handles late-loading buffers during playback.

---

## Data Models

### `SFXEvent`

```
sfx_id: string                    — UUID
timestamp_seconds: float          — Position in video (seconds)
event_type: EventType             — One of 16 categories
description: string               — 15-30 word sound design description
estimated_duration_seconds: float — 0.3 to 4.0 seconds
volume: float                     — 0.0 to 2.0 (default 1.0)
sfx_url: string | null            — Path to generated audio file
```

### Post-Processing Rules

| Rule | Detail |
|------|--------|
| Normalized timestamp detection | If all timestamps <= 1.0 and video > 2s, multiply by video duration |
| Min gap | 0.5s between non-ambient events |
| Density cap | Max 3 non-ambient events per 3s window |
| Total cap | Max 15 events per 60s (minimum 15 for clips < 60s) |
| Duration clamp | 0.3s floor, 4.0s ceiling |
| Bounds check | Skip events with timestamp < 0 or >= video duration |
| Ambient exempt | Ambient events bypass gap and density rules |
| Unknown types | Default to `environment` |

### Kling API Constraints

| Constraint | Detail |
|------------|--------|
| Minimum duration | 3.0s (shorter durations clamped up, then trimmed after download) |
| Prompt length | First 200 characters of description |
| Concurrency | Max 3 simultaneous tasks |
| Retries | 3 attempts with exponential backoff (1s, 2s, 4s) |
| Poll interval | 2s, up to 60 polls (120s timeout) |
| Quality gate | Check clipping, silence, duration, energy profile. Retry once on failure, pick best |
| Cache | Global MD5 cache at `temp/_cache/{hash}.mp3`, keyed by description + duration. Written after fade-out applied |
| Deduplication | Events with identical description + duration generate once, result copied to duplicates |
