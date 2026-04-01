import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent / "temp"


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    job_id = str(uuid.uuid4())
    job_dir = TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_path = job_dir / "video.mp4"
    content = await file.read()
    video_path.write_bytes(content)

    return {
        "job_id": job_id,
        "video_url": f"/video/{job_id}",
    }


@router.get("/video/{job_id}")
async def serve_video(job_id: str):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        headers={"Accept-Ranges": "bytes"},
    )
