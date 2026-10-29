// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {
  MAX_SCENE_SHOTS,MAX_SCENE_EVENTS,
  SceneFrameHost,sanitizeSceneShots,sanitizeSceneEvents,sanitizeSceneExplore,sanitizeSceneView,
  MAX_STILL_CHARS,sanitizeSceneStill,
  sceneDocument,validateScenePackage,type SceneStatus,type ValidatedScenePackage,
} from '../../../astrid/packs/rendering/ui/threejs-live-editor/runtime';

const DIGEST=`sha256:${'0'.repeat(64)}`;
function pkg(duration=60): ValidatedScenePackage {
  const entry={object_id:'e',digest:DIGEST,media_type:'text/html',size:1,filename:'scene.html'};
  const manifest={formatVersion:1,entry:'scene.html',duration,authoredFps:30};
  return validateScenePackage({revision:DIGEST,source:{objectId:'p',revision:DIGEST},packageBody:JSON.stringify({manifest,entry,assets:[]}),html:'<html><head></head><body></body></html>'});
}

describe('sanitizeSceneEvents',()=>{
  it('keeps valid point and ranged events, trimmed and sorted by start',()=>{
    expect(sanitizeSceneEvents([{name:' Bridge ',start:5,end:7},{name:'Start',start:0},{name:'Lake',start:2.5,extra:1}],10))
      .toEqual([{name:'Start',start:0},{name:'Lake',start:2.5},{name:'Bridge',start:5,end:7}]);
  });
  it('omits the end key entirely for point events',()=>{
    const [point]=sanitizeSceneEvents([{name:'p',start:1}]);
    expect(Object.keys(point)).toEqual(['name','start']);
    const [undef]=sanitizeSceneEvents([{name:'p',start:1,end:undefined}]);
    expect(Object.keys(undef)).toEqual(['name','start']);
  });
  it('accepts zero-length ranges and bounds at the duration',()=>{
    expect(sanitizeSceneEvents([{name:'z',start:2,end:2},{name:'d',start:10,end:10}],10))
      .toEqual([{name:'z',start:2,end:2},{name:'d',start:10,end:10}]);
  });
  it('drops invalid entries instead of failing',()=>{
    const long='x'.repeat(81);
    expect(sanitizeSceneEvents([
      null,'s',{start:1},{name:'a'},{name:'a',start:'1'},{name:'a',start:NaN},{name:'a',start:Infinity},{name:'a',start:-1},
      {name:'a',start:11},
      {name:'   ',start:1},{name:7,start:1},{name:long,start:1},
      {name:'a',start:3,end:2},{name:'a',start:1,end:11},{name:'a',start:1,end:'2'},{name:'a',start:1,end:NaN},{name:'a',start:1,end:null},
      {name:'x'.repeat(80),start:1},{name:'ok',start:2},
    ],10)).toEqual([{name:'x'.repeat(80),start:1},{name:'ok',start:2}]);
  });
  it('bounds starts by the duration only when one is given',()=>{
    expect(sanitizeSceneEvents([{name:'far',start:1e9}])).toEqual([{name:'far',start:1e9}]);
    expect(sanitizeSceneEvents([{name:'far',start:1e9}],10)).toEqual([]);
  });
  it('treats absent, non-array and oversized lists as empty',()=>{
    for(const value of [undefined,null,{},'x',3]) expect(sanitizeSceneEvents(value,10)).toEqual([]);
    const many=Array.from({length:MAX_SCENE_EVENTS+1},(_,i)=>({name:`e${i}`,start:i*0.1}));
    expect(sanitizeSceneEvents(many,10)).toEqual([]);
    expect(sanitizeSceneEvents(many.slice(0,MAX_SCENE_EVENTS),10)).toHaveLength(MAX_SCENE_EVENTS);
  });
});

describe('sanitizeSceneShots',()=>{
  it('keeps valid shots trimmed, sorted by start, with worldStart only when given',()=>{
    const out=sanitizeSceneShots([{name:' B ',start:5,end:8,worldStart:1},{name:'A',start:0,end:4},{name:'C',start:8,end:9.5}],10);
    expect(out).toEqual([{name:'A',start:0,end:4},{name:'B',start:5,end:8,worldStart:1},{name:'C',start:8,end:9.5}]);
    expect(Object.keys(out[0])).toEqual(['name','start','end']);
    expect(Object.keys(out[1])).toEqual(['name','start','end','worldStart']);
  });
  it('accepts worldStart at both ends of the duration',()=>{
    expect(sanitizeSceneShots([{name:'a',start:0,end:1,worldStart:0},{name:'b',start:1,end:2,worldStart:10}],10))
      .toEqual([{name:'a',start:0,end:1,worldStart:0},{name:'b',start:1,end:2,worldStart:10}]);
  });
  it('drops overlapping shots but keeps touching ones',()=>{
    expect(sanitizeSceneShots([
      {name:'A',start:0,end:4},{name:'overlap',start:3,end:6},{name:'touch',start:4,end:5},{name:'inside',start:4.5,end:4.8},
    ],10)).toEqual([{name:'A',start:0,end:4},{name:'touch',start:4,end:5}]);
  });
  it('drops invalid entries, including a bad worldStart',()=>{
    expect(sanitizeSceneShots([
      null,{name:'a',start:0},{name:'a',start:2,end:2},{name:'a',start:3,end:2},{name:'a',start:-1,end:1},{name:'a',start:0,end:11},
      {name:'a',start:0,end:1,worldStart:-1},{name:'a',start:0,end:1,worldStart:11},{name:'a',start:0,end:1,worldStart:NaN},
      {name:'a',start:0,end:1,worldStart:'1'},{name:'a',start:0,end:1,worldStart:null},
      {name:'   ',start:0,end:1},{name:7,start:0,end:1},{name:'x'.repeat(81),start:0,end:1},
      {name:'a',start:NaN,end:1},{name:'a',start:0,end:Infinity},
      {name:'ok',start:6,end:7,worldStart:3},
    ],10)).toEqual([{name:'ok',start:6,end:7,worldStart:3}]);
  });
  it('treats absent, non-array and oversized lists as empty',()=>{
    for(const value of [undefined,null,{},'x',3]) expect(sanitizeSceneShots(value,10)).toEqual([]);
    const many=Array.from({length:MAX_SCENE_SHOTS+1},(_,i)=>({name:`c${i}`,start:i*0.25,end:i*0.25+0.25}));
    expect(sanitizeSceneShots(many,10)).toEqual([]);
    expect(sanitizeSceneShots(many.slice(0,MAX_SCENE_SHOTS),10)).toHaveLength(MAX_SCENE_SHOTS);
  });
});

describe('sanitizeSceneExplore',()=>{
  const base={start:{position:[0,1,2],target:[3,4,5]}};
  it('keeps a minimal declaration without speed or bounds keys',()=>{
    const out=sanitizeSceneExplore(base)!;
    expect(out).toEqual(base);
    expect(Object.keys(out)).toEqual(['start']);
  });
  it('accepts speeds in (0, 10000] only',()=>{
    for(const speed of [0.5,1,10000]) expect(sanitizeSceneExplore({...base,speed})).toEqual({...base,speed});
    for(const speed of [0,-1,10001,NaN,Infinity,'2',null]) expect(sanitizeSceneExplore({...base,speed})).toBeNull();
    expect(Object.keys(sanitizeSceneExplore({...base,speed:undefined})!)).toEqual(['start']);
  });
  it('accepts bounds with min < max on every axis and keeps them',()=>{
    const out=sanitizeSceneExplore({...base,bounds:{min:[-1,-1,-1],max:[9,9,9]}})!;
    expect(out).toEqual({...base,bounds:{min:[-1,-1,-1],max:[9,9,9]}});
    expect(Object.keys(out)).toEqual(['start','bounds']);
  });
  it('rejects bounds that are not strictly ordered, malformed or non-finite',()=>{
    const bad=[
      {min:[0,0,0],max:[0,9,9]},{min:[9,0,0],max:[0,9,9]},{min:[0,0,0]},{min:[0,0],max:[9,9]},
      {min:[0,0,NaN],max:[9,9,9]},{min:[0,0,0],max:[9,9,Infinity]},null,'box',
    ];
    for(const bounds of bad) expect(sanitizeSceneExplore({...base,bounds})).toBeNull();
  });
  it('clamps the start position into the bounds',()=>{
    expect(sanitizeSceneExplore({start:{position:[-5,5,20],target:[3,4,5]},bounds:{min:[0,0,0],max:[10,10,10]}}))
      .toEqual({start:{position:[0,5,10],target:[3,4,5]},bounds:{min:[0,0,0],max:[10,10,10]}});
  });
  it('rejects position equal to target and any non-finite or malformed vector',()=>{
    expect(sanitizeSceneExplore({start:{position:[1,2,3],target:[1,2,3]}})).toBeNull();
    expect(sanitizeSceneExplore({start:{position:[1,2,3],target:[1,2,4]}})).not.toBeNull();
    expect(sanitizeSceneExplore({start:{position:[0,0,NaN],target:[1,1,1]}})).toBeNull();
    expect(sanitizeSceneExplore({start:{position:[0,0],target:[1,1,1]}})).toBeNull();
    expect(sanitizeSceneExplore({start:{position:[0,0,0],target:[1,'1',1]}})).toBeNull();
  });
  it('rejects the whole declaration when any part is invalid',()=>{
    expect(sanitizeSceneExplore(undefined)).toBeNull();
    expect(sanitizeSceneExplore(null)).toBeNull();
    expect(sanitizeSceneExplore('explore')).toBeNull();
    expect(sanitizeSceneExplore({})).toBeNull();
    expect(sanitizeSceneExplore({start:null})).toBeNull();
    expect(sanitizeSceneExplore({...base,speed:0,bounds:{min:[0,0,0],max:[9,9,9]}})).toBeNull();
    expect(sanitizeSceneExplore({...base,speed:5,bounds:{min:[0,0,0],max:[0,9,9]}})).toBeNull();
  });
});

describe('sanitizeSceneView',()=>{
  it('normalises the quaternion and clamps fov to 10-120',()=>{
    expect(sanitizeSceneView({position:[1,2,3],quaternion:[0,3,0,4],fov:45})).toEqual({position:[1,2,3],quaternion:[0,0.6,0,0.8],fov:45});
    const unit=sanitizeSceneView({position:[0,0,0],quaternion:[0,0,0,2],fov:200})!;
    expect(unit.quaternion).toEqual([0,0,0,1]);
    expect(unit.fov).toBe(120);
    expect(sanitizeSceneView({position:[0,0,0],quaternion:[0,0,0,1],fov:1})!.fov).toBe(10);
  });
  it('returns undefined for a zero or non-finite quaternion and any non-finite part',()=>{
    expect(sanitizeSceneView({position:[0,0,0],quaternion:[0,0,0,0],fov:45})).toBeUndefined();
    expect(sanitizeSceneView({position:[0,0,0],quaternion:[0,0,NaN,1],fov:45})).toBeUndefined();
    expect(sanitizeSceneView({position:[0,0,0],quaternion:[0,0,0],fov:45})).toBeUndefined();
    expect(sanitizeSceneView({position:[0,Infinity,0],quaternion:[0,0,0,1],fov:45})).toBeUndefined();
    expect(sanitizeSceneView({position:[0,0,0],quaternion:[0,0,0,1],fov:NaN})).toBeUndefined();
    expect(sanitizeSceneView({position:[0,0],quaternion:[0,0,0,1],fov:45})).toBeUndefined();
    expect(sanitizeSceneView(undefined)).toBeUndefined();
    expect(sanitizeSceneView('view')).toBeUndefined();
  });
});

describe('SceneFrameHost world info',()=>{
  const host=(duration=60)=>{
    const sent: Record<string,unknown>[]=[];
    const reports: SceneStatus[]=[];
    const h=new SceneFrameHost(pkg(duration),'i',m=>sent.push(m),s=>reports.push(s));
    const ack=(extra:Record<string,unknown>)=>h.receive({protocol:'astrid.scene/1',instance:'i',revision:DIGEST,kind:'initialized',...extra});
    return {h,sent,reports,ack};
  };
  it('is empty until initialized',()=>{
    const {h,ack}=host();
    expect(h.events).toEqual([]);expect(h.shots).toEqual([]);expect(h.explore).toBeNull();
    expect(h.info).toEqual({events:[],shots:[],explore:null});
    ack({});
    expect(h.info).toEqual({events:[],shots:[],explore:null});
    h.dispose(false);
  });
  it('re-validates what the child declared against the manifest duration',()=>{
    const {h,ack}=host(10);
    const events=[{name:' Bridge ',start:9,end:10},{name:'late',start:11},{name:'',start:1}];
    const shots=[{name:'A',start:0,end:4},{name:'B',start:3,end:6},{name:'C',start:6,end:10,worldStart:2}];
    const explore={start:{position:[0,0,0],target:[0,0,1]},bounds:{min:[-5,-5,-5],max:[5,5,5]},speed:3};
    ack({events,shots,explore});
    expect(h.events).toEqual(sanitizeSceneEvents(events,10));
    expect(h.shots).toEqual(sanitizeSceneShots(shots,10));
    expect(h.explore).toEqual(sanitizeSceneExplore(explore));
    expect(h.events).toEqual([{name:'Bridge',start:9,end:10}]);
    expect(h.shots).toEqual([{name:'A',start:0,end:4},{name:'C',start:6,end:10,worldStart:2}]);
    expect(h.info).toEqual({events:h.events,shots:h.shots,explore:h.explore});
    h.dispose(false);
  });
  it('treats absent or invalid declarations as empty, and null explore',()=>{
    const {h,ack}=host(10);
    ack({events:'nope',shots:{},explore:{start:{position:[1,1,1],target:[1,1,1]}}});
    expect(h.events).toEqual([]);expect(h.shots).toEqual([]);expect(h.explore).toBeNull();
    h.dispose(false);
  });
});

describe('SceneFrameHost render frames',()=>{
  const host=(duration=10)=>{
    const sent: Record<string,unknown>[]=[];
    const reports: SceneStatus[]=[];
    const h=new SceneFrameHost(pkg(duration),'i',m=>sent.push(m),s=>reports.push(s));
    const ack=(extra:Record<string,unknown>)=>h.receive({protocol:'astrid.scene/1',instance:'i',revision:DIGEST,kind:'initialized',...extra});
    return {h,sent,reports,ack};
  };
  it('sends the normalised view and worldTime when requested',()=>{
    const {h,sent,ack}=host();
    ack({});
    h.request({sourceTime:2,width:640,height:360,view:{position:[1,2,3],quaternion:[0,0,0,2],fov:200},worldTime:2});
    expect(sent.at(-1)).toMatchObject({kind:'render',sourceTime:2,width:640,height:360,worldTime:2});
    expect(sent.at(-1)!.view).toEqual({position:[1,2,3],quaternion:[0,0,0,1],fov:120});
    h.dispose(false);
  });
  it('sends no view or worldTime keys for a timeline or export request',()=>{
    const {h,sent,ack}=host();
    ack({});
    h.request({sourceTime:2,width:640,height:360});
    ack({kind:'frame',requestId:sent.at(-1)!.requestId,sourceTime:2});
    h.request({sourceTime:3,width:640,height:360});
    expect(Object.keys(sent.at(-1)!).sort()).toEqual(['height','instance','kind','protocol','requestId','revision','sourceTime','width']);
    h.dispose(false);
  });
  it('drops an invalid view without reporting an error',()=>{
    const {h,sent,reports,ack}=host();
    ack({});
    h.request({sourceTime:1,width:10,height:10,view:{position:[0,0,0],quaternion:[0,0,0,0],fov:45}});
    expect(sent.at(-1)).toMatchObject({kind:'render',sourceTime:1});
    expect(sent.at(-1)).not.toHaveProperty('view');
    expect(reports.some(r=>r.phase==='error')).toBe(false);
    h.dispose(false);
  });
  it('drops a worldTime outside 0..duration or non-finite without failing',()=>{
    for(const worldTime of [-1,11,NaN,Infinity,'3',null]) {
      const {h,sent,reports,ack}=host();
      ack({});
      h.request({sourceTime:1,width:10,height:10,worldTime:worldTime as number});
      expect(sent.at(-1)).not.toHaveProperty('worldTime');
      expect(reports.some(r=>r.phase==='error')).toBe(false);
      h.dispose(false);
    }
    for(const worldTime of [0,10]) {
      const {h,sent,ack}=host();
      ack({});
      h.request({sourceTime:1,width:10,height:10,worldTime});
      expect(sent.at(-1)).toMatchObject({worldTime});
      h.dispose(false);
    }
  });
});

describe('bridge in sceneDocument',()=>{
  // Runs the injected bridge against a stub iframe window. `declared` supplies the scene's
  // events/shots/explore; an undefined value means the property is absent and an Error is thrown on read.
  type Declared={events?:unknown;shots?:unknown;explore?:unknown};
  async function run(declared: Declared, duration=60, canvases: {width:number;height:number}[]=[], drawn: unknown[]=[]) {
    const html=sceneDocument(pkg(duration),'i');
    const script=/<script>([\s\S]*)<\/script><\/body>/.exec(html)![1];
    const posted: Record<string,unknown>[]=[];
    const renders: Record<string,unknown>[]=[];
    const parent={postMessage:(m:Record<string,unknown>)=>posted.push(m)};
    let listener:(e:unknown)=>void=()=>{};
    const scene:Record<string,unknown>={
      initialize:async()=>{},
      render:async(arg:Record<string,unknown>)=>{renders.push(arg);},
      dispose:()=>{},
    };
    for(const key of ['events','shots','explore'] as const) {
      const value=declared[key];
      if(value===undefined) continue;
      Object.defineProperty(scene,key,{get:()=>{ if(value instanceof Error) throw value; return value; }});
    }
    const win={astridScene:scene};
    new Function('window','document','parent','addEventListener',script)(
      win,{fonts:{ready:Promise.resolve(),status:'loaded'},images:[],
        querySelectorAll:()=>canvases,
        createElement:()=>({width:0,height:0,getContext:()=>({drawImage:(...a:unknown[])=>drawn.push(a)}),toDataURL:(type:string)=>`data:${type};base64,AAAA`})},parent,(type:string,fn:(e:unknown)=>void)=>{ if(type==='message') listener=fn; });
    const send=(data:Record<string,unknown>)=>listener({source:parent,data:{protocol:'astrid.scene/1',instance:'i',revision:DIGEST,...data}});
    send({kind:'initialize'});
    await vi.waitFor(()=>expect(posted.length).toBeGreaterThan(0));
    let requestId=0;
    // Sends one render message and resolves with the object the bridge passed to window.astridScene.render.
    const render=async(frame:Record<string,unknown>)=>{
      const id=++requestId;
      send({kind:'render',requestId:id,...frame});
      await vi.waitFor(()=>expect(posted.some(m=>m.kind==='frame'&&m.requestId===id)).toBe(true));
      return {arg:renders.at(-1)!,calls:renders.length,frame:posted.filter(m=>m.requestId===id).at(-1)};
    };
    return {ack:posted[0],posted,renders,render};
  }
  it('adds events, shots and explore to the initialized acknowledgement',async()=>{
    const {ack}=await run({
      events:[{name:' B ',start:3,end:4},{name:'A',start:1},{name:'past',start:99},{name:'',start:2}],
      shots:[{name:'one',start:0,end:4},{name:'overlap',start:2,end:5},{name:'two',start:4,end:6,worldStart:1}],
      explore:{start:{position:[0,0,0],target:[0,0,1]},speed:4},
    },10);
    expect(ack).toEqual({
      protocol:'astrid.scene/1',instance:'i',revision:DIGEST,kind:'initialized',
      events:[{name:'A',start:1},{name:'B',start:3,end:4}],
      shots:[{name:'one',start:0,end:4},{name:'two',start:4,end:6,worldStart:1}],
      explore:{start:{position:[0,0,0],target:[0,0,1]},speed:4},
    });
  });
  it('sends empty lists and null explore when absent, invalid or throwing',async()=>{
    const absent=await run({},10);
    expect(absent.ack).toMatchObject({kind:'initialized',events:[],shots:[],explore:null});
    const throwing=await run({events:new Error('boom'),shots:new Error('boom'),explore:new Error('boom')},10);
    expect(throwing.ack).toMatchObject({kind:'initialized',events:[],shots:[],explore:null});
    const invalid=await run({events:'nope',shots:Array.from({length:MAX_SCENE_SHOTS+1},(_,i)=>({name:'c',start:i,end:i+1})),explore:{start:{position:[0,0,0],target:[0,0,0]}}},10);
    expect(invalid.ack).toMatchObject({kind:'initialized',events:[],shots:[],explore:null});
  });
  it('rejects an explore with any invalid part as null',async()=>{
    const cases=[
      {start:{position:[0,0,0],target:[0,0,1]},speed:0},
      {start:{position:[0,0,0],target:[0,0,1]},bounds:{min:[0,0,0],max:[0,1,1]}},
      {start:{position:[0,0,0],target:[0,0,1]},bounds:'box'},
      {start:{position:[0,0,0],target:[0,0,0]}},
      {start:{position:[0,0,0]}},
    ];
    for(const explore of cases) expect((await run({explore},10)).ack).toMatchObject({explore:null});
  });
  it('matches the host sanitizers for a table of inputs',async()=>{
    const duration=10;
    const tables: Declared[]=[
      {events:[{name:' Bridge ',start:5,end:7},{name:'Start',start:0},{name:'Lake',start:2.5,extra:1}]},
      {events:[null,'s',{name:'a',start:-1},{name:'a',start:11},{name:'a',start:1,end:0},{name:'a',start:1,end:NaN},{name:'  ',start:1},{name:'ok',start:4,end:4}]},
      {events:Array.from({length:MAX_SCENE_EVENTS+1},(_,i)=>({name:`e${i}`,start:i*0.1}))},
      {events:Array.from({length:MAX_SCENE_EVENTS},(_,i)=>({name:`e${i}`,start:i*0.1}))},
      {shots:[{name:'A',start:0,end:4},{name:'overlap',start:3,end:6},{name:'touch',start:4,end:5,worldStart:9},{name:'bad',start:5,end:6,worldStart:11}]},
      {shots:[{name:'x',start:6,end:6},{name:'y',start:1,end:2,worldStart:0},{name:'z',start:0,end:1,worldStart:-0.5}]},
      {shots:Array.from({length:MAX_SCENE_SHOTS+1},(_,i)=>({name:`c${i}`,start:i*0.25,end:i*0.25+0.25}))},
      {explore:{start:{position:[-5,5,20],target:[3,4,5]},bounds:{min:[0,0,0],max:[10,10,10]},speed:10000}},
      {explore:{start:{position:[0,0,0],target:[0,0,1]},bounds:{min:[0,0,0],max:[0,9,9]}}},
      {explore:{start:{position:[0,0,0],target:[0,0,1]},speed:10001}},
      {explore:{start:{position:[1,1,1],target:[1,1,1]}}},
      {explore:{start:{position:[0,0,0],target:[0,0,1]},speed:2}},
      {events:[{name:'a',start:1}],shots:[{name:'b',start:0,end:2}],explore:{start:{position:[0,0,0],target:[1,0,0]}}},
    ];
    for(const declared of tables) {
      const {ack}=await run(declared,duration);
      expect(ack.events).toEqual(sanitizeSceneEvents(declared.events,duration));
      expect(ack.shots).toEqual(sanitizeSceneShots(declared.shots,duration));
      expect(ack.explore).toEqual(sanitizeSceneExplore(declared.explore));
    }
  });
  it('sanitizes the render view and passes worldTime when a frame carries both',async()=>{
    const {render}=await run({},10);
    const {arg}=await render({sourceTime:2,width:640,height:360,view:{position:[1,2,3],quaternion:[0,0,0,2],fov:200},worldTime:4});
    expect(arg).toEqual({sourceTime:2,width:640,height:360,view:{position:[1,2,3],quaternion:[0,0,0,1],fov:120},worldTime:4});
    expect(Object.keys(arg).sort()).toEqual(['height','sourceTime','view','width','worldTime']);
  });
  it('passes exactly sourceTime, width and height when the frame has no view or worldTime',async()=>{
    const {render}=await run({},10);
    const {arg}=await render({sourceTime:2,width:640,height:360});
    expect(Object.keys(arg).sort()).toEqual(['height','sourceTime','width']);
    expect(arg).toEqual({sourceTime:2,width:640,height:360});
  });
  it('drops an invalid view or out-of-range worldTime without an error frame',async()=>{
    const {render}=await run({},10);
    const invalid=await render({sourceTime:1,width:10,height:10,view:{position:[0,0,0],quaternion:[0,0,0,0],fov:45},worldTime:11});
    expect(Object.keys(invalid.arg).sort()).toEqual(['height','sourceTime','width']);
    expect(invalid.frame).toMatchObject({kind:'frame',sourceTime:1});
  });
  it('reads a still from the largest canvas only when the frame asks for one',async()=>{
    const small={width:10,height:10},big={width:640,height:360};
    const drawn:unknown[]=[];
    const {render}=await run({},10,[small,big],drawn);
    const plain=await render({sourceTime:1,width:320,height:180});
    expect(plain.frame).not.toHaveProperty('image');
    expect(drawn).toHaveLength(0);
    const captured=await render({sourceTime:1,width:320,height:180,capture:true});
    expect(captured.frame).toMatchObject({kind:'frame',image:'data:image/jpeg;base64,AAAA'});
    expect(drawn).toHaveLength(1);
    expect((drawn[0] as unknown[])[0]).toBe(big);
    expect(Object.keys(captured.arg).sort()).toEqual(['height','sourceTime','width']);
  });
  it('omits the still, not the frame, when there is no canvas or the size exceeds the limit',async()=>{
    const none=await (await run({},10,[])).render({sourceTime:1,width:320,height:180,capture:true});
    expect(none.frame).toMatchObject({kind:'frame'});
    expect(none.frame).not.toHaveProperty('image');
    const oversize=await (await run({},10,[{width:9,height:9}])).render({sourceTime:1,width:2000,height:1000,capture:true});
    expect(oversize.frame).not.toHaveProperty('image');
  });
});

describe('stills on the host',()=>{
  const jpeg='data:image/jpeg;base64,/9j/4AAQ';
  it('accepts only small image data URLs',()=>{
    expect(sanitizeSceneStill(jpeg)).toBe(jpeg);
    for(const bad of [undefined,null,3,'http://x/y.jpg','data:text/html;base64,AAAA','data:image/svg+xml;base64,AAAA','data:image/jpeg;base64,AA AA',`data:image/jpeg;base64,${'A'.repeat(MAX_STILL_CHARS)}`])
      expect(sanitizeSceneStill(bad)).toBeUndefined();
  });
  function host(duration=10){
    const sent: Record<string,unknown>[]=[];const reports: SceneStatus[]=[];
    const h=new SceneFrameHost(pkg(duration),'i',m=>sent.push(m),s=>reports.push(s));
    const got=(m:Record<string,unknown>)=>h.receive({protocol:'astrid.scene/1',instance:'i',revision:DIGEST,...m});
    got({kind:'initialized'});
    return {h,sent,reports,got};
  }
  it('sends capture only when asked and reports the validated image on the acknowledged frame',()=>{
    const {h,sent,reports,got}=host();
    h.request({sourceTime:2,width:320,height:180,capture:true});
    expect(sent.at(-1)).toMatchObject({kind:'render',capture:true});
    got({kind:'frame',requestId:sent.at(-1)!.requestId,sourceTime:2,image:jpeg});
    expect(reports.at(-1)).toMatchObject({phase:'ready',sourceTime:2,image:jpeg});
    h.request({sourceTime:3,width:320,height:180});
    expect(sent.at(-1)).not.toHaveProperty('capture');
    got({kind:'frame',requestId:sent.at(-1)!.requestId,sourceTime:3,image:jpeg});
    expect(reports.at(-1)).not.toHaveProperty('image');
    h.dispose(false);
  });
  it('drops a malformed still without failing the scene, and rejects an oversized still request',()=>{
    const {h,sent,reports,got}=host();
    h.request({sourceTime:2,width:320,height:180,capture:true});
    got({kind:'frame',requestId:sent.at(-1)!.requestId,sourceTime:2,image:'javascript:alert(1)'});
    expect(reports.at(-1)).toMatchObject({phase:'ready'});
    expect(reports.at(-1)).not.toHaveProperty('image');
    h.request({sourceTime:2,width:4000,height:2000,capture:true});
    expect(reports.at(-1)).toMatchObject({phase:'error'});
  });
});
