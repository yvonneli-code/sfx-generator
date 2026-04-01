import io
import json
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from models import ExportRequest, LoadProjectResponse, SFXEvent

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent / "temp"


@router.post("/save-project/{job_id}")
async def save_project(job_id: str, request: ExportRequest):
    video_path = TEMP_DIR / job_id / "video.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Video
        zf.write(video_path, "video.mp4")

        # SFX files
        for ev in request.events:
            sfx_path = TEMP_DIR / job_id / "sfx" / f"{ev.sfx_id}.mp3"
            if sfx_path.exists():
                zf.write(sfx_path, f"sfx/{ev.sfx_id}.mp3")

        # Events JSON — normalize sfx_url (strip cache-bust params)
        clean_events = []
        for ev in request.events:
            d = ev.model_dump()
            if d.get("sfx_url"):
                d["sfx_url"] = d["sfx_url"].split("?")[0]
            clean_events.append(d)
        zf.writestr("events.json", json.dumps(clean_events, indent=2))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{job_id}.sfxproject"'},
    )


@router.post("/load-project", response_model=LoadProjectResponse)
async def load_project(file: UploadFile = File(...)):
    content = await file.read()

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid project file")

    names = zf.namelist()
    if "events.json" not in names or "video.mp4" not in names:
        raise HTTPException(status_code=400, detail="Invalid project file: missing events.json or video.mp4")

    new_job_id = str(uuid.uuid4())
    job_dir = TEMP_DIR / new_job_id
    sfx_dir = job_dir / "sfx"
    sfx_dir.mkdir(parents=True, exist_ok=True)

    # Extract video
    (job_dir / "video.mp4").write_bytes(zf.read("video.mp4"))

    # Extract SFX files
    for name in names:
        if name.startswith("sfx/") and name.endswith(".mp3"):
            sfx_filename = Path(name).name
            (sfx_dir / sfx_filename).write_bytes(zf.read(name))

    # Parse and rewrite events
    raw_events = json.loads(zf.read("events.json"))
    events = []
    for raw in raw_events:
        ev = SFXEvent.model_validate(raw)
        if ev.sfx_url:
            sfx_id = ev.sfx_id
            ev = ev.model_copy(update={"sfx_url": f"/sfx/{new_job_id}/{sfx_id}"})
        events.append(ev)

    return LoadProjectResponse(job_id=new_job_id, events=events)
