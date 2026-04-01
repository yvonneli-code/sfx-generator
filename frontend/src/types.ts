export type EventType =
  | "impact"
  | "footstep"
  | "door"
  | "explosion"
  | "whoosh"
  | "creak"
  | "glass_break"
  | "water_splash"
  | "button_click"
  | "slide"
  | "crowd_reaction"
  | "animal"
  | "vehicle"
  | "wind"
  | "fire";

export interface SFXEvent {
  sfx_id: string;
  timestamp_seconds: number;
  event_type: EventType;
  description: string;
  estimated_duration_seconds: number;
  volume?: number;
  sfx_url?: string;
}

export const EVENT_COLORS: Record<EventType, string> = {
  impact: "#ef4444",
  footstep: "#f97316",
  door: "#eab308",
  explosion: "#dc2626",
  whoosh: "#06b6d4",
  creak: "#84cc16",
  glass_break: "#a855f7",
  water_splash: "#3b82f6",
  button_click: "#10b981",
  slide: "#f59e0b",
  crowd_reaction: "#ec4899",
  animal: "#14b8a6",
  vehicle: "#6366f1",
  wind: "#8b5cf6",
  fire: "#f97316",
};
