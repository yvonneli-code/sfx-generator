import os
import json
import uuid
import asyncio
import time
from typing import List
from pathlib import Path

from google import genai
from google.genai import types
from dotenv import load_dotenv

from models import SFXEvent, EventType

load_dotenv(Path(__file__).parent.parent / ".env")

client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

TEMP_DIR = Path(__file__).parent.parent / "temp"

ALLOWED_CATEGORIES = [
    # Transition (editorial glue) — highest priority
    "whoosh", "riser", "reverse_hit",
    # Emphasis (emotional punctuation)
    "stinger", "ding",
    # UI / Motion graphics
    "ui_pop", "ui_slide",
    # Foley (physical reality)
    "impact", "footstep", "door", "button_click", "body", "environment",
    # Ambient (continuous atmosphere)
    "ambient",
    # Comedic / Meme
    "meme_sfx",
]

STYLE_MODIFIERS = {
    "auto": "",
    "skit": (
        "This video is a comedy skit or meme. Prioritize punchy whooshes on cuts, "
        "comedic stingers on punchlines, exaggerated Foley for physical gags, "
        "and meme_sfx for comedic highlights. Keep energy high and timing tight.\n\n"
    ),
    "tutorial": (
        "This video is a tutorial or how-to. Prioritize clean UI pops on text/callout "
        "overlays, subtle whooshes on section transitions, gentle dings for key points, "
        "and minimal Foley. Keep sounds polished, modern, and non-distracting.\n\n"
    ),
    "cinematic": (
        "This video is cinematic B-roll or a short film. Prioritize heavy atmospheric "
        "whooshes, deep bass risers, dramatic stingers, rich ambient beds, and naturalistic "
        "Foley. Favor longer durations and reverberant tails.\n\n"
    ),
    "talking_head": (
        "This video is a talking-head or podcast clip. Prioritize subtle whooshes on "
        "jump cuts, light UI pops on any text overlays or lower thirds, and one or two "
        "emphasis stingers for key statements. Keep sounds minimal and unobtrusive.\n\n"
    ),
    "lifestyle": (
        "This video is lifestyle, cooking, or ASMR-adjacent content. Prioritize rich "
        "environmental Foley (sizzling, pouring, chopping), gentle ambient beds, soft "
        "breathy whooshes on transitions, and warm tonal dings. Keep everything organic "
        "and satisfying.\n\n"
    ),
}

SYSTEM_PROMPT = """You are a sound designer specializing in short-form video content — TikTok, Reels, YouTube Shorts, and social media clips.

Your descriptions are sent directly to an AI sound effect generator. Their precision determines whether the output is usable or garbage.

# Analysis method — two passes

## Pass 1: Understand the video (watch the whole thing first)

Before picking any individual sound events, watch the ENTIRE video and determine:

1. **What is this video?** — tech tutorial, vlog, product demo, short film, talking head, cinematic B-roll, meme/skit, interview, screen recording, montage, etc.
2. **What is the narrative arc?** — How does it open? Where are the major cuts? What's the climactic moment? How does it end?
3. **What is the pacing?** — Fast-cut social? Slow cinematic? Casual talking-head?
4. **What physical actions are visible?** — Scan for ALL visible physical interactions: hands touching objects, people walking, doors opening, objects being placed down, food being prepared, buttons being pressed, clothing rustling. These are Foley opportunities.
5. **What text/graphics appear?** — Scan frame by frame for ANY text overlay, caption, lower third, emoji, sticker, animated graphic, subscribe button, or visual annotation that appears or animates during the video.

## Pass 2: Detect ALL moments that need sound

IMPORTANT — Detect first, categorize later. Scan for these in order:

1. **Every text/caption/graphic appearance** — ANY time text appears, animates, slides in, pops up, or changes on screen. This includes subtitles, captions, titles, bullet points, labels, arrows, emojis, stickers, and subscribe/like prompts. Each one gets a `ui_pop` or `ui_slide` event.
2. **Every visible physical action** — hands clapping, objects colliding, footsteps, doors, typing, eating, drinking, touching surfaces. Each gets a Foley event.
3. **Major scene changes** — hard cuts where the visual context shifts. These get transitions. NOT every cut — only major changes.
4. **Emotional beats** — punchlines, reveals, dramatic pauses. These get stingers or dings.
5. **Atmosphere changes** — new environments that feel sonically empty.

# DIVERSITY RULES — CRITICAL

Your output MUST contain a MIX of different event types. A good sound design has variety.

**Hard limits per category (for clips under 60s):**
- `whoosh`: maximum 3. Do NOT put a whoosh on every cut.
- `ui_pop` + `ui_slide`: at least 2 if ANY text/graphics are visible in the video.
- Foley types (`impact`, `footstep`, `door`, `button_click`, `body`, `environment`): at least 2 if ANY physical actions are visible.
- No single event_type should appear more than 4 times.

**Each event MUST have a unique description.** Do not reuse the same description for multiple events. Even if two events are the same type (e.g., two whooshes), their descriptions must differ — describe what's specifically happening at each moment.

# Event types

Pick the CLOSEST match from this table:

| Type | When to use |
|------|-------------|
| `whoosh` | MAJOR scene change only — not every cut. Max 3. |
| `riser` | Building tension before a reveal, drop, or punchline |
| `reverse_hit` | Decaying resolve, outro settle, energy winding down |
| `stinger` | Bass drop, impact hit, dramatic beat on a punchline or reveal |
| `ding` | Positive ping, confirmation tone, bright accent on key moment |
| `ui_pop` | Text appearing, caption popping up, emoji/sticker appearing, callout snapping in |
| `ui_slide` | Lower third sliding in, text scrolling, panel motion, progress bar |
| `impact` | Object collision, hit, punch, drop, slap |
| `footstep` | Walking, running, stepping — when feet are visible |
| `door` | Door, gate, hatch, lid — open/close |
| `button_click` | Mouse click, keyboard press, phone tap, switch toggle |
| `body` | Hand clap, finger snap, slap on desk, body movement |
| `environment` | Water, wind, fire, cooking sounds, animals, vehicles, machinery, or any natural/physical source not covered above |
| `ambient` | Room tone, atmosphere, background bed (3.0–4.0s duration) |
| `meme_sfx` | Comedic highlight sound — dramatic bass boom, crowd laughter, exaggerated gasp, record scratch, sad trombone, questioning "huh?", comedic fail buzzer. Describe the actual sound for generation, NOT a library reference. |

# Description rules

- 15–30 words per description.
- For Foley: specify material + object, action + force, environment, and perspective.
- For editorial sounds: use sound design language (attack, tail, transient, reverb, etc.)
- For screen/device interactions: describe the PHYSICAL HARDWARE, not the digital interface.
- Each description must be unique — never copy-paste the same description.

# Timing and duration

- **whoosh**: At the frame of the cut. Duration: 0.3–1.0s (fast) to 1.0–2.0s (cinematic).
- **riser**: 1–3s BEFORE the peak moment. Duration: 1.5–4.0s.
- **reverse_hit**: At the resolution. Duration: 0.5–2.0s.
- **stinger / ding**: At the exact frame of emphasis. Duration: 0.3–1.5s.
- **ui_pop / ui_slide**: At the frame the graphic first appears. Duration: 0.3–0.8s.
- **Foley**: At the frame of physical contact. Duration: 0.3–4.0s depending on action.
- **ambient**: First frame of scene. Duration: 3.0–4.0s.
- **meme_sfx**: At the comedic beat. Duration: 0.5–2.0s.

# Output

Return ONLY a valid JSON array. No markdown, no explanation.

[
  {
    "timestamp_seconds": <float>,
    "event_type": "<one of the types above>",
    "description": "<unique 15-30 word description>",
    "estimated_duration_seconds": <float between 0.3 and 4.0>
  }
]

If no sound events are appropriate, return: []
"""


def _post_process_events(raw_events: list, video_duration: float) -> List[SFXEvent]:
    """Sort, deduplicate, enforce gap and density constraints."""
    # Detect if Gemini returned normalized timestamps (0-1 range) instead of seconds.
    # If the video is longer than 2s and ALL timestamps are under 1.0, scale them.
    if raw_events and video_duration > 2.0:
        max_ts = max(float(e.get("timestamp_seconds", 0)) for e in raw_events)
        if max_ts <= 1.0:
            print(f"[llm_analyzer] Detected normalized timestamps (max={max_ts:.2f}), "
                  f"scaling by video duration {video_duration:.1f}s")
            for ev in raw_events:
                ev["timestamp_seconds"] = float(ev["timestamp_seconds"]) * video_duration

    events = sorted(raw_events, key=lambda e: e["timestamp_seconds"])

    # Cap total events: 15 per 60s, minimum 15 for clips under 60s
    max_events = max(15, int((video_duration / 60.0) * 15))

    filtered = []
    last_ts = -999.0
    window_events: list[float] = []  # timestamps in current 3s window

    for ev in events:
        ts = float(ev["timestamp_seconds"])
        dur = max(0.3, min(4.0, float(ev.get("estimated_duration_seconds", 1.0))))

        # Skip events outside video bounds
        if ts < 0 or ts >= video_duration:
            continue

        # Enforce max events cap (15 per 60s)
        if len(filtered) >= max_events:
            break

        # Ambient events are exempt from gap and density rules — they layer
        event_type_str = ev.get("event_type", "environment")
        is_ambient = event_type_str == "ambient"

        if not is_ambient:
            # Enforce minimum 0.5s gap
            if ts - last_ts < 0.5:
                continue

            # Enforce max 3 events per 3s window
            window_events = [t for t in window_events if ts - t < 3.0]
            if len(window_events) >= 3:
                continue

        # Validate event_type
        if event_type_str not in ALLOWED_CATEGORIES:
            event_type_str = "environment"  # default to open catch-all

        description = ev.get("description", "generic sound effect")

        # Strip "LIBRARY:" prefix if Gemini still uses it — rewrite to a generatable description
        if description.upper().startswith("LIBRARY:"):
            description = description.split("—")[-1].strip() if "—" in description else description[8:].strip()
            if not description or len(description) < 5:
                description = "dramatic comedic impact hit, short and punchy, close-up"

        filtered.append(SFXEvent(
            sfx_id=str(uuid.uuid4()),
            timestamp_seconds=round(ts, 2),
            event_type=EventType(event_type_str),
            description=description,
            estimated_duration_seconds=round(dur, 2),
        ))

        if not is_ambient:
            last_ts = ts
            window_events.append(ts)

    # Diversity filter: cap any single event_type at 30% of total (min 3)
    from collections import Counter
    type_counts = Counter(e.event_type.value for e in filtered)
    max_per_type = max(3, int(len(filtered) * 0.3))
    diverse = []
    running_counts: dict[str, int] = {}
    for ev in filtered:
        t = ev.event_type.value
        running_counts[t] = running_counts.get(t, 0) + 1
        if running_counts[t] <= max_per_type:
            diverse.append(ev)
        else:
            print(f"[llm_analyzer] Diversity filter: dropped excess {t} at {ev.timestamp_seconds}s")

    if len(diverse) < len(filtered):
        print(f"[llm_analyzer] Diversity filter: {len(filtered)} → {len(diverse)} events")

    return diverse


async def analyze_video(video_path: str, job_id: str, style: str = "auto") -> List[SFXEvent]:
    """Upload video to Gemini File API and analyze for SFX moments."""
    loop = asyncio.get_event_loop()

    # Get video duration and scene changes upfront
    from services.video_processor import get_video_metadata, detect_scene_changes
    try:
        meta = get_video_metadata(video_path)
        video_duration = meta["duration"]
    except Exception:
        video_duration = 3600.0  # fallback

    print(f"[llm_analyzer] Video duration: {video_duration}s")

    # Detect scene changes via FFmpeg
    try:
        scene_timestamps = detect_scene_changes(video_path)
        print(f"[llm_analyzer] FFmpeg detected {len(scene_timestamps)} scene changes: {scene_timestamps}")
    except Exception as e:
        print(f"[llm_analyzer] Scene detection failed: {e}")
        scene_timestamps = []

    # Build the context-aware prompt
    duration_context = (
        f"\n\n# Video metadata\n\n"
        f"This video is {video_duration:.1f} seconds long. "
        f"Your timestamps MUST span the full range from 0.0 to {video_duration:.1f} seconds. "
        f"Do NOT cluster all events at the beginning. "
        f"Watch the ENTIRE video from start to finish and place events at the actual moments they occur throughout the full {video_duration:.1f}-second duration. "
        f"You should have events in the first third (0–{video_duration / 3:.1f}s), "
        f"middle third ({video_duration / 3:.1f}–{video_duration * 2 / 3:.1f}s), "
        f"and final third ({video_duration * 2 / 3:.1f}–{video_duration:.1f}s) of the video."
    )

    # Add scene change anchors if detected
    if scene_timestamps:
        scene_list = ", ".join(f"{t:.1f}s" for t in scene_timestamps)
        duration_context += (
            f"\n\n# Detected scene changes\n\n"
            f"FFmpeg detected visual scene changes at these timestamps: [{scene_list}]. "
            f"Use these as anchor points for transition sounds (whoosh/riser/reverse_hit). "
            f"You do NOT need a whoosh at every one — only at major context shifts. "
            f"Also look for text/captions and physical actions BETWEEN these cuts — "
            f"those are where ui_pop, ui_slide, and Foley events should go."
        )

    style_prefix = STYLE_MODIFIERS.get(style, "")
    full_prompt = style_prefix + SYSTEM_PROMPT + duration_context

    def _upload_and_analyze():
        # Upload file to Google File API
        print(f"[llm_analyzer] Uploading {video_path} to Google File API...")
        video_file = client.files.upload(
            file=video_path,
            config={"mime_type": "video/mp4"},
        )

        # Wait for processing
        while video_file.state.name == "PROCESSING":
            time.sleep(2)
            video_file = client.files.get(name=video_file.name)

        if video_file.state.name == "FAILED":
            raise RuntimeError("Google File API failed to process video")

        print(f"[llm_analyzer] File ready: {video_file.uri}")

        response = client.models.generate_content(
            model="gemini-3.1-pro-preview",
            contents=[video_file],
            config=types.GenerateContentConfig(
                system_instruction=full_prompt,
                response_mime_type="application/json",
                temperature=0.4,
            ),
        )

        # Clean up uploaded file
        try:
            client.files.delete(name=video_file.name)
        except Exception:
            pass

        return response.text

    raw_text = await loop.run_in_executor(None, _upload_and_analyze)

    # Save full Gemini response to a debug file for inspection
    debug_path = TEMP_DIR / job_id / "gemini_response.json"
    debug_path.parent.mkdir(parents=True, exist_ok=True)
    debug_path.write_text(raw_text)
    print(f"[llm_analyzer] Raw Gemini response saved to {debug_path}")
    print(f"[llm_analyzer] Raw Gemini response:\n{raw_text[:2000]}")

    try:
        raw_events = json.loads(raw_text)
        if not isinstance(raw_events, list):
            raw_events = []
    except json.JSONDecodeError:
        # Try to extract JSON array from text
        import re
        match = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if match:
            raw_events = json.loads(match.group())
        else:
            raw_events = []

    print(f"[llm_analyzer] Parsed {len(raw_events)} raw events from Gemini")
    for i, ev in enumerate(raw_events):
        print(f"[llm_analyzer]   [{i}] ts={ev.get('timestamp_seconds')} "
              f"type={ev.get('event_type')} dur={ev.get('estimated_duration_seconds')} "
              f"desc={ev.get('description', '')[:60]}")

    filtered = _post_process_events(raw_events, video_duration)
    print(f"[llm_analyzer] After post-processing: {len(filtered)} events (from {len(raw_events)} raw)")

    return filtered
