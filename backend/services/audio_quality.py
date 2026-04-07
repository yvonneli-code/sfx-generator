import numpy as np
from pydub import AudioSegment

from models import SFXEvent

# Event types grouped by expected energy profile shape
TRANSIENT_TYPES = {"impact", "button_click", "body", "ui_pop", "ding"}
SUSTAINED_TYPES = {"ambient", "environment"}
TRANSITION_TYPES = {"whoosh", "ui_slide"}
RISER_TYPES = {"riser"}
DECAY_TYPES = {"reverse_hit", "stinger"}

# Thresholds
CLIPPING_THRESHOLD_DB = -0.5  # within 0.5 dB of 0 dBFS
CLIPPING_MAX_RATIO = 0.05     # reject if > 5% of samples clipped
SILENCE_THRESHOLD_DB = -40.0
SILENCE_MAX_RATIO = 0.50      # reject if > 50% silent
SILENCE_MAX_RATIO_SHORT = 0.60  # allow 60% for very short events (< 0.5s)
DURATION_MIN_RATIO = 0.40     # reject if actual < 40% of expected
DURATION_MAX_RATIO = 2.50     # reject if actual > 250% of expected


def _samples_to_float(audio: AudioSegment) -> np.ndarray:
    """Convert pydub AudioSegment to float64 numpy array normalized to [-1, 1]."""
    samples = np.array(audio.get_array_of_samples(), dtype=np.float64)
    max_val = float(2 ** (audio.sample_width * 8 - 1))
    return samples / max_val


def _rms_energy(samples: np.ndarray) -> float:
    """Calculate RMS energy of a sample array."""
    if len(samples) == 0:
        return 0.0
    return float(np.sqrt(np.mean(samples ** 2)))


def _check_clipping(samples: np.ndarray) -> tuple[float, str | None]:
    """Check for clipping. Returns (ratio, rejection_reason or None)."""
    if len(samples) == 0:
        return 0.0, None
    # Clipping threshold in linear amplitude (0.5 dB below full scale)
    clip_threshold = 10 ** (CLIPPING_THRESHOLD_DB / 20)  # ~0.944
    clipped = np.sum(np.abs(samples) >= clip_threshold)
    ratio = float(clipped / len(samples))
    reason = None
    if ratio > CLIPPING_MAX_RATIO:
        reason = f"clipping: {ratio:.1%} of samples clipped (threshold: {CLIPPING_MAX_RATIO:.0%})"
    return ratio, reason


def _check_silence(samples: np.ndarray, sample_rate: int, expected_duration: float) -> tuple[float, str | None]:
    """Check silence ratio. Returns (ratio, rejection_reason or None)."""
    if len(samples) == 0:
        return 1.0, "silence: empty audio"
    # Silence threshold in linear amplitude
    silence_threshold = 10 ** (SILENCE_THRESHOLD_DB / 20)  # ~0.01
    silent = np.sum(np.abs(samples) < silence_threshold)
    ratio = float(silent / len(samples))
    max_ratio = SILENCE_MAX_RATIO_SHORT if expected_duration < 0.5 else SILENCE_MAX_RATIO
    reason = None
    if ratio > max_ratio:
        reason = f"silence: {ratio:.1%} of audio is silent (threshold: {max_ratio:.0%})"
    return ratio, reason


def _check_duration(actual_duration: float, expected_duration: float) -> tuple[float, str | None]:
    """Check duration match. Returns (ratio, rejection_reason or None)."""
    if expected_duration <= 0:
        return 1.0, None
    ratio = actual_duration / expected_duration
    reason = None
    if ratio < DURATION_MIN_RATIO:
        reason = f"duration: actual {actual_duration:.2f}s is {ratio:.0%} of expected {expected_duration:.2f}s (min: {DURATION_MIN_RATIO:.0%})"
    elif ratio > DURATION_MAX_RATIO:
        reason = f"duration: actual {actual_duration:.2f}s is {ratio:.0%} of expected {expected_duration:.2f}s (max: {DURATION_MAX_RATIO:.0%})"
    return ratio, reason


def _score_energy_profile(samples: np.ndarray, event_type: str) -> float:
    """Score how well the energy profile matches the expected shape for this event type.
    Returns 0.0 (bad match) to 1.0 (good match). This is a soft check — never rejects."""
    if len(samples) < 3:
        return 0.5  # not enough data to judge

    third = len(samples) // 3
    e1 = _rms_energy(samples[:third])
    e2 = _rms_energy(samples[third:2 * third])
    e3 = _rms_energy(samples[2 * third:])
    total = e1 + e2 + e3

    if total < 1e-10:
        return 0.0  # effectively silent

    r1, r2, r3 = e1 / total, e2 / total, e3 / total

    if event_type in TRANSIENT_TYPES:
        # Front-loaded: first third should have most energy
        # Ideal: r1 > r2 > r3, with r1 > 0.4
        score = min(1.0, r1 / 0.4) * 0.7 + (1.0 if r1 > r2 > r3 else 0.0) * 0.3

    elif event_type in SUSTAINED_TYPES:
        # Even: all thirds roughly equal
        # Ideal: each ~0.33, penalize deviation
        deviation = abs(r1 - 0.333) + abs(r2 - 0.333) + abs(r3 - 0.333)
        score = max(0.0, 1.0 - deviation * 2)

    elif event_type in TRANSITION_TYPES:
        # Peak in middle: r2 should be highest
        # Ideal: r2 > r1 and r2 > r3
        score = min(1.0, r2 / 0.4) * 0.7 + (1.0 if r2 > r1 and r2 > r3 else 0.0) * 0.3

    elif event_type in RISER_TYPES:
        # Increasing: last third should have most energy
        # Ideal: r3 > r2 > r1
        score = min(1.0, r3 / 0.4) * 0.7 + (1.0 if r3 > r2 > r1 else 0.0) * 0.3

    elif event_type in DECAY_TYPES:
        # Front-loaded decay: first third dominant, then falling
        # Same as transient shape
        score = min(1.0, r1 / 0.4) * 0.7 + (1.0 if r1 > r2 > r3 else 0.0) * 0.3

    else:
        # Unknown type — no expectation
        score = 0.5

    return round(score, 3)


def score_audio_quality(audio_path: str, event: SFXEvent) -> dict:
    """Analyze a generated audio file and return quality metrics.

    Returns:
        {
            "passed": bool,
            "scores": {
                "clipping": float,
                "silence_ratio": float,
                "duration_match": float,
                "energy_profile": float,
            },
            "rejection_reasons": list[str],
        }
    """
    audio = AudioSegment.from_file(audio_path)
    samples = _samples_to_float(audio)
    actual_duration = audio.duration_seconds

    rejection_reasons = []

    clipping_ratio, clip_reason = _check_clipping(samples)
    if clip_reason:
        rejection_reasons.append(clip_reason)

    silence_ratio, silence_reason = _check_silence(
        samples, audio.frame_rate, event.estimated_duration_seconds
    )
    if silence_reason:
        rejection_reasons.append(silence_reason)

    duration_ratio, dur_reason = _check_duration(actual_duration, event.estimated_duration_seconds)
    if dur_reason:
        rejection_reasons.append(dur_reason)

    energy_score = _score_energy_profile(samples, event.event_type)

    return {
        "passed": len(rejection_reasons) == 0,
        "scores": {
            "clipping": round(clipping_ratio, 4),
            "silence_ratio": round(silence_ratio, 4),
            "duration_match": round(duration_ratio, 4),
            "energy_profile": round(energy_score, 4),
        },
        "rejection_reasons": rejection_reasons,
    }


def pick_best(candidates: list[tuple[str, dict]]) -> tuple[str, dict]:
    """Given a list of (audio_path, quality_report) tuples, pick the best one.

    Prefers passed candidates. Among ties, picks highest energy_profile score.
    If none passed, picks the one with fewest rejection reasons.
    """
    if len(candidates) == 1:
        return candidates[0]

    passed = [(p, r) for p, r in candidates if r["passed"]]
    if passed:
        # Pick best energy profile among those that passed
        return max(passed, key=lambda x: x[1]["scores"]["energy_profile"])

    # None passed — pick least bad (fewest rejection reasons, then best energy)
    return min(
        candidates,
        key=lambda x: (len(x[1]["rejection_reasons"]), -x[1]["scores"]["energy_profile"]),
    )
