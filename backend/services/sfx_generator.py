import os
import hashlib
import asyncio
import time
from pathlib import Path
from typing import List

import httpx
import jwt
from dotenv import load_dotenv

from models import SFXEvent

load_dotenv(Path(__file__).parent.parent / ".env")

KLING_ACCESS_KEY = os.environ.get("KLING_ACCESS_KEY", "")
KLING_SECRET_KEY = os.environ.get("KLING_SECRET_KEY", "")
KLING_BASE_URL = "https://api-singapore.klingai.com"

TEMP_DIR = Path(__file__).parent.parent / "temp"


def _kling_auth_token() -> str:
    """Generate a short-lived JWT for Kling API authentication."""
    now = int(time.time())
    payload = {
        "iss": KLING_ACCESS_KEY,
        "exp": now + 1800,
        "nbf": now - 5,
        "iat": now,
    }
    return jwt.encode(payload, KLING_SECRET_KEY, algorithm="HS256",
                      headers={"alg": "HS256", "typ": "JWT"})


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
    """Generate one SFX via Kling API and return local file path."""
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

    # Kling minimum duration is 3.0s; clamp up and trim after
    kling_duration = max(3.0, round(duration, 1))

    token = _kling_auth_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        # 1. Create task
        create_url = f"{KLING_BASE_URL}/v1/audio/text-to-audio"
        print(f"[sfx_generator] POST {create_url} | desc={description!r} | dur={kling_duration}")
        resp = await client.post(
            create_url,
            headers=headers,
            json={
                "prompt": description[:200],
                "duration": kling_duration,
            },
        )
        print(f"[sfx_generator] Create response {resp.status_code}: {resp.text[:300]}")
        if not resp.is_success:
            raise RuntimeError(f"Kling create-task error {resp.status_code}: {resp.text}")

        resp_data = resp.json()
        if resp_data.get("code") != 0:
            raise RuntimeError(f"Kling API error: {resp_data.get('message', resp.text)}")

        task_id = resp_data["data"]["task_id"]
        print(f"[sfx_generator] Task created: {task_id}")

        # 2. Poll for result
        poll_url = f"{KLING_BASE_URL}/v1/audio/text-to-audio/{task_id}"
        for _ in range(60):  # up to 120s at 2s intervals
            await asyncio.sleep(2)
            poll_resp = await client.get(poll_url, headers=headers)
            if not poll_resp.is_success:
                raise RuntimeError(f"Kling poll error {poll_resp.status_code}: {poll_resp.text}")

            poll_data = poll_resp.json()
            if poll_data.get("code") != 0:
                raise RuntimeError(f"Kling poll API error: {poll_data.get('message', poll_resp.text)}")

            data = poll_data["data"]
            status = data["task_status"]
            print(f"[sfx_generator] Poll {task_id}: {status}")

            if status in ("submitted", "processing"):
                continue
            if status == "failed":
                raise RuntimeError(f"Kling task failed: {data.get('task_status_msg', 'unknown')}")
            if status == "succeed":
                audio_url = data["task_result"]["audios"][0]["url_mp3"]
                break
        else:
            raise RuntimeError(f"Kling task {task_id} timed out after 120s")

        # 3. Download audio
        print(f"[sfx_generator] Downloading audio from {audio_url[:80]}...")
        audio_resp = await client.get(audio_url)
        if not audio_resp.is_success:
            raise RuntimeError(f"Failed to download audio: {audio_resp.status_code}")
        audio_bytes = audio_resp.content

    # Save to output and apply fade-out trim (using original target duration)
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
