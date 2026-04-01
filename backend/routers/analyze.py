from pathlib import Path
from fastapi import APIRouter, HTTPException
from services.llm_analyzer import analyze_video
from models import AnalyzeResponse

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent / "temp"


@router.post("/analyze/{job_id}", response_model=AnalyzeResponse)
async def analyze_job(job_id: str):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        events = await analyze_video(str(video_path), job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return AnalyzeResponse(job_id=job_id, events=events)
