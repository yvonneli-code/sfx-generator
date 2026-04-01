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

ALLOWED_CATEGORIES = [
    "impact", "footstep", "door", "explosion", "whoosh", "creak",
    "glass_break", "water_splash", "button_click", "slide",
    "crowd_reaction", "animal", "vehicle", "wind", "fire"
]

SYSTEM_PROMPT = """You are a professional sound designer analyzing a video to add sound effects.

Your task: identify moments in this video that would benefit from a sound effect.

ALLOWED EVENT CATEGORIES (use exactly one per event):
impact, footstep, door, explosion, whoosh, creak, glass_break, water_splash, button_click, slide, crowd_reaction, animal, vehicle, wind, fire

RULES:
- Only include sounds a viewer would NOTICE if absent — be selective
- Minimum 1 second gap between events
- Maximum 6 events total for clips under 1 minute; scale proportionally for longer clips
- For description, use format: "[qualifier] [object] [action] [environment]"
  Examples: "heavy wooden door slamming shut in an interior hallway"
            "light footsteps on dry gravel path outdoors"
            "sharp metallic impact on hollow steel surface"

OUTPUT: Return ONLY a valid JSON array. No markdown, no explanation.
[
  {
    "timestamp_seconds": <float>,
    "event_type": "<one of the allowed categories>",
    "description": "<precise ElevenLabs description>",
    "estimated_duration_seconds": <float between 0.3 and 4.0>
  }
]

If no clear SFX moments exist, return an empty array: []
"""


def _post_process_events(raw_events: list, video_duration: float) -> List[SFXEvent]:
    """Sort, deduplicate, enforce gap and density constraints."""
    events = sorted(raw_events, key=lambda e: e["timestamp_seconds"])

    filtered = []
    last_ts = -999.0
    window_events: list[float] = []  # timestamps in current 3s window

    for ev in events:
        ts = float(ev["timestamp_seconds"])
        dur = max(0.3, min(4.0, float(ev.get("estimated_duration_seconds", 1.0))))

        # Skip events outside video bounds
        if ts < 0 or ts >= video_duration:
            continue

        # Enforce minimum 0.5s gap
        if ts - last_ts < 0.5:
            continue

        # Enforce max 2 events per 3s window
        window_events = [t for t in window_events if ts - t < 3.0]
        if len(window_events) >= 2:
            continue

        # Validate event_type
        event_type_str = ev.get("event_type", "impact")
        if event_type_str not in ALLOWED_CATEGORIES:
            event_type_str = "impact"

        filtered.append(SFXEvent(
            sfx_id=str(uuid.uuid4()),
            timestamp_seconds=round(ts, 2),
            event_type=EventType(event_type_str),
            description=ev.get("description", "generic sound effect"),
            estimated_duration_seconds=round(dur, 2),
        ))
        last_ts = ts
        window_events.append(ts)

    return filtered


async def analyze_video(video_path: str, job_id: str) -> List[SFXEvent]:
    """Upload video to Gemini File API and analyze for SFX moments."""
    loop = asyncio.get_event_loop()

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
            model="gemini-2.5-flash",
            contents=[video_file],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )

        # Clean up uploaded file
        try:
            client.files.delete(name=video_file.name)
        except Exception:
            pass

        return response.text

    raw_text = await loop.run_in_executor(None, _upload_and_analyze)

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

    # Get video duration for bounds checking
    from services.video_processor import get_video_metadata
    try:
        meta = get_video_metadata(video_path)
        video_duration = meta["duration"]
    except Exception:
        video_duration = 3600.0  # fallback

    return _post_process_events(raw_events, video_duration)
