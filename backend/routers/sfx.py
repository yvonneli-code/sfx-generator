from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import uuid
from services.sfx_generator import generate_sfx_for_events, _generate_single_sfx
from models import GenerateSFXResponse, RegenerateRequest, AddSFXRequest, ExploreRequest, ApplyExplorationRequest, SFXEvent
from typing import List

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent / "temp"


@router.post("/generate-sfx/{job_id}", response_model=GenerateSFXResponse)
async def generate_sfx(job_id: str, events: List[SFXEvent]):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        updated_events = await generate_sfx_for_events(job_id, events)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return GenerateSFXResponse(job_id=job_id, events=updated_events)


@router.post("/regenerate-sfx/{job_id}/{sfx_id}")
async def regenerate_sfx(job_id: str, sfx_id: str, req: RegenerateRequest):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        await _generate_single_sfx(job_id, sfx_id, req.description, req.duration_seconds, force=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"sfx_url": f"/sfx/{job_id}/{sfx_id}"}


@router.post("/add-sfx/{job_id}")
async def add_sfx(job_id: str, req: AddSFXRequest):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    sfx_id = str(uuid.uuid4())
    try:
        await _generate_single_sfx(job_id, sfx_id, req.description, req.duration_seconds)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "sfx_id": sfx_id,
        "timestamp_seconds": req.timestamp_seconds,
        "event_type": req.event_type,
        "description": req.description,
        "estimated_duration_seconds": req.duration_seconds,
        "sfx_url": f"/sfx/{job_id}/{sfx_id}",
    }


@router.post("/explore-sfx/{job_id}")
async def explore_sfx(job_id: str, req: ExploreRequest):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    explore_id = str(uuid.uuid4())
    try:
        await _generate_single_sfx(job_id, explore_id, req.description, req.duration_seconds, force=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"explore_id": explore_id, "sfx_url": f"/sfx/{job_id}/{explore_id}"}


@router.post("/apply-exploration/{job_id}")
async def apply_exploration(job_id: str, req: ApplyExplorationRequest):
    import shutil
    explore_path = TEMP_DIR / job_id / "sfx" / f"{req.explore_id}.mp3"
    target_path = TEMP_DIR / job_id / "sfx" / f"{req.target_sfx_id}.mp3"
    if not explore_path.exists():
        raise HTTPException(status_code=404, detail="Exploration file not found")
    shutil.copy2(explore_path, target_path)
    return {"sfx_url": f"/sfx/{job_id}/{req.target_sfx_id}"}


@router.get("/sfx/{job_id}/{sfx_id}")
async def serve_sfx(job_id: str, sfx_id: str):
    sfx_path = TEMP_DIR / job_id / "sfx" / f"{sfx_id}.mp3"
    if not sfx_path.exists():
        raise HTTPException(status_code=404, detail="SFX file not found")
    return FileResponse(str(sfx_path), media_type="audio/mpeg")
