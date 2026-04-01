from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class EventType(str, Enum):
    impact = "impact"
    footstep = "footstep"
    door = "door"
    explosion = "explosion"
    whoosh = "whoosh"
    creak = "creak"
    glass_break = "glass_break"
    water_splash = "water_splash"
    button_click = "button_click"
    slide = "slide"
    crowd_reaction = "crowd_reaction"
    animal = "animal"
    vehicle = "vehicle"
    wind = "wind"
    fire = "fire"


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
    event_type: str = "impact"


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


class LoadProjectResponse(BaseModel):
    job_id: str
    events: List[SFXEvent]
