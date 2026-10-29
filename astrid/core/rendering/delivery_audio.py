"""Opt-in delivery audio master: an integrated-loudness target and a true-peak ceiling.

Applied to the final mix of a render, after the renderer (or finalizer) has
produced the video and before publication. Video is stream-copied; only the
audio track is re-encoded. Off by default: callers that do not request a
target never reach this module, so their outputs are unchanged.

Method: measure the mix with ebur128 (I, LRA, true peak), then run ffmpeg
``loudnorm`` in two passes (measured values fed back, ``linear=true``, which
ffmpeg itself falls back from to dynamic mode when a constant gain cannot meet
the true-peak ceiling). If the re-measured true peak is still above the
ceiling, a second attempt adds ``alimiter`` with headroom under the ceiling.
The output is re-measured and never accepted above the ceiling.
"""

from __future__ import annotations

import json
import hashlib
import math
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Callable

DEFAULT_LUFS = -14.0
DEFAULT_TRUE_PEAK = -1.0
LRA_TARGET = 11.0
AAC_BITRATE = "320k"  # the same AAC bitrate the Remotion mux uses
# Both passes aim this far under the ceiling: the AAC re-encode of the master adds
# a few tenths of a dB of inter-sample overshoot, which the final check must not see.
TRUE_PEAK_HEADROOM_DB = 0.3
LUFS_TOLERANCE = 0.5
METADATA_KEY = "delivery_audio"
FRAGMENT_NAMESPACE = "rendering.delivery-audio"

_NUMBER = r"([+-]?\d+(?:\.\d+)?|[+-]?inf)"


class DeliveryAudioError(RuntimeError):
    """The delivery audio master could not be applied or did not meet its ceiling."""


@dataclass(frozen=True)
class DeliveryAudioTarget:
    lufs: float = DEFAULT_LUFS
    true_peak: float = DEFAULT_TRUE_PEAK

    def __post_init__(self) -> None:
        for name, value, low, high in (
            ("lufs", self.lufs, -40.0, -5.0),
            ("true_peak", self.true_peak, -9.0, 0.0),
        ):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"delivery audio {name} must be a number")
            if not math.isfinite(value) or not (low <= value <= high):
                raise ValueError(
                    f"delivery audio {name} must be between {low:g} and {high:g}, got {value!r}"
                )
        object.__setattr__(self, "lufs", float(self.lufs))
        object.__setattr__(self, "true_peak", float(self.true_peak))

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "DeliveryAudioTarget":
        if not isinstance(value, Mapping):
            raise ValueError("delivery audio target must be a JSON object")
        unknown = sorted(set(value) - {"lufs", "true_peak"})
        if unknown:
            raise ValueError(f"unknown delivery audio keys: {', '.join(unknown)}")
        return cls(
            lufs=value.get("lufs", DEFAULT_LUFS),
            true_peak=value.get("true_peak", DEFAULT_TRUE_PEAK),
        )

    def to_dict(self) -> dict[str, float]:
        return {"lufs": self.lufs, "true_peak": self.true_peak}


@dataclass(frozen=True)
class LoudnessReading:
    integrated: float
    lra: float
    true_peak: float

    def to_dict(self) -> dict[str, float]:
        return {"integrated_lufs": self.integrated, "lra_lu": self.lra, "true_peak_dbtp": self.true_peak}


def parse_ebur128_summary(text: str) -> LoudnessReading:
    """Integrated loudness, LRA and true peak from ffmpeg ebur128's summary block."""
    integrated = re.search(r"Integrated loudness:\s+I:\s+" + _NUMBER + r"\s+LUFS", text)
    lra = re.search(r"Loudness range:\s+LRA:\s+" + _NUMBER + r"\s+LU", text)
    peak = re.search(r"True peak:\s+Peak:\s+" + _NUMBER + r"\s+dBFS", text)
    if not (integrated and lra and peak):
        raise DeliveryAudioError("ffmpeg ebur128 produced no loudness summary; is the input audio?")
    return LoudnessReading(
        integrated=float(integrated.group(1)),
        lra=float(lra.group(1)),
        true_peak=float(peak.group(1)),
    )


def parse_loudnorm_json(text: str) -> dict[str, str]:
    """The measurement JSON that ffmpeg loudnorm prints on the first pass."""
    blocks = re.findall(r"\{[^{}]*\}", text)
    for block in reversed(blocks):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        if "input_i" in data:
            return {key: str(value) for key, value in data.items()}
    raise DeliveryAudioError("ffmpeg loudnorm printed no measurement block")


def find_ffmpeg() -> str:
    binary = shutil.which("ffmpeg")
    if binary is None:
        raise DeliveryAudioError("ffmpeg is required for delivery audio but was not found on PATH")
    return binary


def _run_ffmpeg(ffmpeg: str, args: list[str], *, runner: Callable[..., Any] | None = None, receipts: list[dict[str, Any]] | None = None) -> subprocess.CompletedProcess[str]:
    # Reuse the existing owned captured-command seam: it retains failed
    # acquisitions, waits the original child and verifies its retained tree.
    from astrid.core.rendering.remotion_runtime import _owned_probe
    from astrid.core.subprocess_env import build_child_subprocess_env

    completed, _receipt = (runner or _owned_probe)(
        [ffmpeg, "-hide_banner", "-nostdin", "-nostats", *args],
        cwd=Path.cwd(), env=build_child_subprocess_env(), timeout=300.0,
    )
    if receipts is not None:
        receipts.append(dict(_receipt))
    return completed


def _file_sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _audio_clock(text: str, tag: str, sample_rate: int) -> dict[str, int]:
    """Only an observed zero-origin continuous PCM clock can be reconstructed."""
    count = 0
    samples = 0
    channels = None
    for line in text.splitlines():
        if f"ashowinfo@{tag} " not in line:
            continue
        fields = dict(re.findall(r"\b(n|pts|rate|nb_samples|channels):\s*(-?\d+)", line))
        if len(fields) != 5:
            raise DeliveryAudioError("incomplete delivery audio clock observation")
        row = {key: int(value) for key, value in fields.items()}
        if (row["n"] != count or row["pts"] != samples or row["rate"] != sample_rate
                or row["nb_samples"] <= 0 or row["channels"] <= 0
                or (channels is not None and row["channels"] != channels)):
            raise DeliveryAudioError("delivery audio requires a zero-origin continuous, fixed-rate PCM clock")
        channels = row["channels"]
        count += 1
        samples += row["nb_samples"]
    if not count:
        raise DeliveryAudioError("missing delivery audio clock observations")
    return {"sample_rate": sample_rate, "channels": channels, "start_sample": 0,
            "sample_frames": samples, "end_sample_exclusive": samples}


def _same_audio_clock(actual: Mapping[str, int], expected: Mapping[str, int]) -> None:
    if actual != expected:
        raise DeliveryAudioError("delivery audio changed decoded sample count or clock")


def measure(path: Path, ffmpeg: str, *, runner: Callable[..., Any] | None = None, receipts: list[dict[str, Any]] | None = None, expected_clock: Mapping[str, int] | None = None) -> LoudnessReading:
    proc = _run_ffmpeg(
        ffmpeg,
        [*(["-copyts"] if expected_clock is not None else []), "-i", str(path), "-map", "0:a:0", "-af",
         ("ashowinfo@astrid_final," if expected_clock is not None else "") + "ebur128=peak=true", "-f", "null", "-"], runner=runner, receipts=receipts,
    )
    if proc.returncode != 0:
        raise DeliveryAudioError(f"ffmpeg could not measure audio: {proc.stderr.strip()[-400:]}")
    if expected_clock is not None:
        _same_audio_clock(_audio_clock(proc.stderr, "astrid_final", expected_clock["sample_rate"]), expected_clock)
    return parse_ebur128_summary(proc.stderr)


def _aim_tp(target: DeliveryAudioTarget) -> float:
    return target.true_peak - TRUE_PEAK_HEADROOM_DB


def _first_pass(path: Path, target: DeliveryAudioTarget, ffmpeg: str, *, runner: Callable[..., Any] | None = None, receipts: list[dict[str, Any]] | None = None, sample_rate: int, clock_out: dict[str, int]) -> dict[str, str]:
    proc = _run_ffmpeg(
        ffmpeg,
        [
            "-copyts", "-i", str(path), "-map", "0:a:0",
            "-af", f"ashowinfo@astrid_input,loudnorm=I={target.lufs:g}:TP={_aim_tp(target):g}:LRA={LRA_TARGET:g}:print_format=json",
            "-f", "null", "-",
        ], runner=runner, receipts=receipts,
    )
    if proc.returncode != 0:
        raise DeliveryAudioError(f"ffmpeg loudnorm measurement failed: {proc.stderr.strip()[-400:]}")
    clock_out.update(_audio_clock(proc.stderr, "astrid_input", sample_rate))
    measured = parse_loudnorm_json(proc.stderr)
    if measured["input_i"] in {"-inf", "inf"}:
        raise DeliveryAudioError("the final mix is silent; there is no loudness to master")
    return measured


def _loudnorm_filter(target: DeliveryAudioTarget, measured: Mapping[str, str]) -> str:
    return (
        f"loudnorm=I={target.lufs:g}:TP={_aim_tp(target):g}:LRA={LRA_TARGET:g}"
        f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
        f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
        f":offset={measured['target_offset']}:linear=true:print_format=summary"
    )


def _source_sample_rate(
    source: Path, ffmpeg: str, *, runner: Callable[..., Any] | None = None, receipts: list[dict[str, Any]] | None = None,
) -> int:
    """The first audio stream's rate, read from ffmpeg's stream listing (no ffprobe needed)."""
    proc = _run_ffmpeg(ffmpeg, ["-i", str(source)], runner=runner, receipts=receipts)
    match = re.search(r"Audio: .*?(\d+) Hz", proc.stderr)
    return int(match.group(1)) if match else 48000


def _encode(
    source: Path, dest: Path, audio_filter: str, ffmpeg: str, *, runner: Callable[..., Any] | None = None, receipts: list[dict[str, Any]] | None = None, sample_rate: int, input_clock: Mapping[str, int]
) -> dict[str, int]:
    # loudnorm works at 192 kHz internally; without -ar the AAC encode keeps 96 kHz
    # (both film masters on 13-14 Oct shipped 96 kHz audio). The caller pins the rate
    # (apply_delivery_audio reads the source's when none is given).
    corrected_filter = (f"ashowinfo@astrid_encode_input,{audio_filter},"
                        f"aresample={sample_rate}:async=0,asetpts=N/SR/TB,ashowinfo@astrid_encoded")
    proc = _run_ffmpeg(
        ffmpeg,
        [
            "-y", "-copyts", "-i", str(source),
            "-map", "0:v:0", "-map", "0:a:0", "-map_metadata", "0",
            "-c:v", "copy",
            "-af", corrected_filter,
            "-c:a", "aac", "-b:a", AAC_BITRATE,
            *(["-ar", str(sample_rate)] if sample_rate is not None else []),
            "-movflags", "+faststart",
            str(dest),
        ], runner=runner, receipts=receipts,
    )
    if proc.returncode != 0:
        raise DeliveryAudioError(f"ffmpeg audio master failed: {proc.stderr.strip()[-400:]}")
    _same_audio_clock(_audio_clock(proc.stderr, "astrid_encode_input", sample_rate), input_clock)
    encoded_clock = _audio_clock(proc.stderr, "astrid_encoded", sample_rate)
    _same_audio_clock(encoded_clock, input_clock)
    return encoded_clock


def apply_delivery_audio(
    source: Path,
    dest: Path,
    target: DeliveryAudioTarget,
    *,
    ffmpeg: str | None = None,
    runner: Callable[..., Any] | None = None,
    sample_rate: int | None = None,
) -> dict[str, Any]:
    """Write ``dest`` = ``source`` with its audio mastered to ``target``.

    Returns a receipt with the before/after readings and what was applied. Raises
    DeliveryAudioError (and leaves no accepted output) if the true-peak ceiling
    cannot be met.
    """
    if sample_rate is not None and (type(sample_rate) is not int or sample_rate <= 0):
        raise ValueError("delivery audio sample rate must be a positive integer")
    if source.resolve() == dest.resolve():
        raise DeliveryAudioError("delivery audio source and destination must differ")
    source_sha256 = _file_sha256(source)
    receipts: list[dict[str, Any]] = []
    binary = ffmpeg or find_ffmpeg()
    if sample_rate is None:  # the master keeps the source's rate (48 kHz film audio stays 48 kHz, not 96)
        sample_rate = _source_sample_rate(source, binary, runner=runner, receipts=receipts)
    before = measure(source, binary, runner=runner, receipts=receipts)
    input_clock: dict[str, int] = {}
    measured = _first_pass(source, target, binary, runner=runner, receipts=receipts,
                           sample_rate=sample_rate, clock_out=input_clock)
    if _file_sha256(source) != source_sha256:
        raise DeliveryAudioError("delivery audio source changed during analysis")
    loudnorm = _loudnorm_filter(target, measured)
    limiter_limit = 10 ** (_aim_tp(target) / 20)
    attempts = [
        ("loudnorm", loudnorm),
        ("loudnorm+alimiter", f"{loudnorm},alimiter=limit={limiter_limit:.4f}:attack=5:release=50:level=disabled"),
    ]
    tried: list[dict[str, Any]] = []
    for name, audio_filter in attempts:
        try:
            encoded_clock = _encode(source, dest, audio_filter, binary, runner=runner, receipts=receipts,
                                    sample_rate=sample_rate, input_clock=input_clock)
            if _file_sha256(source) != source_sha256:
                raise DeliveryAudioError("delivery audio source changed during mastering")
            after = measure(dest, binary, runner=runner, receipts=receipts, expected_clock=input_clock)
        except BaseException:
            dest.unlink(missing_ok=True)
            raise
        tried.append({"stage": name, **after.to_dict()})
        if after.true_peak <= target.true_peak + 1e-9:
            return {
                "clock_preservation": {"source_sha256": source_sha256, "input": input_clock,
                                       "pre_aac": encoded_clock, "final_decoded": dict(input_clock),
                                       "correction": "aresample async=0 then asetpts=N/SR/TB",
                                       "final_decoded_verified": True},
                "target": target.to_dict(),
                "before": before.to_dict(),
                "after": after.to_dict(),
                "applied": {
                    "filters": [name],
                    "loudnorm": {"linear_requested": True, "measured": measured},
                    "alimiter_limit": limiter_limit if name.endswith("alimiter") else None,
                    "aac_bitrate": AAC_BITRATE,
                    "video": "stream copy",
                },
                "integrated_within_tolerance": abs(after.integrated - target.lufs) <= LUFS_TOLERANCE,
                "attempts": tried,
                "owned_commands": receipts,
            }
    dest.unlink(missing_ok=True)
    raise DeliveryAudioError(
        f"true peak {tried[-1]['true_peak_dbtp']:+.2f} dBTP is still above the "
        f"{target.true_peak:g} dBTP ceiling after loudnorm and alimiter; not published"
    )


__all__ = [
    "AAC_BITRATE",
    "DEFAULT_LUFS",
    "DEFAULT_TRUE_PEAK",
    "DeliveryAudioError",
    "DeliveryAudioTarget",
    "FRAGMENT_NAMESPACE",
    "LoudnessReading",
    "METADATA_KEY",
    "apply_delivery_audio",
    "find_ffmpeg",
    "measure",
    "parse_ebur128_summary",
    "parse_loudnorm_json",
]
