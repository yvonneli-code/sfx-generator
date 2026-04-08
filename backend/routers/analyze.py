from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from services.llm_analyzer import analyze_video
from models import AnalyzeRequest, AnalyzeResponse

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent / "temp"


@router.post("/analyze/{job_id}", response_model=AnalyzeResponse)
async def analyze_job(job_id: str, request: Optional[AnalyzeRequest] = None):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    style = request.style if request else "auto"

    try:
        events = await analyze_video(str(video_path), job_id, style=style)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return AnalyzeResponse(job_id=job_id, events=events)
