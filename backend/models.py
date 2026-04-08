from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class EventType(str, Enum):
    # Transition (editorial)
    whoosh = "whoosh"
    riser = "riser"
    reverse_hit = "reverse_hit"

    # Emphasis
    stinger = "stinger"
    ding = "ding"

    # UI / Motion graphics
    ui_pop = "ui_pop"
    ui_slide = "ui_slide"

    # Foley (physical)
    impact = "impact"
    footstep = "footstep"
    door = "door"
    button_click = "button_click"
    body = "body"
    environment = "environment"

    # Ambient
    ambient = "ambient"

    # Comedic (library only)
    meme_sfx = "meme_sfx"


class SFXEvent(BaseModel):
    sfx_id: str
    timestamp_seconds: float
    event_type: EventType
    description: str
    estimated_duration_seconds: float
    volume: float = 1.0
    sfx_url: Optional[str] = None


class JobStatus(BaseModel):
    job_id: str
    status: str  # "uploaded" | "analyzing" | "analyzed" | "generating" | "ready" | "exporting" | "done"
    video_url: Optional[str] = None
    events: Optional[List[SFXEvent]] = None
    download_url: Optional[str] = None
    error: Optional[str] = None


class AnalyzeRequest(BaseModel):
    style: str = "auto"


class AnalyzeResponse(BaseModel):
    job_id: str
    events: List[SFXEvent]


class GenerateSFXResponse(BaseModel):
    job_id: str
    events: List[SFXEvent]


class RegenerateRequest(BaseModel):
    description: str
    duration_seconds: float


class AddSFXRequest(BaseModel):
    description: str
    duration_seconds: float
    timestamp_seconds: float
    event_type: str = "environment"


class ExploreRequest(BaseModel):
    description: str
    duration_seconds: float


class ApplyExplorationRequest(BaseModel):
    target_sfx_id: str
    explore_id: str
    description: str


class ExportRequest(BaseModel):
    events: List[SFXEvent]


class ExportResponse(BaseModel):
    job_id: str
    download_url: str


class DetectGenreResponse(BaseModel):
    genre: str


class LoadProjectResponse(BaseModel):
    job_id: str
    events: List[SFXEvent]
