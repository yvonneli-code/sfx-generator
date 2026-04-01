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
