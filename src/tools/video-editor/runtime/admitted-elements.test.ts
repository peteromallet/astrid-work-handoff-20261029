import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmittedElementSelection } from './admitted-elements';
const deferred = <T,>() => {let resolve!: (value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
let host: typeof import('./admitted-elements');
beforeEach(async()=>{vi.resetModules();host=await import('./admitted-elements');});
const build=(digest:string,revision='old'):AdmittedElementSelection=>({projectId:'project',configured:true,selectionDigest:digest,realmId:'realm',projects:[],
  elements:[{projectId:'project',descriptor:{id:'blocks',kind:'effect',packId:'project_pack',revision} as never,authoring:{packRoot:'/canonical',descriptorPath:'/canonical/element.yaml',componentPath:'/canonical/component.tsx',status:'ready'}}],
  components:{[JSON.stringify(['project_pack','effect','blocks',revision])]:()=>null}});
const info=(digest:string)=>({digest,moduleUrl:'/@@'.replace('@@','@id/__x00__virtual:astrid-element-admissions?v=')+digest});
describe('atomic admitted host refresh',()=>{
  it('reports scoped preparation while fetching/importing, then settles even when an exact pin is absent', async () => {
    const ref={packId:'project_pack',kind:'effect' as const,id:'missing',revision:'missing-revision'};
    expect(host.isAdmittedElementPreviewPreparing('project',[ref])).toBe(true);
    host.setAdmittedElementScope('project',[ref]);
    const pending=deferred<AdmittedElementSelection>();
    const digest='7'.repeat(64);
    const loading=host.refreshAdmittedElements(async()=>info(digest),()=>pending.promise);
    await Promise.resolve();
    expect(host.getAdmittedElementReadiness()).toMatchObject({projectId:'project',phase:'loading',error:null});
    expect(host.isAdmittedElementPreviewPreparing('project',[ref])).toBe(true);
    pending.resolve({...build(digest),elements:[],components:{}});
    await loading;
    expect(host.getAdmittedElementReadiness().phase).toBe('ready');
    expect(host.admittedComponent(ref)).toBeUndefined();
    expect(host.isAdmittedElementPreviewPreparing('project',[ref])).toBe(false);
    expect(host.isAdmittedElementPreviewPreparing('other-project',[ref])).toBe(true);
    expect(host.isAdmittedElementPreviewPreparing('project',[{...ref,revision:'new-unchecked-pin'}])).toBe(true);
  });
  it('ends loading on a genuine failure and retains the diagnostic', async () => {
    host.setAdmittedElementScope('project',[]);
    await expect(host.refreshAdmittedElements(async()=>{throw new Error('Admission endpoint refused this pack');})).rejects.toThrow('refused');
    expect(host.getAdmittedElementReadiness()).toMatchObject({phase:'error',error:'Admission endpoint refused this pack'});
    await host.refreshAdmittedElements(async()=>info('5'.repeat(64)),async()=>build('5'.repeat(64)));
    expect(host.getAdmittedElementReadiness()).toMatchObject({phase:'ready',error:null});
  });
  it('bounds a stalled import and ignores its late completion', async () => {
    vi.useFakeTimers();
    try {
      host.setAdmittedElementScope('project',[]);
      const digest='6'.repeat(64);
      const pending=deferred<AdmittedElementSelection>();
      const loading=host.refreshAdmittedElements(async()=>info(digest),()=>pending.promise);
      const rejected=expect(loading).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(host.ADMITTED_ELEMENT_LOAD_TIMEOUT_MS);
      await rejected;
      expect(host.getAdmittedElementReadiness().phase).toBe('error');
      pending.resolve(build(digest));
      await Promise.resolve();
      expect(host.getAdmittedElementSelection().selectionDigest).not.toBe(digest);
    } finally { vi.useRealTimers(); }
  });
  it('adopts real native module namespace exports without trying to freeze the namespace',async()=>{
    const digest='9'.repeat(64);
    const source=`export const projectId='project';export const configured=true;export const selectionDigest='${digest}';export const realmId='realm';export const projects=[];export const elements=[{projectId:'project',descriptor:{id:'blocks',kind:'effect',packId:'project_pack',revision:'old'},authoring:{}}];export const components={'["project_pack","effect","blocks","old"]':()=>null};`;
    const namespace=await import(/* @vite-ignore */ 'data:text/javascript,'+encodeURIComponent(source));
    expect(namespace[Symbol.toStringTag]).toBe('Module');
    expect(()=>Object.freeze(namespace)).toThrow(TypeError);
    await host.refreshAdmittedElements(async()=>info(digest),async()=>namespace);
    expect(host.getAdmittedElementSelection()).not.toBe(namespace);
    expect(Object.isFrozen(host.getAdmittedElementSelection())).toBe(true);
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'old'})).toBeTypeOf('function');
  });

  it('adds exact pinned implementations without replacing a mounted owner/adapter lifetime',async()=>{
    const owner={active:true};const assertAuthority=()=>{if(!owner.active)throw new Error('retired');};
    const descriptor=build('a'.repeat(64));let changes=0;const release=host.subscribeAdmittedElements(()=>{assertAuthority();changes++;});
    await host.refreshAdmittedElements(async()=>info(descriptor.selectionDigest),async()=>descriptor);
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'old'})).toBeTypeOf('function');
    expect(host.admittedComponent({packId:'other',kind:'effect',id:'blocks',revision:'old'})).toBeUndefined();
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'new'})).toBeUndefined();
    expect(owner.active).toBe(true);expect(changes).toBe(1);release();
  });
  it('rejects a failed/incomplete/foreign build atomically and retains prior revisions',async()=>{
    const first=build('a'.repeat(64));await host.refreshAdmittedElements(async()=>info(first.selectionDigest),async()=>first);
    const activated=host.getAdmittedElementSelection();
    const incomplete={...build('b'.repeat(64)),components:{}};await expect(host.refreshAdmittedElements(async()=>info(incomplete.selectionDigest),async()=>incomplete)).rejects.toThrow('incomplete');
    expect(host.getAdmittedElementSelection()).toBe(activated);
    const changed=build('c'.repeat(64),'new');await host.refreshAdmittedElements(async()=>info(changed.selectionDigest),async()=>changed);
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'old'})).toBeUndefined();
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'new'})).toBeTypeOf('function');
    await expect(host.refreshAdmittedElements(async()=>({digest:'d'.repeat(64),moduleUrl:'https://other/code.js'}),async()=>first)).rejects.toThrow('host-selected');
  });
  it('fences a late project A import after switching to project B and never leaks the old exact map',async()=>{
    host.setAdmittedElementScope('project-a',[]);
    const old={...build('a'.repeat(64)),projectId:'project-a'};
    const pending=deferred<AdmittedElementSelection>();
    const loading=host.refreshAdmittedElements(async()=>info(old.selectionDigest),()=>pending.promise);
    await Promise.resolve();
    host.setAdmittedElementScope('project-b',[]);
    expect(host.getAdmittedElementSelection().projectId).toBe('project-b');
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'old'})).toBeUndefined();
    pending.resolve(old);await loading;
    expect(host.getAdmittedElementSelection().projectId).toBe('project-b');
    expect(host.getAdmittedElementReadiness()).toMatchObject({projectId:'project-b',phase:'loading'});
    expect(host.getAdmittedElementSelection().elements).toEqual([]);
    const next={...build('b'.repeat(64),'b'),projectId:'project-b'};
    await host.refreshAdmittedElements(async()=>info(next.selectionDigest),async()=>next);
    expect(host.getAdmittedElementSelection().projectId).toBe('project-b');
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'b'})).toBeTypeOf('function');
    expect(host.admittedComponent({packId:'project_pack',kind:'effect',id:'blocks',revision:'old'})).toBeUndefined();
  });
  it('ignores an older completion after a newer refresh has won',async()=>{
    const old=build('a'.repeat(64));const pending=deferred<AdmittedElementSelection>();
    const slow=host.refreshAdmittedElements(async()=>info(old.selectionDigest),()=>pending.promise);await Promise.resolve();
    const next=build('b'.repeat(64));await host.refreshAdmittedElements(async()=>info(next.selectionDigest),async()=>next);
    pending.resolve(old);await slow;expect(host.getAdmittedElementSelection()).toEqual(next);
  });
});
