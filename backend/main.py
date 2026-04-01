from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path

from routers import upload, analyze, sfx, export, project

app = FastAPI(title="SFX Generator API", version="1.0.0")

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure temp directory exists
TEMP_DIR = Path(__file__).parent / "temp"
TEMP_DIR.mkdir(exist_ok=True)

# Mount temp directory for static file serving
app.mount("/files", StaticFiles(directory=str(TEMP_DIR)), name="files")

# Register routers
app.include_router(upload.router)
app.include_router(analyze.router)
app.include_router(sfx.router)
app.include_router(export.router)
app.include_router(project.router)


@app.get("/health")
def health():
    return {"status": "ok"}
