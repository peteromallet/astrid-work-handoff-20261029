"""Opt-in delivery audio master: loudness target and true-peak ceiling on the final mix."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from astrid.core.rendering.delivery_audio import (
    DeliveryAudioError,
    DeliveryAudioTarget,
    apply_delivery_audio,
    parse_ebur128_summary,
    parse_loudnorm_json,
)
from astrid.packs.rendering.actions.render.run import _delivery_audio_from_args

EBUR128_SUMMARY = """
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -13.8 LUFS
    Threshold: -24.1 LUFS

  Loudness range:
    LRA:         6.4 LU
    Threshold: -34.1 LUFS
    LRA low:   -17.0 LUFS
    LRA high:  -10.6 LUFS

  True peak:
    Peak:        +0.4 dBFS
"""

LOUDNORM_JSON = """
[Parsed_loudnorm_0 @ 0x1]
{
	"input_i" : "-15.61",
	"input_tp" : "1.00",
	"input_lra" : "1.70",
	"input_thresh" : "-25.61",
	"output_i" : "-15.76",
	"output_tp" : "-1.00",
	"output_lra" : "0.50",
	"output_thresh" : "-25.76",
	"normalization_type" : "dynamic",
	"target_offset" : "1.76"
}
"""


def test_parse_ebur128_summary_reads_i_lra_and_true_peak() -> None:
    reading = parse_ebur128_summary(EBUR128_SUMMARY)
    assert reading.integrated == pytest.approx(-13.8)
    assert reading.lra == pytest.approx(6.4)
    assert reading.true_peak == pytest.approx(0.4)


def test_parse_ebur128_summary_rejects_missing_summary() -> None:
    with pytest.raises(DeliveryAudioError):
        parse_ebur128_summary("no summary here")


def test_parse_loudnorm_json_returns_measurements() -> None:
    measured = parse_loudnorm_json(LOUDNORM_JSON)
    assert measured["input_i"] == "-15.61"
    assert measured["target_offset"] == "1.76"


@pytest.mark.parametrize(
    "value",
    [{"lufs": -4}, {"lufs": -60}, {"true_peak": 0.5}, {"true_peak": True}, {"lufs": "loud"}, {"bogus": 1}],
)
def test_target_rejects_out_of_range_or_unknown_values(value: dict) -> None:
    with pytest.raises(ValueError):
        DeliveryAudioTarget.from_mapping(value)


def test_target_defaults_to_minus_14_lufs_and_minus_1_dbtp() -> None:
    assert DeliveryAudioTarget.from_mapping({}).to_dict() == {"lufs": -14.0, "true_peak": -1.0}


def test_no_flags_means_no_delivery_audio() -> None:
    """Default renders carry no master, so their output is unchanged."""
    args = argparse.Namespace(delivery_audio=None, audio_target=None, true_peak=None)
    assert _delivery_audio_from_args(args) is None


def test_shorthand_flags_build_the_target() -> None:
    args = argparse.Namespace(delivery_audio=None, audio_target=-14.0, true_peak=-1.0)
    assert _delivery_audio_from_args(args) == {"lufs": -14.0, "true_peak": -1.0}


def _ffmpeg() -> str:
    return shutil.which("ffmpeg")


@pytest.fixture()
def film_like_fixture(tmp_path: Path) -> Path:
    """Synthetic 6 s clip near -14 LUFS whose sample peaks sit above -1 dBTP.

    A quiet 220 Hz bed with a 2 kHz burst every 1.5 s: the same shape of problem
    as the film (loudness on target, true peak over the ceiling).
    """
    ffmpeg = _ffmpeg()
    out = tmp_path / "fixture.mp4"
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-filter_threads", "1",
            "-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=6",
            "-f", "lavfi", "-i",
            "aevalsrc=exprs='0.23*sin(2*PI*220*t)+0.85*sin(2*PI*2000*t)*(lt(mod(t,1.5),0.05))':d=6:s=48000",
            "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-shortest",
            str(out),
        ],
        check=True,
    )
    return out


def _probe_streams(path: Path) -> dict[str, str]:
    ffprobe = shutil.which("ffprobe")
    proc = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return {stream["codec_type"]: stream["codec_name"] for stream in json.loads(proc.stdout)["streams"]}


@pytest.mark.ffmpeg
def test_master_meets_true_peak_ceiling_and_loudness_target(film_like_fixture: Path, tmp_path: Path) -> None:
    ffmpeg = _ffmpeg()
    dest = tmp_path / "delivery-audio.mp4"
    target = DeliveryAudioTarget(lufs=-14.0, true_peak=-1.0)

    receipt = apply_delivery_audio(film_like_fixture, dest, target, ffmpeg=ffmpeg)

    assert receipt["before"]["true_peak_dbtp"] > -1.0, "fixture must start above the ceiling"
    assert receipt["after"]["true_peak_dbtp"] <= -1.0
    assert abs(receipt["after"]["integrated_lufs"] - target.lufs) <= 0.5
    assert receipt["integrated_within_tolerance"] is True
    assert receipt["applied"]["video"] == "stream copy"
    assert receipt["applied"]["aac_bitrate"] == "320k"
    streams = _probe_streams(dest)
    assert streams.get("video") == "h264"
    assert streams.get("audio") == "aac"


@pytest.mark.ffmpeg
def test_master_keeps_the_source_sample_rate(film_like_fixture: Path, tmp_path: Path) -> None:
    """loudnorm resamples to 192 kHz internally; the film's masters shipped 96 kHz AAC."""
    ffprobe = shutil.which("ffprobe")
    dest = tmp_path / "delivery-audio.mp4"
    apply_delivery_audio(film_like_fixture, dest, DeliveryAudioTarget(), ffmpeg=_ffmpeg())
    rate = subprocess.run([ffprobe, "-v", "error", "-select_streams", "a", "-show_entries", "stream=sample_rate",
                           "-of", "csv=p=0", str(dest)], capture_output=True, text=True, check=True).stdout.strip()
    assert rate == "48000"


@pytest.mark.ffmpeg
def test_video_is_stream_copied_bit_for_bit(film_like_fixture: Path, tmp_path: Path) -> None:
    ffmpeg = _ffmpeg()
    dest = tmp_path / "delivery-audio.mp4"
    apply_delivery_audio(film_like_fixture, dest, DeliveryAudioTarget(), ffmpeg=ffmpeg)

    def video_packets(path: Path) -> bytes:
        proc = subprocess.run(
            [ffmpeg, "-v", "error", "-i", str(path), "-map", "0:v:0", "-c", "copy", "-f", "h264", "-"],
            capture_output=True, check=True,
        )
        return proc.stdout

    assert video_packets(dest) == video_packets(film_like_fixture)


@pytest.mark.ffmpeg
def test_unreachable_ceiling_is_refused_and_leaves_no_output(film_like_fixture: Path, tmp_path: Path) -> None:
    ffmpeg = _ffmpeg()
    dest = tmp_path / "delivery-audio.mp4"
    # -9 dBTP with a -5 LUFS target forces a loud master that the ceiling cannot hold.
    with pytest.raises(DeliveryAudioError):
        apply_delivery_audio(film_like_fixture, dest, DeliveryAudioTarget(lufs=-5.0, true_peak=-9.0), ffmpeg=ffmpeg)
    assert not dest.exists()


def test_service_hook_is_inert_without_a_target() -> None:
    from astrid.core.rendering.contracts import RenderRequest
    from astrid.core.rendering.service import RenderService

    request = RenderRequest.from_dict(
        {
            "schema_version": 1,
            "timeline_path": "/nonexistent/timeline.json",
            "assets_registry_path": None,
            "output_name": "hype.mp4",
            "window": None,
            "audio": None,
            "profile": None,
            "backend_config": {},
            "metadata": {},
            "materialized_root": None,
            "materialized_objects": {},
        }
    )
    assert RenderService._delivery_audio_target(request) is None


@pytest.mark.ffmpeg
def test_service_hook_masters_the_final_mix_and_returns_a_receipt(film_like_fixture: Path, tmp_path: Path) -> None:
    from types import SimpleNamespace

    from astrid.core.rendering.delivery_audio import METADATA_KEY
    from astrid.core.rendering.service import RenderService

    ffmpeg = _ffmpeg()
    result = SimpleNamespace(video=SimpleNamespace(profile=SimpleNamespace(has_audio=True), sha256="0" * 64))
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    target = RenderService._delivery_audio_target(
        SimpleNamespace(metadata={METADATA_KEY: json.dumps({"lufs": -14, "true_peak": -1})})
    )
    assert target == DeliveryAudioTarget(lufs=-14.0, true_peak=-1.0)

    mastered, receipt = RenderService._master_delivery_audio(
        result, film_like_fixture, workspace=workspace, target=target, backend="rendering.ffmpeg"
    )
    assert mastered == workspace / "delivery-audio.mp4"
    assert receipt["after"]["true_peak_dbtp"] <= -1.0
    assert receipt["source_sha256"] == "0" * 64
    assert ffmpeg  # ran the real filter chain


def _clock_log(tag, rows=((0, 0, 48000, 1024, 2), (1, 1024, 48000, 512, 2))):
    return '\n'.join(f'[ashowinfo@{tag} @ 0x1] n:{n} pts:{pts} rate:{rate} nb_samples:{size} channels:{channels}'
                     for n, pts, rate, size, channels in rows)


@pytest.mark.parametrize('rows', [
    (), ((0, 1, 48000, 1024, 2),), ((0, -1, 48000, 1024, 2),),
    ((0, 0, 48000, 1024, 2), (1, 1025, 48000, 512, 2)),
    ((0, 0, 48000, 1024, 2), (1, 1023, 48000, 512, 2)),
    ((0, 0, 44100, 1024, 2),), ((0, 0, 48000, 1024, 2), (1, 1024, 44100, 512, 2)),
    ((1, 0, 48000, 1024, 2),), ((0, 0, 48000, 0, 2),),
    ((0, 0, 48000, 1024, 2), (1, 1024, 48000, 512, 1)),
])
def test_delivery_clock_refuses_unproved_input(rows):
    from astrid.core.rendering import delivery_audio as audio
    with pytest.raises(DeliveryAudioError): audio._audio_clock(_clock_log('proof', rows), 'proof', 48000)


def test_delivery_clock_rejects_malformed_and_keeps_variable_frame_sizes():
    from astrid.core.rendering import delivery_audio as audio
    expected={'sample_rate':48000,'channels':2,'start_sample':0,'sample_frames':1536,'end_sample_exclusive':1536}
    assert audio._audio_clock(_clock_log('proof'), 'proof', 48000)==expected
    with pytest.raises(DeliveryAudioError): audio._audio_clock('[ashowinfo@proof @ 0x1] n:0 pts:0', 'proof', 48000)
    with pytest.raises(DeliveryAudioError): audio._same_audio_clock({**expected,'sample_frames':1535},expected)


@pytest.mark.parametrize('fault', ['none', 'limiter', 'input-gap', 'encode-input-gap', 'count-loss', 'final-gap', 'source-change'])
def test_delivery_master_clock_fences_and_filter_order(tmp_path, fault):
    from astrid.core.rendering import delivery_audio as audio
    source=tmp_path/'source.mp4';source.write_bytes(b'controlled source identity')
    dest=tmp_path/'master.mp4';commands=[];encodes=0;finals=0
    gap=((0,0,48000,1024,2),(1,1025,48000,512,2))
    fewer=((0,0,48000,1024,2),(1,1024,48000,511,2))
    def runner(argv, **kwargs):
        nonlocal encodes, finals
        commands.append(argv)
        filters=argv[argv.index('-af')+1]
        if 'ashowinfo@astrid_encode_input' in filters:
            encodes+=1;dest.write_bytes(b'controlled candidate')
            assert '-copyts' in argv and argv[argv.index('-c:v')+1]=='copy'
            assert argv[argv.index('-ar')+1]=='48000'
            assert filters.endswith('aresample=48000:async=0,asetpts=N/SR/TB,ashowinfo@astrid_encoded')
            assert ('alimiter=' in filters)==(fault=='limiter' and encodes==2)
            text=_clock_log('astrid_encode_input',gap) if fault=='encode-input-gap' else _clock_log('astrid_encode_input')
            text+='\n'+(_clock_log('astrid_encoded',fewer) if fault=='count-loss' else _clock_log('astrid_encoded'))
            if fault=='source-change':source.write_bytes(b'changed source')
        elif 'ashowinfo@astrid_input' in filters:
            assert '-copyts' in argv
            text=LOUDNORM_JSON+'\n'+(_clock_log('astrid_input',gap) if fault=='input-gap' else _clock_log('astrid_input'))
        elif 'ashowinfo@astrid_final' in filters:
            finals+=1;assert '-copyts' in argv
            peak='+0.4' if fault=='limiter' and finals==1 else '-1.3'
            text=EBUR128_SUMMARY.replace('+0.4',peak)+'\n'+(_clock_log('astrid_final',gap) if fault=='final-gap' else _clock_log('astrid_final'))
        else:text=EBUR128_SUMMARY
        return subprocess.CompletedProcess(argv,0,'',text), {'original_wait_exit_code':0,'argv':argv}
    if fault in ('none','limiter'):
        receipt=audio.apply_delivery_audio(source,dest,DeliveryAudioTarget(),ffmpeg='/controlled/ffmpeg',runner=runner,sample_rate=48000)
        proof=receipt['clock_preservation']
        assert proof['input']==proof['pre_aac']==proof['final_decoded']
        assert proof['input']['sample_frames']==1536 and proof['final_decoded_verified'] is True
        assert receipt['after']['true_peak_dbtp']==-1.3 and receipt['applied']['video']=='stream copy'
        assert len(receipt['owned_commands'])==len(commands) and encodes==(2 if fault=='limiter' else 1)
    else:
        with pytest.raises(DeliveryAudioError):audio.apply_delivery_audio(source,dest,DeliveryAudioTarget(),ffmpeg='/controlled/ffmpeg',runner=runner,sample_rate=48000)
        assert not dest.exists()
        assert encodes==(0 if fault=='input-gap' else 1)
        if fault!='source-change':assert source.read_bytes()==b'controlled source identity'
