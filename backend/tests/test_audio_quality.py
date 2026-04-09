"""Tests for audio quality gate using synthetic audio from pydub.generators."""

import sys
import os
import tempfile

import pytest
from pydub import AudioSegment
from pydub.generators import Sine, WhiteNoise

# Add backend to path so we can import models and services
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import SFXEvent, EventType
from services.audio_quality import score_audio_quality, pick_best


def _make_event(event_type: str = "impact", duration: float = 1.0) -> SFXEvent:
    return SFXEvent(
        sfx_id="test-id",
        timestamp_seconds=0.0,
        event_type=EventType(event_type),
        description="test sound",
        estimated_duration_seconds=duration,
    )


def _save(audio: AudioSegment) -> str:
    """Save audio to a temp file and return the path."""
    f = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    audio.export(f.name, format="mp3")
    return f.name


class TestClippingDetection:
    def test_full_scale_sine_fails(self):
        """A 0 dBFS sine wave should trigger clipping rejection."""
        # Generate a loud sine wave — pydub Sine generates at max amplitude
        audio = Sine(440).to_audio_segment(duration=1000)  # 1 second at max volume
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert report["scores"]["clipping"] > 0.0
            assert any("clipping" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)

    def test_quiet_sine_passes_clipping(self):
        """A quiet sine wave should not trigger clipping."""
        audio = Sine(440).to_audio_segment(duration=1000) - 20  # -20 dBFS
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert not any("clipping" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)


class TestSilenceDetection:
    def test_silent_file_fails(self):
        """A completely silent file should fail the silence check."""
        audio = AudioSegment.silent(duration=1000)  # 1 second of silence
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert report["scores"]["silence_ratio"] > 0.9
            assert any("silence" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)

    def test_short_blip_in_long_file_fails(self):
        """A brief sound in a mostly silent file should fail."""
        silence = AudioSegment.silent(duration=900)
        blip = Sine(440).to_audio_segment(duration=100) - 10
        audio = blip + silence  # 100ms sound + 900ms silence = 90% silent
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert report["scores"]["silence_ratio"] > 0.5
            assert any("silence" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)

    def test_normal_audio_passes_silence(self):
        """A file with consistent sound should pass the silence check."""
        audio = WhiteNoise().to_audio_segment(duration=1000) - 20
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert not any("silence" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)


class TestDurationMatch:
    def test_way_too_short_fails(self):
        """Audio much shorter than expected should fail."""
        audio = WhiteNoise().to_audio_segment(duration=200) - 20  # 0.2s
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=2.0))
            assert any("duration" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)

    def test_way_too_long_fails(self):
        """Audio much longer than expected should fail."""
        audio = WhiteNoise().to_audio_segment(duration=5000) - 20  # 5s
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert any("duration" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)

    def test_matching_duration_passes(self):
        """Audio with matching duration should pass."""
        audio = WhiteNoise().to_audio_segment(duration=1000) - 20
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert not any("duration" in r for r in report["rejection_reasons"])
        finally:
            os.unlink(path)


class TestEnergyProfile:
    def test_front_loaded_transient(self):
        """A front-loaded sound should score well as a transient event type."""
        loud = WhiteNoise().to_audio_segment(duration=300) - 5
        quiet = WhiteNoise().to_audio_segment(duration=700) - 30
        audio = loud + quiet
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(event_type="impact", duration=1.0))
            assert report["scores"]["energy_profile"] > 0.5
        finally:
            os.unlink(path)

    def test_even_ambient(self):
        """An even-energy sound should score well as an ambient event type."""
        audio = WhiteNoise().to_audio_segment(duration=3000) - 20
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(event_type="ambient", duration=3.0))
            assert report["scores"]["energy_profile"] > 0.5
        finally:
            os.unlink(path)

    def test_transient_scores_low_as_ambient(self):
        """A front-loaded transient should score poorly as ambient."""
        loud = WhiteNoise().to_audio_segment(duration=300) - 5
        quiet = WhiteNoise().to_audio_segment(duration=700) - 40
        audio = loud + quiet
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(event_type="ambient", duration=1.0))
            # Should score lower than a proper ambient sound
            assert report["scores"]["energy_profile"] < 0.7
        finally:
            os.unlink(path)


class TestNormalAudioPasses:
    def test_normal_audio_passes_all_checks(self):
        """A well-formed audio file should pass all quality checks."""
        audio = WhiteNoise().to_audio_segment(duration=1000) - 15
        path = _save(audio)
        try:
            report = score_audio_quality(path, _make_event(duration=1.0))
            assert report["passed"] is True
            assert report["rejection_reasons"] == []
        finally:
            os.unlink(path)


class TestPickBest:
    def test_picks_passed_over_failed(self):
        passed_report = {"passed": True, "scores": {"energy_profile": 0.5}, "rejection_reasons": []}
        failed_report = {"passed": False, "scores": {"energy_profile": 0.9}, "rejection_reasons": ["clipping"]}
        best_path, best_report = pick_best([("/a.mp3", failed_report), ("/b.mp3", passed_report)])
        assert best_path == "/b.mp3"

    def test_picks_better_energy_among_passed(self):
        r1 = {"passed": True, "scores": {"energy_profile": 0.3}, "rejection_reasons": []}
        r2 = {"passed": True, "scores": {"energy_profile": 0.8}, "rejection_reasons": []}
        best_path, _ = pick_best([("/a.mp3", r1), ("/b.mp3", r2)])
        assert best_path == "/b.mp3"

    def test_picks_least_bad_when_none_pass(self):
        r1 = {"passed": False, "scores": {"energy_profile": 0.5}, "rejection_reasons": ["clipping", "silence"]}
        r2 = {"passed": False, "scores": {"energy_profile": 0.5}, "rejection_reasons": ["clipping"]}
        best_path, _ = pick_best([("/a.mp3", r1), ("/b.mp3", r2)])
        assert best_path == "/b.mp3"
