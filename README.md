# SFX Generator

AI-powered sound effects for any video. Upload a clip, choose a sound style, and get production-ready SFX placed at exactly the right moments.

**Gemini AI** detects where sounds belong. **Kling AI** generates the audio. **FFmpeg** mixes it all together.

## How It Works

```
Upload video  -->  Choose style  -->  AI detects moments  -->  Generate SFX  -->  Review & edit  -->  Export
```

1. **Upload** a short-form video (TikTok, Reel, YouTube Short, etc.)
2. **Choose a sound style** — or let Auto-Detect pick one:
   - Skit / Meme — punchy, exaggerated, comedic
   - Tutorial — clean pops, subtle transitions
   - Cinematic — heavy, atmospheric, dramatic
   - Talking Head — minimal, jump-cut-friendly
   - Lifestyle — organic, warm, satisfying
3. **Gemini 3.1 Pro** analyzes the full video and identifies moments that need sound (scene changes, text overlays, punchlines, physical actions)
4. **Kling AI** generates matching sound effects for each moment
5. **Review** on an interactive timeline — drag to reposition, adjust volume/duration, regenerate, explore variations
6. **Export** the final video with all SFX mixed in

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- FFmpeg installed and on PATH
- API keys for [Google AI](https://aistudio.google.com/apikey) and [Kling AI](https://docs.qingque.cn/d/home/eZQBMqMvGpSQlB4WaF9Bmeig_?identityId=2PSbMOVBWel)

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/yvonneli-code/sfx-generator.git
   cd sfx-generator
   ```

2. Create `backend/.env`:
   ```
   GOOGLE_API_KEY=your_google_api_key
   KLING_ACCESS_KEY=your_kling_access_key
   KLING_SECRET_KEY=your_kling_secret_key
   ```

3. Start both servers:
   ```bash
   ./start.sh
   ```
   This creates a Python venv, installs all dependencies, and starts the backend (port 8000) and frontend (port 3000).

4. Open **http://localhost:3000**

## Architecture

```
frontend/ (Next.js 15, port 3000)
  src/app/page.tsx          Upload + style selector
  src/app/review/[jobId]/   Timeline editor + export
  src/components/           SFXTimeline, SFXEventList, StyleSelector, VideoPlayer
  src/hooks/useWebAudio.ts  Real-time SFX preview via Web Audio API

backend/ (FastAPI, port 8000)
  routers/
    upload.py       POST /upload, GET /video/{job_id}
    analyze.py      POST /analyze/{job_id}
    genre.py        POST /detect-genre/{job_id}
    sfx.py          POST /generate-sfx, /regenerate-sfx, /add-sfx, /explore-sfx
    export.py       POST /export/{job_id}, GET /download/{job_id}
    project.py      POST /save-project, /load-project
  services/
    llm_analyzer.py     Gemini video analysis + post-processing
    sfx_generator.py    Kling audio generation + caching + quality gate
    audio_mixer.py      FFmpeg filter graph for final mix
    audio_quality.py    Clipping, silence, duration, energy profile checks
    video_processor.py  ffprobe metadata extraction
```

The frontend proxies `/api/*` requests to the backend via Next.js rewrites. No direct backend access needed from the browser.

## Sound Effect Categories

16 event types grouped by editorial priority:

| Class | Types | When used |
|-------|-------|-----------|
| **Transition** | whoosh, riser, reverse_hit | Scene changes, hard cuts, video open/close |
| **Emphasis** | stinger, ding | Punchlines, reveals, key statements |
| **UI / Graphics** | ui_pop, ui_slide | Text overlays, callouts, animated elements |
| **Foley** | impact, footstep, door, button_click, body, environment | Prominent physical actions |
| **Ambient** | ambient | Scene-setting atmosphere |
| **Comedic** | meme_sfx | Library references only (vine boom, etc.) |

## Key Features

- **Style-aware analysis** — genre selection biases which SFX types get prioritized
- **Auto genre detection** — Gemini classifies the video from its first frame
- **Interactive timeline** — WaveSurfer.js with draggable, color-coded regions
- **Real-time preview** — Web Audio API schedules SFX in sync with video playback
- **Quality gate** — generated audio is checked for clipping, silence, and energy profile; retried if it fails
- **Smart caching** — identical descriptions reuse cached audio; duplicates within a batch only generate once
- **Explore variations** — generate alternative sounds and audition them before committing
- **Save/load projects** — `.sfxproject` bundles preserve video, audio, and event state
- **Volume per event** — 0-200% per SFX, preserved in export via FFmpeg `volume` filter
- **Normalized mixing** — `amix normalize=0` prevents volume reduction when layering many SFX

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS, WaveSurfer.js v7 |
| Backend | FastAPI, uvicorn, Pydantic |
| Video Analysis | Gemini 3.1 Pro (Google AI) |
| Audio Generation | Kling AI text-to-audio |
| Audio Processing | FFmpeg (mixing, trimming, fade-out) |
| Quality Analysis | pydub, numpy |

## API Reference

See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for the full endpoint and function reference.

## License

MIT
