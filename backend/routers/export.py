from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from services.audio_mixer import mix_audio
from models import ExportRequest, ExportResponse

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent / "temp"


@router.post("/export/{job_id}", response_model=ExportResponse)
async def export_video(job_id: str, request: ExportRequest):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    output_path = await mix_audio(job_id, request.events)
    return ExportResponse(
        job_id=job_id,
        download_url=f"/download/{job_id}",
    )


@router.get("/download/{job_id}")
async def download_video(job_id: str):
    output_path = TEMP_DIR / job_id / "output.mp4"
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    return FileResponse(
        str(output_path),
        media_type="video/mp4",
        filename="sfx_output.mp4",
    )
