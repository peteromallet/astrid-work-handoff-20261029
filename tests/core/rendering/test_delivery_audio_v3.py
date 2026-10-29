"""Delivery mastering stays in the single V3 host publication boundary."""
from __future__ import annotations
import argparse
import json
import subprocess
from dataclasses import replace
from pathlib import Path

import pytest
import yaml

from astrid.core.rendering import delivery_audio as audio
from astrid.core.rendering import service as service_module
from astrid.core.rendering.contracts import AudioOwnership
from astrid.core.rendering.errors import RendererUnsupportedError
from astrid.packs.rendering.actions.render import run as facade
from tests.core.rendering.test_service import FakeTransport, _request, _service


def test_master_runs_after_finalizer_before_provenance_and_publication(tmp_path, monkeypatch):
    transport = FakeTransport()
    transport.render_ownership['rendering.ffmpeg'] = AudioOwnership.RENDERED
    transport.finalize_ownership = AudioOwnership.RENDERED
    events=[]
    def master(source, dest, target, **kwargs):
        assert transport.calls[-1] == ('finalize', 'rendering.ffmpeg-finalizer')
        assert source.read_bytes().startswith(b'finalize:')
        assert kwargs['sample_rate']==48000
        events.append('master')
        dest.write_bytes(b'mastered final mix')
        return {'target':target.to_dict(),'after':{'true_peak_dbtp':-1.0}}
    monkeypatch.setattr(service_module, 'apply_delivery_audio', master)
    monkeypatch.setattr(service_module, 'find_ffmpeg', lambda:'/qualified/ffmpeg')
    def publish(source, provenance, **kwargs):
        events.append('publish')
        assert source.read_bytes()==b'mastered final mix'
        # Provenance receives the receipt in the normal backend namespace.
        text=json.dumps(provenance)
        assert 'rendering.delivery-audio' in text and 'source_sha256' in text
        assert '-14.0' in text
        output=kwargs['out_path'];output.parent.mkdir(parents=True,exist_ok=True)
        output.write_bytes(source.read_bytes());return output
    service=_service(tmp_path,transport,renderer_ids=('rendering.ffmpeg',),
                     finalizer_id='rendering.ffmpeg-finalizer',publisher=publish)
    request=replace(_request(tmp_path,audio=AudioOwnership.RENDERED),
                    metadata={audio.METADATA_KEY:json.dumps({'lufs':-14,'true_peak':-1})})
    output=tmp_path/'published/video.mp4'
    assert service.render_request(request,selector='rendering.ffmpeg',out_path=output)==output
    assert events==['master','publish']


def test_master_ceiling_refusal_never_calls_publisher_or_replaces_prior_output(tmp_path, monkeypatch):
    transport=FakeTransport();transport.render_ownership['rendering.ffmpeg']=AudioOwnership.RENDERED
    calls=[]
    def refuse(*args,**kwargs):raise audio.DeliveryAudioError('ceiling unmet; not published')
    monkeypatch.setattr(service_module,'apply_delivery_audio',refuse)
    monkeypatch.setattr(service_module,'find_ffmpeg',lambda:'/qualified/ffmpeg')
    service=_service(tmp_path,transport,renderer_ids=('rendering.ffmpeg',),
                     publisher=lambda *a,**k:calls.append('unexpected publish'))
    request=replace(_request(tmp_path,audio=AudioOwnership.RENDERED),metadata={audio.METADATA_KEY:'{}'})
    output=tmp_path/'published/video.mp4';output.parent.mkdir();output.write_bytes(b'previous accepted video')
    with pytest.raises(RendererUnsupportedError,match='delivery audio master failed'):
        service.render_request(request,selector='rendering.ffmpeg',out_path=output)
    assert calls==[] and output.read_bytes()==b'previous accepted video'


def test_no_target_preserves_original_publication_and_does_not_find_ffmpeg(tmp_path, monkeypatch):
    transport=FakeTransport()
    monkeypatch.setattr(service_module,'find_ffmpeg',lambda:pytest.fail('default path allocated mastering'))
    published=[]
    def publish(source, provenance, **kwargs):
        published.append(source.read_bytes());assert 'rendering.delivery-audio' not in json.dumps(provenance)
        return kwargs['out_path']
    service=_service(tmp_path,transport,renderer_ids=('rendering.ffmpeg',),publisher=publish)
    service.render_request(_request(tmp_path),selector='rendering.ffmpeg',out_path=tmp_path/'out.mp4')
    assert published==[b'render:rendering.ffmpeg:10']


def test_target_on_silent_final_output_refuses_before_publication(tmp_path):
    transport=FakeTransport();calls=[]
    service=_service(tmp_path,transport,renderer_ids=('rendering.ffmpeg',),publisher=lambda *a,**k:calls.append(1))
    request=replace(_request(tmp_path),metadata={audio.METADATA_KEY:'{}'})
    with pytest.raises(RendererUnsupportedError,match='rendered audio track'):
        service.render_request(request,selector='rendering.ffmpeg',out_path=tmp_path/'out.mp4')
    assert calls==[]


def test_ffmpeg_adapter_reuses_owned_capture_with_explicit_environment_and_deadline(monkeypatch):
    from astrid.core.rendering import remotion_runtime
    calls=[]
    def owned(argv,**kwargs):
        calls.append((argv,kwargs));return subprocess.CompletedProcess(argv,0,'stdout','stderr'), {'original_wait_exit_code':0}
    monkeypatch.setattr(remotion_runtime,'_owned_probe',owned)
    result=audio._run_ffmpeg('/qualified/ffmpeg',['-version'])
    assert result.stdout=='stdout' and result.stderr=='stderr'
    argv,kwargs=calls[0]
    assert argv==['/qualified/ffmpeg','-hide_banner','-nostdin','-nostats','-version']
    assert kwargs['cwd']==Path.cwd() and kwargs['env'] and kwargs['timeout']==300.0


def test_owned_capture_uncertainty_is_not_flattened_or_accepted(monkeypatch):
    from astrid.core.rendering import remotion_runtime
    retained=object();cleanup=RuntimeError('cleanup unresolved')
    primary=RuntimeError('capture failed');primary.process=retained;primary.cleanup_error=cleanup
    def owned(*a,**k):raise primary
    monkeypatch.setattr(remotion_runtime,'_owned_probe',owned)
    with pytest.raises(RuntimeError) as caught:audio._run_ffmpeg('/qualified/ffmpeg',[])
    assert caught.value is primary and caught.value.process is retained and caught.value.cleanup_error is cleanup


def test_v3_manifest_declares_optional_json_and_command_binding():
    root=Path(facade.__file__).resolve().parents[2]
    manifest=yaml.safe_load((root/'pack.yaml').read_text())['actions']['render']
    declaration=next(x for x in manifest['inputs'] if x['name']=='delivery_audio')
    assert declaration['type']=='json' and declaration['required'] is False
    command=manifest['invocation']['command']
    binding=next(x for x in command['input_args'] if x['input']=='delivery_audio')
    assert binding=={'input':'delivery_audio','flag':'--delivery-audio','optional':True}


@pytest.mark.parametrize('supplied', [None, {'lufs':-17,'true_peak':-2}])
def test_facade_preserves_review_and_forwards_only_explicit_target(tmp_path, monkeypatch, supplied):
    timeline=tmp_path/'timeline.json';timeline.write_text('{}')
    assets=tmp_path/'assets.json';assets.write_text('{"assets":{}}')
    output=tmp_path/'result.mp4';captured=[]
    class Service:
        def render(self,request,**kwargs):captured.append(request);return output
    monkeypatch.setattr(facade,'_default_service',lambda:Service())
    monkeypatch.setattr(facade,'_rewrite_provenance_output_path',lambda *a,**k:None)
    monkeypatch.setattr(facade,'_write_render_manifest',lambda *a,**k:None)
    facade.render(timeline,assets,output,review=True,review_context={'shots':[]},delivery_audio=supplied)
    metadata=captured[0].metadata
    assert json.loads(metadata['review'])=={'shots':[]}
    assert ('delivery_audio' in metadata)==(supplied is not None)
    if supplied is not None:assert json.loads(metadata['delivery_audio'])=={'lufs':-17.0,'true_peak':-2.0}


def test_cli_json_and_shorthand_share_validation_and_shorthand_precedence():
    args=argparse.Namespace(delivery_audio='{"lufs":-16,"true_peak":-2}',audio_target=-18,true_peak=None)
    assert facade._delivery_audio_from_args(args)=={'lufs':-18,'true_peak':-2}
    with pytest.raises(ValueError):
        facade._delivery_audio_from_args(argparse.Namespace(delivery_audio='{"unknown":1}',audio_target=None,true_peak=None))


def test_mastering_receipt_preserves_every_owned_command_result(tmp_path):
    source=tmp_path/'source.mp4';source.write_bytes(b'input')
    dest=tmp_path/'master.mp4';calls=[]
    from tests.core.rendering.test_delivery_audio import LOUDNORM_JSON, _clock_log
    def runner(argv,**kwargs):
        calls.append(argv)
        if any('loudnorm=' in x and 'print_format=json' in x for x in argv):
            stderr=LOUDNORM_JSON+'\n'+_clock_log('astrid_input')
        elif any('ebur128=peak=true' in x for x in argv):
            peak=-0.1 if len(calls)==1 else -1.1
            stderr=f'Integrated loudness:\n I: -14.0 LUFS\nLoudness range:\n LRA: 2.0 LU\nTrue peak:\n Peak: {peak} dBFS\n'
            if any('ashowinfo@astrid_final' in x for x in argv):stderr+=_clock_log('astrid_final')
        else:
            dest.write_bytes(b'mastered');stderr=_clock_log('astrid_encode_input')+'\n'+_clock_log('astrid_encoded')
        return subprocess.CompletedProcess(argv,0,'',stderr), {'original_child_pid':100+len(calls),'original_wait_exit_code':0,'retained_set_final_census_complete':True}
    receipt=audio.apply_delivery_audio(source,dest,audio.DeliveryAudioTarget(),ffmpeg='/qualified/ffmpeg',runner=runner,sample_rate=48000)
    assert any('-ar' in argv and argv[argv.index('-ar')+1]=='48000' for argv in calls)
    assert len(calls)==4
    assert receipt['owned_commands']==[{'original_child_pid':n,'original_wait_exit_code':0,'retained_set_final_census_complete':True} for n in range(101,105)]


@pytest.mark.parametrize('with_assets',[False,True])
def test_actual_cli_both_asset_modes_forward_delivery_audio(tmp_path,monkeypatch,with_assets):
    timeline=tmp_path/'timeline.json';timeline.write_text('{}')
    assets=tmp_path/'assets.json';assets.write_text('{"assets":{}}')
    output=tmp_path/'video.mp4';captured=[]
    def render(*args,**kwargs):captured.append(kwargs);return output
    monkeypatch.setattr(facade,'render',render)
    argv=['--timeline',str(timeline),'--out',str(output),'--audio-target','-16','--true-peak','-2']
    if with_assets:argv+=['--assets',str(assets)]
    assert facade.main(argv)==0
    assert len(captured)==1 and captured[0]['delivery_audio']=={'lufs':-16.0,'true_peak':-2.0}
