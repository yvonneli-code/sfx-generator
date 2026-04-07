export type EventType =
  | "whoosh"
  | "riser"
  | "reverse_hit"
  | "stinger"
  | "ding"
  | "ui_pop"
  | "ui_slide"
  | "impact"
  | "footstep"
  | "door"
  | "button_click"
  | "body"
  | "environment"
  | "ambient"
  | "meme_sfx";

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
  // Transition — cyan/blue family
  whoosh:       "#06b6d4",
  riser:        "#0ea5e9",
  reverse_hit:  "#38bdf8",

  // Emphasis — warm/hot family
  stinger:      "#f43f5e",
  ding:         "#fbbf24",

  // UI / Graphics — green family
  ui_pop:       "#a3e635",
  ui_slide:     "#34d399",

  // Foley — orange/red family
  impact:       "#ef4444",
  footstep:     "#f97316",
  door:         "#eab308",
  button_click: "#10b981",
  body:         "#ec4899",
  environment:  "#8b5cf6",

  // Ambient — neutral
  ambient:      "#64748b",

  // Comedic — amber
  meme_sfx:     "#f59e0b",
};
