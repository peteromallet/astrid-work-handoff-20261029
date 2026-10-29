// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createElementAdmissionsPlugin,generateElementAdmissionModule} from '../../../../config/vite/astridElementAdmissions';
import {projectPackDocumentId,selectProjectElements,sha256,stableJson} from '../../../../config/vite/projectElementSelection';
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();roots.splice(0).forEach(root=>fs.rmSync(root,{recursive:true,force:true}));});
function fixture(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'project-elements-')));roots.push(root);
 const artifactRoot=path.join(root,'artifacts'),sourceRoot=path.join(root,'sources');const realmId='realm',projectId='project',packId='project_pack';
 const ref={packId,id:'blocks',kind:'effect' as const,revision:'sha256:old'};
 const source='export default function Blocks(){return null;}';const files=[{path:'component.tsx',sha256:sha256(source)}];const closure=sha256(stableJson(files));
 const snapshotRoot=path.join(artifactRoot,realmId,projectId,packId,'snapshots',closure);fs.mkdirSync(snapshotRoot,{recursive:true});fs.writeFileSync(path.join(snapshotRoot,'component.tsx'),source);
 const content={schema:'astrid.project-pack/v1',pack_id:packId,source_binding_key:'project-packs',relative_manifest:`${realmId}/${projectId}/packs/${packId}/pack.yaml`,admissions:[{id:ref.id,kind:ref.kind,revision:ref.revision,snapshot_digest:closure}]};
 const document={document_id:projectPackDocumentId(projectId),project_id:projectId,kind:'astrid.project-pack',version:2,content};
 const packRoot=path.dirname(path.join(sourceRoot,content.relative_manifest));
 const index={schema:'astrid.element-admissions/v1',realmId,binding:{projectId,documentId:document.document_id,documentVersion:2,contentDigest:'sha256:'+sha256(stableJson(content))},
  projects:[{projectId,packId,packRoot,status:'ready',initCommand:'init',admitCommand:'admit',inspectCommand:'inspect'}],
  elements:[{projectId,descriptor:{...ref,label:'Blocks',componentPath:`external/${packId}/old/component.tsx`,parameters:[],schema:{type:'object'},defaults:{}},authoring:{packRoot,componentPath:path.join(packRoot,'component.tsx'),descriptorPath:path.join(packRoot,'element.yaml'),status:'ready'},snapshot:{root:snapshotRoot,componentPath:'component.tsx',files}}]};
 const readDocument=vi.fn(async(_project:string,id:string)=>id===document.document_id?document:null);
 const resolveRecord=vi.fn(async()=>({...index.elements[0],binding:index.binding}));
 return {root,projectId,ref,content,document,index,options:{realmId,artifactRoot,sourceRoot,readDocument,resolveRecord,verificationCache:new Map(),resolvedCache:new Map()}};
}
describe('Runtime-owned active project admission selection',()=>{
 it('reads one canonical default binding and only exact required snapshot input despite1000 unrelated documents/artifacts',async()=>{
  const f=fixture();const unrelated=new Map(Array.from({length:1000},(_,i)=>['unrelated-'+i,{project_id:'other',content:{}}]));
  f.options.readDocument.mockImplementation(async(_project,id)=>{if(unrelated.has(id))throw new Error('Unrelated document read');return id===f.document.document_id?f.document:null;});
  const read=vi.spyOn(fs,'readFileSync');
  const selected=await selectProjectElements(f.projectId,[f.ref],f.options);
  expect(f.options.readDocument).toHaveBeenCalledTimes(1);expect(f.options.resolveRecord).toHaveBeenCalledTimes(1);
  expect(selected.elements).toHaveLength(1);expect(selected.files).toHaveLength(1);expect(selected.unavailable).toEqual([]);
  const module=generateElementAdmissionModule(selected,true);
  expect(module.match(/^import Component/gm)).toHaveLength(1);expect(module).not.toContain('unrelated-');
  expect(f.options.resolveRecord).toHaveBeenCalledWith(f.projectId,f.ref);
  const firstHashes=read.mock.calls.length;
  await selectProjectElements(f.projectId,[f.ref],f.options);
  expect(read.mock.calls.length).toBe(firstHashes); // immutable closure verified once, not1000 unrelated hashes or repeated compilation
 });
 it('invalidates only a changed selected immutable build without remounting the editor host',async()=>{
  const f=fixture();const plugin=createElementAdmissionsPlugin(f.options);
  let middleware!: (request:unknown,response:unknown)=>Promise<void>;
  const server={middlewares:{use:(_path:string,handler:typeof middleware)=>{middleware=handler;}},config:{server:{fs:{allow:[]}}},ws:{send:vi.fn()}};
  await (plugin.configureServer as (value:typeof server)=>unknown)(server);
  async function request(){
    let statusCode=200;let body='';
    const req={method:'POST',async *[Symbol.asyncIterator](){yield JSON.stringify({projectId:f.projectId,refs:[f.ref]});}};
    const response={setHeader(){},get statusCode(){return statusCode;},set statusCode(value:number){statusCode=value;},end(value:string){body=value;}};
    await middleware(req,response);return {statusCode,body};
  }
  expect((await request()).statusCode).toBe(200);
  expect(f.options.resolveRecord).toHaveBeenCalledTimes(1);
  const file=f.index.elements[0].snapshot.root+'/component.tsx';
  fs.writeFileSync(file,'export default function Changed(){return null;}');
  expect((plugin.handleHotUpdate as (context:{file:string;server:typeof server})=>unknown)({file,server})).toEqual([]);
  expect(server.ws.send).toHaveBeenCalledWith({type:'custom',event:'astrid:elements-admitted',data:{}});
  const next=await request();expect(next.statusCode).toBe(409);expect(next.body).toContain('Stale');
  expect(f.options.resolveRecord).toHaveBeenCalledTimes(2);
 });
 it('loads an admitted TSX module through the actual Vite React dev transform without admitting authored host-runtime imports',async()=>{
  const f=fixture();const file=f.index.elements[0].snapshot.root+'/component.tsx';
  const source='import React from "react"; export default function Blocks(){return <div>Admitted</div>;}';
  fs.writeFileSync(file,source);const files=[{path:'component.tsx',sha256:sha256(source)}];
  const closure=sha256(stableJson(files));const nextRoot=path.join(f.options.artifactRoot,f.options.realmId,f.projectId,f.ref.packId,'snapshots',closure);
  fs.renameSync(path.dirname(file),nextRoot);f.index.elements[0].snapshot={root:nextRoot,componentPath:'component.tsx',files};f.content.admissions[0].snapshot_digest=closure;
  f.index.binding.contentDigest='sha256:'+sha256(stableJson(f.content));
  const server=await createServer({configFile:false,root:process.cwd(),plugins:[createElementAdmissionsPlugin(f.options),react()],
    resolve:{alias:{react:path.resolve('node_modules/react')}},optimizeDeps:{noDiscovery:true},server:{host:'127.0.0.1',port:0,strictPort:false,watch:{ignored:['**/*']}}});
  try{
    await server.listen();const address=server.httpServer!.address() as {port:number};
    const response=await fetch(`http://127.0.0.1:${address.port}/api/astrid-element-admissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:f.projectId,refs:[f.ref]})});
    expect(response.status).toBe(200);const info=await response.json();
    const origin=`http://127.0.0.1:${address.port}`;
    const module=await fetch(origin+info.moduleUrl);expect(module.status).toBe(200);expect(await module.text()).toContain('Component0');
    const compiled=await fetch(origin+'/@fs'+nextRoot+'/component.tsx');
    expect(compiled.status).toBe(200);const code=await compiled.text();
    expect(code).toContain('/@react-refresh');expect(code).toContain('Admitted');
  }finally{await server.close();}
 });
 it('loads no artifact or component for read-only lazy pack discovery',async()=>{
  const f=fixture();f.options.readDocument.mockResolvedValue(null);
  const result=await selectProjectElements(f.projectId,[],f.options);
  expect(result.projects[0].status).toBe('not-created');expect(f.options.readDocument).toHaveBeenCalledTimes(1);expect(f.options.resolveRecord).not.toHaveBeenCalled();expect(result.elements).toEqual([]);
 });
 it('rejects stale derived selection and a mismatched canonical snapshot, without accepting a newer ref',async()=>{
  const f=fixture();f.index.binding.documentVersion=1;
  await expect(selectProjectElements(f.projectId,[f.ref],f.options)).rejects.toThrow('raced');
  f.index.binding.documentVersion=2;f.index.elements[0].snapshot.root+='/different';
  await expect(selectProjectElements(f.projectId,[f.ref],f.options)).rejects.toThrow('canonical project');
 });
 it('does not substitute latest when the requested old pin is absent',async()=>{
  const f=fixture();const old={...f.ref,revision:'sha256:missing'};
  const result=await selectProjectElements(f.projectId,[old],f.options);
  expect(result.unavailable).toEqual([old]);expect(result.elements).toEqual([]);expect(f.options.resolveRecord).not.toHaveBeenCalled();
 });
 it('rejects a different project document and unsafe source binding',async()=>{
  const f=fixture();f.document.project_id='other';await expect(selectProjectElements(f.projectId,[f.ref],f.options)).rejects.toThrow('another project');
  f.document.project_id='project';f.content.relative_manifest='../escape';await expect(selectProjectElements(f.projectId,[f.ref],f.options)).rejects.toThrow('Unsafe');
 });
});
