import os
import hashlib
import asyncio
from pathlib import Path
from typing import List

import httpx
from dotenv import load_dotenv

from models import SFXEvent

load_dotenv(Path(__file__).parent.parent / ".env")

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/sound-generation"

TEMP_DIR = Path(__file__).parent.parent / "temp"


def _cache_key(description: str, duration: float) -> str:
    raw = f"{description}|{round(duration, 1)}"
    return hashlib.md5(raw.encode()).hexdigest()


async def _generate_single_sfx(
    job_id: str,
    sfx_id: str,
    description: str,
    duration: float,
    force: bool = False,
) -> str:
    """Generate one SFX via ElevenLabs and return local file path."""
    sfx_dir = TEMP_DIR / job_id / "sfx"
    sfx_dir.mkdir(parents=True, exist_ok=True)

    output_path = sfx_dir / f"{sfx_id}.mp3"

    # Check global cache directory
    cache_dir = TEMP_DIR / "_cache"
    cache_dir.mkdir(exist_ok=True)
    cache_file = cache_dir / f"{_cache_key(description, duration)}.mp3"

    if not force and cache_file.exists():
        import shutil
        shutil.copy2(cache_file, output_path)
        return str(output_path)

    print(f"[sfx_generator] POST {ELEVENLABS_URL} | key=...{ELEVENLABS_API_KEY[-6:]} | desc={description!r} | dur={round(duration,1)}")
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            ELEVENLABS_URL,
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "text": description,
                "duration_seconds": round(duration, 1),
                "prompt_influence": 0.3,
            },
        )
        print(f"[sfx_generator] Response {response.status_code} | content-type={response.headers.get('content-type')} | body={response.text[:300] if not response.is_success else '<audio bytes>'}")
        if not response.is_success:
            raise RuntimeError(
                f"ElevenLabs error {response.status_code}: {response.text}"
            )
        audio_bytes = response.content

    # Save to output and apply fade-out trim
    output_path.write_bytes(audio_bytes)
    _apply_fade_out(str(output_path), duration)

    # Cache the processed audio (after fade-out)
    import shutil
    shutil.copy2(output_path, cache_file)

    return str(output_path)


def _apply_fade_out(path: str, duration: float):
    """Trim and apply 0.1s fade-out to prevent abrupt cutoff."""
    import subprocess
    import shutil

    tmp_path = path + ".tmp.mp3"
    fade_start = max(0.0, duration - 0.1)
    cmd = [
        "ffmpeg", "-y", "-i", path,
        "-af", f"atrim=duration={duration},afade=t=out:st={fade_start}:d=0.1",
        "-c:a", "libmp3lame", "-q:a", "2",
        tmp_path,
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode == 0:
        shutil.move(tmp_path, path)


async def generate_sfx_for_events(job_id: str, events: List[SFXEvent]) -> List[SFXEvent]:
    """Generate SFX for all events with limited concurrency and retry."""
    semaphore = asyncio.Semaphore(3)

    async def _generate_with_limit(ev: SFXEvent) -> str:
        async with semaphore:
            for attempt in range(3):
                try:
                    return await _generate_single_sfx(
                        job_id, ev.sfx_id, ev.description, ev.estimated_duration_seconds
                    )
                except Exception as e:
                    if attempt == 2:
                        raise
                    wait = 2 ** attempt
                    print(f"[sfx_generator] Retry {attempt + 1} for {ev.sfx_id} after {wait}s: {e}")
                    await asyncio.sleep(wait)

    tasks = [_generate_with_limit(ev) for ev in events]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    updated = []
    for ev, result in zip(events, results):
        if isinstance(result, Exception):
            print(f"[sfx_generator] Failed for {ev.sfx_id}: {result}")
            updated.append(ev)
        else:
            updated.append(ev.model_copy(update={"sfx_url": f"/sfx/{job_id}/{ev.sfx_id}"}))

    return updated
