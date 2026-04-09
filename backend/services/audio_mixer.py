import asyncio
import subprocess
from pathlib import Path
from typing import List

from models import SFXEvent

TEMP_DIR = Path(__file__).parent.parent / "temp"


async def mix_audio(job_id: str, events: List[SFXEvent]) -> str:
    """Mix SFX into the original video using FFmpeg filter_complex."""
    loop = asyncio.get_event_loop()
    output_path = await loop.run_in_executor(None, _mix_sync, job_id, events)
    return output_path


def _mix_sync(job_id: str, events: List[SFXEvent]) -> str:
    job_dir = TEMP_DIR / job_id
    video_path = str(job_dir / "video.mp4")
    output_path = str(job_dir / "output.mp4")

    # Filter out events that don't have a generated SFX file
    valid_events = []
    for ev in events:
        sfx_path = job_dir / "sfx" / f"{ev.sfx_id}.mp3"
        if sfx_path.exists():
            valid_events.append((ev, str(sfx_path)))

    if not valid_events:
        # No SFX — just copy the video
        subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-c", "copy", output_path],
            check=True,
            capture_output=True,
        )
        return output_path

    # Build ffmpeg command with filter_complex
    cmd = ["ffmpeg", "-y", "-i", video_path]

    # Add each SFX as an input
    for _, sfx_path in valid_events:
        cmd += ["-i", sfx_path]

    # Build filter_complex
    # Duck original audio to 70% so SFX at 30% are always audible
    SFX_BOOST = 3.0  # boost SFX volume so they sit at ~30% of mix
    ORIGINAL_DUCK = 0.7  # reduce original audio to make room

    filter_parts = []
    # Duck the original audio
    filter_parts.append(f"[0:a]volume={ORIGINAL_DUCK}[orig]")
    mix_labels = ["[orig]"]

    for idx, (ev, _) in enumerate(valid_events):
        input_idx = idx + 1
        label = f"[sfx{idx}]"
        delay_ms = int(ev.timestamp_seconds * 1000)
        duration = ev.estimated_duration_seconds

        vol = round(ev.volume * SFX_BOOST, 3)
        filter_parts.append(
            f"[{input_idx}:a]"
            f"atrim=duration={duration},"
            f"asetpts=PTS-STARTPTS,"
            f"volume={vol},"
            f"adelay={delay_ms}|{delay_ms}"
            f"{label}"
        )
        mix_labels.append(label)

    n_inputs = len(mix_labels)
    mix_inputs = "".join(mix_labels)
    filter_parts.append(
        f"{mix_inputs}amix=inputs={n_inputs}:duration=first:dropout_transition=2:normalize=0[aout]"
    )

    filter_complex = ";".join(filter_parts)

    cmd += [
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr}")

    return output_path
