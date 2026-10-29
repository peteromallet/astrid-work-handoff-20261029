"""Deterministic production boundary tests; native qualification is separate."""
import copy,json
from pathlib import Path
from types import SimpleNamespace
import pytest,yaml
from astrid.core.rendering.contracts import FrameWindow,RenderProfile,RenderRequest,SCHEMA_VERSION,SupportReport
from astrid.core.rendering.service import RenderService
from astrid.packs.rendering.rendering.renderers.remotion import run as remotion

def profile():return RenderProfile(width=320,height=180,fps_rational=(30000,1001),time_base=(1,90000),video_codec='h264',pixel_format='yuv420p')
def data():return {'theme':'banodoco-default','tracks':[{'id':'v','kind':'visual','label':'Visual'}],'clips':[{'id':'original-phase','clipType':'am-sprite','at':1.001,'hold':9.009,'track':'v','params':{'keyframes':[{'frame':0,'x':0,'y':0},{'frame':60,'x':8,'y':4},{'frame':120,'x':16,'y':8}]}}]}
def window(**extra):return FrameWindow(start_frame=150,end_frame=180,fps_rational=(30000,1001),**extra)

def test_native_window_half_open_range_preserves_original_input():
 d=data();before=copy.deepcopy(d);assert remotion._native_window_argument(window(),d,profile())=='--frames=150-179';assert d==before

def test_native_window_none_does_not_change_full_render():
 assert remotion._native_window_argument(None,{},profile()) is None

@pytest.mark.parametrize('w,message',[(window(source_range=(1,31)),'source_range'),(window(speed=2),'unit speed'),(FrameWindow(150,180,(30,1)),'FPS'),(FrameWindow(150,999,(30000,1001)),'beyond')])
def test_native_window_rejects_unsupported_mapping(w,message):
 with pytest.raises(ValueError,match=message):remotion._native_window_argument(w,data(),profile())

def test_native_window_rejects_frame_capture_before_allocation(tmp_path,monkeypatch):
 monkeypatch.setattr(remotion,'_validate_project_dir',lambda p:pytest.fail('Allocation occurred before conflicting mode refusal'))
 with pytest.raises(ValueError,match='frame_numbers'):
  remotion._execute_remotion_locked(tmp_path/'timeline',tmp_path/'assets',tmp_path/'output',provenance_out_path=tmp_path/'final',project_dir=tmp_path/'project',composition_id='TimelineComposition',theme_path=None,min_free_gb=None,window=window(),frame_numbers=[1])

def test_native_window_manifest_keeps_planner_input_intact(tmp_path):
 path=tmp_path/'timeline.json';raw=data();path.write_text(json.dumps(raw));before=path.read_bytes();review=json.dumps({'shots':[{'at':4,'hold':2}],'speech':{'phrases':[]}})
 request=RenderRequest(SCHEMA_VERSION,str(path),'out.mp4',window=window(),metadata={'review':review})
 declaration=Path(remotion.__file__).with_name('renderer.yaml');capabilities=yaml.safe_load(declaration.read_text())['capabilities'];assert capabilities['supports_windows'] is True
 candidate=SimpleNamespace(manifest=SimpleNamespace(capabilities=capabilities));segment=SimpleNamespace(layer=None,window=request.window)
 adapted,sidecar=RenderService._segment_request(object.__new__(RenderService),request,candidate=candidate,segment=segment,index=0,workspace=tmp_path)
 assert adapted is request and sidecar=={} and path.read_bytes()==before and adapted.metadata['review']==review and adapted.window==window()

@pytest.mark.parametrize('selection',[None,window()])
def test_native_window_protocol_threads_full_timeline_and_review(tmp_path,monkeypatch,selection):
 p=tmp_path/'timeline.json';raw=data();p.write_text(json.dumps(raw));assets=tmp_path/'assets.json';assets.write_text('{"assets":{}}');before=p.read_bytes();review={'shots':[{'at':4,'hold':2}],'speech':{'phrases':[]}}
 request=RenderRequest(SCHEMA_VERSION,str(p),'out.mp4',assets_registry_path=str(assets),window=selection,metadata={'review':json.dumps(review)})
 monkeypatch.setattr(remotion,'support',lambda *a,**k:SupportReport(schema_version=SCHEMA_VERSION,supported=True,reasons=[],features={},alternatives=[],backend=remotion.BACKEND_ID,backend_version=remotion.BACKEND_VERSION))
 monkeypatch.setattr(remotion,'_settings_from_request',lambda *a:SimpleNamespace(project_dir=tmp_path,composition_id='TimelineComposition',theme_path=None,min_free_gb=None))
 monkeypatch.setattr(remotion,'_canonical_profile',lambda *a:profile())
 class StopAtOwnedExecution(Exception):pass
 def execute(timeline_path,assets_path,staged_video,**kw):
  assert timeline_path==p and p.read_bytes()==before and kw['window'] is request.window
  assert kw['encode_aac_at_stitch'] is True
  assert kw['review']['shots']==review['shots'] and kw['review']['speech']==review['speech']
  raise StopAtOwnedExecution()
 monkeypatch.setattr(remotion,'_execute_remotion',execute)
 with pytest.raises(StopAtOwnedExecution):remotion._protocol_render(request,workspace=tmp_path)
 assert p.read_bytes()==before


def test_selected_png_capture_keeps_its_existing_execution_seam(tmp_path,monkeypatch):
 from contextlib import nullcontext
 seen=[]
 monkeypatch.setattr(remotion.remotion_lock,'remotion_render_lock',lambda:nullcontext())
 def execute(*args,**kwargs):
  seen.append(kwargs);assert kwargs['frame_numbers']==(3,7) and 'window' not in kwargs
  for frame in kwargs['frame_numbers']:(kwargs['frame_output_dir']/f'frame-{frame}.png').write_bytes(b'unchanged selected PNG path')
 monkeypatch.setattr(remotion,'_execute_remotion_locked',execute)
 result=remotion.capture_remotion_frames(tmp_path/'timeline',tmp_path/'assets',tmp_path/'frames',[7,3,7],project_dir=tmp_path/'project')
 assert len(seen)==1 and set(result)=={3,7}


@pytest.mark.parametrize('end',[180,151,None])
@pytest.mark.parametrize('allocation',['0','536870912'])
def test_actual_locked_command_selects_original_frames_once(tmp_path,monkeypatch,end,allocation):
 import subprocess
 p=tmp_path/'timeline.json';p.write_text(json.dumps(data()));assets=tmp_path/'assets.json';assets.write_text('{"assets":{}}');project=tmp_path/'project';project.mkdir();output=tmp_path/'out.mp4';before=p.read_bytes();review={'shots':[{'at':4,'hold':2}],'speech':{'phrases':[]}}
 runtime=SimpleNamespace(node_executable=Path('/qualified/node'),remotion_cli=Path('/qualified/remotion-cli.js'),node_version='v20.19.4')
 monkeypatch.setattr(remotion,'_validate_project_dir',lambda *a:runtime)
 monkeypatch.setattr(remotion,'_regenerate_element_registries',lambda *a:None)
 monkeypatch.setattr(remotion,'_validate_renderer_effect_registry',lambda *a:None)
 monkeypatch.setattr(remotion,'_effective_registry_state',lambda *a:{'hash':'qualified-registry'})
 monkeypatch.setattr(remotion,'_canonical_profile',lambda *a:profile())
 monkeypatch.setattr(remotion,'_resolved_theme_for_render',lambda *a:{'id':'banodoco-default','visual':{'canvas':{'width':320,'height':180,'fps':30000/1001}}})
 monkeypatch.setattr(remotion,'_stage_effect_assets_for_timeline',lambda *a,**k:{'root':None,'effects':[],'animations':[],'transitions':[]})
 monkeypatch.setattr(remotion,'_available_remotion_port',lambda:32101)
 monkeypatch.setenv('ASTRID_REMOTION_STREAM_MEMORY_BUDGET_BYTES',allocation);monkeypatch.delenv('ASTRID_PROGRESS_PATH',raising=False)
 class StopBeforeNativeAllocation(Exception):pass
 def command(argv,**kwargs):
  flags=[x for x in argv if x.startswith('--frames=')]
  assert flags==([] if end is None else [f'--frames=150-{end-1}'])
  assert '--sequence' not in argv and '--image-format=jpeg' in argv and '--jpeg-quality=95' in argv and '--bundle-cache=false' in argv and '--concurrency=1' in argv
  assert any(x.startswith('--max-rate=') for x in argv) and any(x.startswith('--buffer-size=') for x in argv)
  props=json.loads(Path(argv[argv.index('--props')+1]).read_text());clip=props['timeline']['clips'][0]
  assert (clip['id'],clip['at'],clip['hold'])==('original-phase',1.001,9.009) and props['review']==review
  assert (kwargs['env'].get('ASTRID_REMOTION_STREAM_FRAMES')=='1')==(allocation!='0')
  assert p.read_bytes()==before
  raise StopBeforeNativeAllocation()
 monkeypatch.setattr(remotion.subprocess,'run',command)
 w=None if end is None else FrameWindow(150,end,(30000,1001))
 with pytest.raises(StopBeforeNativeAllocation):remotion._execute_remotion_locked(p,assets,output,provenance_out_path=output,project_dir=project,composition_id='TimelineComposition',theme_path=None,min_free_gb=None,window=w,review=review)
 assert p.read_bytes()==before


@pytest.mark.parametrize('entrypoint',['support','locked'])
def test_nested_materialized_window_clock_refused_before_execution(tmp_path,monkeypatch,entrypoint):
 p=tmp_path/'timeline.json';raw=data();raw['metadata']={'source_window_start_seconds':4.0,'duration_seconds':1.001};p.write_text(json.dumps(raw));assets=tmp_path/'assets.json';assets.write_text('{"assets":{}}');project=tmp_path/'project';project.mkdir()
 monkeypatch.setattr(remotion,'_serialize_timeline',lambda *a,**k:copy.deepcopy(raw))
 monkeypatch.setattr(remotion,'_canonical_profile',lambda *a:profile())
 monkeypatch.setattr(remotion,'_resolve_timeline_element_references',lambda *a,**k:None)
 monkeypatch.setattr(remotion,'_effect_registry_for_assets',lambda *a:({'am-sprite':object()},{}))
 if entrypoint=='support':
  monkeypatch.setattr(remotion,'_validate_project_dir',lambda *a:object())
  request=RenderRequest(SCHEMA_VERSION,str(p),'out.mp4',assets_registry_path=str(assets),window=window(),backend_config={remotion.BACKEND_ID:{'project_dir':str(project)}})
  report=remotion.support(request,workspace=tmp_path);assert not report.supported and any('materialized-window metadata' in r for r in report.reasons)
 else:
  monkeypatch.setattr(remotion,'_validate_project_dir',lambda *a:pytest.fail('Allocated before ambiguous native clock refusal'))
  with pytest.raises(ValueError,match='materialized-window metadata'):remotion._execute_remotion_locked(p,assets,tmp_path/'out.mp4',provenance_out_path=tmp_path/'out.mp4',project_dir=project,composition_id='TimelineComposition',theme_path=None,min_free_gb=None,window=window())


@pytest.mark.parametrize('mode',['full','window','alpha','nonmp4','frames'])
def test_pcm_aac_stitch_real_locked_command_gates(tmp_path,monkeypatch,mode):
 """Exercise actual command assembly, with no codec/native process allocation."""
 raw=data()
 if mode=='alpha':raw['metadata']={'astrid_layer':{'alpha':True,'z':1}}
 p=tmp_path/'timeline.json';p.write_text(json.dumps(raw));assets=tmp_path/'assets.json';assets.write_text('{"assets":{}}');project=tmp_path/'project';project.mkdir();output=tmp_path/('out.mov' if mode in ['alpha','nonmp4'] else 'out.mp4')
 runtime=SimpleNamespace(node_executable=Path('/qualified/node'),remotion_cli=Path('/qualified/remotion-cli.js'),node_version='v20.19.4')
 monkeypatch.setattr(remotion,'_validate_project_dir',lambda *a:runtime)
 monkeypatch.setattr(remotion,'_regenerate_element_registries',lambda *a:None)
 monkeypatch.setattr(remotion,'_validate_renderer_effect_registry',lambda *a:None)
 monkeypatch.setattr(remotion,'_effective_registry_state',lambda *a:{'hash':'qualified-registry'})
 monkeypatch.setattr(remotion,'_canonical_profile',lambda *a:profile())
 monkeypatch.setattr(remotion,'_resolved_theme_for_render',lambda *a:{'id':'banodoco-default','visual':{'canvas':{'width':320,'height':180,'fps':30000/1001}}})
 monkeypatch.setattr(remotion,'_stage_effect_assets_for_timeline',lambda *a,**k:{'root':None,'effects':[],'animations':[],'transitions':[]})
 monkeypatch.setattr(remotion,'_available_remotion_port',lambda:32101)
 monkeypatch.delenv('ASTRID_PROGRESS_PATH',raising=False);monkeypatch.setenv('ASTRID_REMOTION_PCM_AAC_OUTPUT','/ambient/forbidden.mov')
 class CommandObserved(Exception):pass
 def command(argv,**kwargs):
  env=kwargs['env'];cli=Path(argv[argv.index('--output')+1]);enabled=mode in ['full','window']
  assert ('--audio-codec=pcm-16' in argv)==enabled
  assert ('--sample-rate=48000' in argv)==enabled
  if enabled:
   assert cli.name=='capture.mov' and cli.parent==Path(env['TMPDIR']) and env['ASTRID_REMOTION_PCM_AAC_OUTPUT']==str(cli)
   assert '--codec=h264' in argv
  else:assert 'ASTRID_REMOTION_PCM_AAC_OUTPUT' not in env
  assert ('--sequence' in argv)==(mode=='frames')
  assert ('--codec=prores' in argv)==(mode=='alpha')
  assert [x for x in argv if x.startswith('--frames=')]==(['--frames=150-179'] if mode=='window' else ['--frames=3'] if mode=='frames' else [])
  raise CommandObserved()
 monkeypatch.setattr(remotion.subprocess,'run',command)
 with pytest.raises(CommandObserved):
  remotion._execute_remotion_locked(p,assets,output,provenance_out_path=output,project_dir=project,composition_id='TimelineComposition',theme_path=None,min_free_gb=None,encode_aac_at_stitch=True,window=window() if mode=='window' else None,frame_numbers=[3] if mode=='frames' else None,frame_output_dir=tmp_path/'frames' if mode=='frames' else None)


def test_threejs_existing_protocol_keeps_pcm_aac_opt_in(tmp_path,monkeypatch):
 from astrid.packs.rendering.rendering.renderers.threejs import run as threejs
 raw={'theme':'banodoco-default','tracks':[],'clips':[]};p=tmp_path/'timeline.json';p.write_text(json.dumps(raw));assets=tmp_path/'assets.json';assets.write_text('{"assets":{}}')
 request=RenderRequest(SCHEMA_VERSION,str(p),'out.mp4',assets_registry_path=str(assets))
 monkeypatch.setattr(threejs,'_default_settings',lambda:SimpleNamespace(project_dir=tmp_path,theme_path=None,min_free_gb=None))
 monkeypatch.setattr(threejs,'_resolved_theme_for_render',lambda *a:{'id':'banodoco-default'})
 monkeypatch.setattr(threejs,'_support_reasons',lambda *a,**k:[])
 monkeypatch.setattr(threejs,'_threejs_project_reasons',lambda *a:[])
 monkeypatch.setattr(threejs,'_binaries_reasons',lambda:[])
 monkeypatch.setattr(threejs,'_canonical_profile',lambda *a:profile())
 class ExistingThreejsSeam(Exception):pass
 def execute(*args,**kw):
  assert kw['encode_aac_at_stitch'] is True and kw['composition_id']==threejs.THREE_COMPOSITION_ID
  raise ExistingThreejsSeam()
 monkeypatch.setattr(threejs,'_execute_remotion',execute)
 with pytest.raises(ExistingThreejsSeam):threejs._protocol_render(request,workspace=tmp_path)
