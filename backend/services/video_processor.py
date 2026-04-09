import subprocess
import json
from pathlib import Path


def get_video_metadata(video_path: str) -> dict:
    """Extract duration and basic metadata using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)

    duration = float(data["format"].get("duration", 0))
    width, height = 0, 0
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            width = stream.get("width", 0)
            height = stream.get("height", 0)
            break

    return {"duration": duration, "width": width, "height": height}


def detect_scene_changes(video_path: str, threshold: float = 0.3) -> list[float]:
    """Detect scene changes using FFmpeg's scene filter. Returns list of timestamps."""
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # Parse showinfo output for pts_time values
    timestamps = []
    for line in result.stderr.split("\n"):
        if "pts_time:" in line:
            try:
                pts = line.split("pts_time:")[1].split()[0]
                timestamps.append(round(float(pts), 2))
            except (IndexError, ValueError):
                continue
    return timestamps
