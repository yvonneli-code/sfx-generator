import asyncio
import subprocess
from pathlib import Path
from fastapi import APIRouter, HTTPException

from google.genai import types
from models import DetectGenreResponse
from services.llm_analyzer import client, STYLE_MODIFIERS

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent / "temp"

GENRE_PROMPT = (
    "Look at this video frame. Classify the video into exactly ONE genre: "
    "skit, tutorial, cinematic, talking_head, lifestyle. "
    "Return ONLY the single genre word, nothing else."
)

VALID_GENRES = [k for k in STYLE_MODIFIERS if k != "auto"]


@router.post("/detect-genre/{job_id}", response_model=DetectGenreResponse)
async def detect_genre(job_id: str):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    frame_path = TEMP_DIR / job_id / "frame_0.jpg"

    # Extract first frame
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(video_path), "-vframes", "1",
             "-q:v", "2", str(frame_path)],
            capture_output=True, check=True,
        )
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=500, detail="Failed to extract frame")

    loop = asyncio.get_event_loop()

    def _classify():
        uploaded = client.files.upload(
            file=str(frame_path), config={"mime_type": "image/jpeg"}
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",  # keep flash for cheap genre detection
            contents=[uploaded, GENRE_PROMPT],
            config=types.GenerateContentConfig(temperature=0.1),
        )
        try:
            client.files.delete(name=uploaded.name)
        except Exception:
            pass
        return response.text.strip().lower()

    raw_genre = await loop.run_in_executor(None, _classify)

    # Validate against known genres
    genre = raw_genre if raw_genre in VALID_GENRES else "skit"

    return DetectGenreResponse(genre=genre)
