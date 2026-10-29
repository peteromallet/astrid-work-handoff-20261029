import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { Plugin, ViteDevServer } from 'vite';
import {stableJson, selectProjectElements, type ProjectSelectionOptions, type ElementRef} from './projectElementSelection';

export const ADMISSION_MODULE = 'virtual:astrid-element-admissions';
const RESOLVED = '\0' + ADMISSION_MODULE;
const INFO_PATH = '/api/astrid-element-admissions';
const allowedBare = new Set(['react', 'react/jsx-runtime', 'remotion']);
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
type ProjectBinding = {projectId: string; packId: string; packRoot: string; status: string; initCommand: string; admitCommand: string; inspectCommand: string};
type BoundElement = {projectId: string; descriptor: {id:string;packId:string;kind:string;revision:string;componentPath:string};
  authoring: {packRoot:string;descriptorPath:string;componentPath:string;status:string};
  snapshot:{root:string;componentPath:string;files:Array<{path:string;sha256:string}>}; importPath:string};
export type VerifiedElementAdmission = { digest: string; realmId: string | null; projects: ProjectBinding[]; elements: BoundElement[]; files: string[] };

function regular(file: string): void {
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== path.resolve(file) || !fs.lstatSync(file).isFile()) {
    throw new Error(`Element admission requires a regular path without symlinks: ${file}`);
  }
}
function relative(value: unknown): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe admitted element resource path');
  return value;
}
function text(value: unknown, name: string, max = 4096): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid element admission ${name}`);
}
function importTarget(specifier: string, importer: string, files: Set<string>): string | undefined {
  if (allowedBare.has(specifier)) return undefined;
  if (!specifier.startsWith('.')) throw new Error(`Unsupported element dependency ${specifier}`);
  if (specifier.includes('?') || specifier.includes('#') || specifier.includes('\\')) throw new Error(`Unsupported element import ${specifier}`);
  const target = path.resolve(path.dirname(importer), specifier);
  const resolved = [target, ...['.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx'].map(ext => target + ext)].find(candidate => files.has(candidate));
  if (!resolved) throw new Error(`Undeclared element import ${specifier} from ${importer}`);
  return resolved;
}
function validateImports(file: string, files: Set<string>): void {
  if(file.endsWith('.css')) {
    const source=fs.readFileSync(file,'utf8');
    const resources=[...source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g),...source.matchAll(/@import\s+["']([^"']+)["']/g)];
    for(const match of resources){const resource=match[1];if(resource.startsWith('data:')||resource.startsWith('#'))continue;importTarget(resource.startsWith('.')?resource:'./'+resource,file,files);}
    return;
  }
  if (!/\.[cm]?[jt]sx?$/.test(file)) return;
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error('Non-static element import');
      importTarget(node.moduleSpecifier.text, file, files);
    }
    if (ts.isImportEqualsDeclaration(node)) throw new Error('Element require imports are unsupported');
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && ['require', 'eval', 'Function'].includes(node.expression.text)))) throw new Error('Dynamic element code loading is unsupported');
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') throw new Error('Dynamic element code loading is unsupported');
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
      const resource = node.arguments?.[0];
      if (!resource || !ts.isStringLiteral(resource)) throw new Error('Element asset URLs must be static declared resources');
      importTarget(resource.text.startsWith('.') ? resource.text : './' + resource.text, file, files);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

/** Read the explicit host selection; timeline/model fields cannot select build inputs. */
export type ElementVerificationCache = Map<string, {element:BoundElement;files:string[]}>;
export function verifyElementAdmissions(manifestPath?: string, candidate?: unknown, cache?:ElementVerificationCache): VerifiedElementAdmission {
  if (manifestPath && !path.isAbsolute(manifestPath)) throw new Error('ASTRID_ELEMENT_ADMISSION_MANIFEST must be absolute');
  if (!candidate && (!manifestPath || !fs.existsSync(manifestPath))) return { digest: 'empty', realmId: process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID ?? null, projects: [], elements: [], files: [] };
  if (manifestPath) regular(manifestPath);
  const bytes = candidate ? Buffer.from(JSON.stringify(candidate)) : fs.readFileSync(manifestPath!);
  if (bytes.length > 4_000_000) throw new Error('Element admission selection exceeds limit');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest?.schema !== 'astrid.element-admissions/v1' || !Array.isArray(manifest.projects) || !Array.isArray(manifest.elements)) throw new Error('Invalid element admission selection schema');
  text(manifest.realmId, 'realmId', 128);
  if (process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID && manifest.realmId !== process.env.VITE_WORKSPACE_RUNTIME_EXPECTED_REALM_ID) throw new Error('Element admission realm does not match configured Runtime');
  const projects = new Map<string, ProjectBinding>();
  for (const project of manifest.projects) {
    text(project.projectId, 'projectId', 128); text(project.packId, 'packId', 128);
    text(project.packRoot, 'packRoot');
    if (!path.isAbsolute(project.packRoot) || projects.has(project.projectId)) throw new Error('Invalid or duplicate project element binding');
    for (const command of ['initCommand', 'admitCommand', 'inspectCommand']) text(project[command], command, 8192);
    projects.set(project.projectId, project);
  }
  const identities = new Set<string>();
  const files = new Set<string>();
  const elements: BoundElement[] = [];
  for (const element of manifest.elements) {
    const descriptor = element?.descriptor;
    if (!projects.has(element.projectId) || !descriptor || !['effect', 'animation', 'transition'].includes(descriptor.kind)) throw new Error('Unbound admitted element');
    for (const key of ['id', 'packId', 'revision', 'componentPath']) text(descriptor[key], key, 1024);
    if (descriptor.packId !== projects.get(element.projectId)?.packId) throw new Error('Element owner does not match project pack binding');
    if (!Array.isArray(descriptor.parameters) || !descriptor.schema || typeof descriptor.schema !== 'object' || !descriptor.defaults || typeof descriptor.defaults !== 'object') throw new Error('Invalid canonical element descriptor');
    const key = JSON.stringify([descriptor.packId, descriptor.kind, descriptor.id, descriptor.revision]);
    if (identities.has(key)) throw new Error(`Duplicate admitted element identity ${key}`);
    identities.add(key);
    const snapshot = element.snapshot;
    const authoring = element.authoring;
    for (const field of ['packRoot', 'descriptorPath', 'componentPath', 'status']) text(authoring?.[field], `authoring ${field}`);
    if (authoring.packRoot !== projects.get(element.projectId)?.packRoot) throw new Error('Element authoring binding is inconsistent');
    for(const file of [authoring.descriptorPath,authoring.componentPath])if(!path.isAbsolute(file)||!path.resolve(file).startsWith(path.resolve(authoring.packRoot)+path.sep))throw new Error('Element authoring path escapes its canonical pack');
    const verificationKey=digest(stableJson([descriptor,snapshot]));
    const prior=cache?.get(verificationKey);
    if(prior){elements.push({...element,importPath:prior.element.importPath});prior.files.forEach(file=>files.add(file));continue;}

    text(snapshot?.root, 'snapshot root');
    if (!path.isAbsolute(snapshot.root) || fs.realpathSync(snapshot.root) !== path.resolve(snapshot.root) || !fs.lstatSync(snapshot.root).isDirectory()) throw new Error('Invalid element snapshot root');
    const component = relative(snapshot.componentPath);
    if (!Array.isArray(snapshot.files) || !snapshot.files.length || snapshot.files.length > 1024) throw new Error('Invalid element snapshot closure');
    const closure = new Set<string>();
    let totalBytes = 0;
    for (const resource of snapshot.files) {
      const relativePath = relative(resource.path);
      const absolute = path.join(snapshot.root, relativePath);
      regular(absolute);
      const content = fs.readFileSync(absolute);
      totalBytes += content.length;
      if (totalBytes > 32_000_000 || digest(content) !== resource.sha256 || closure.has(absolute)) throw new Error(`Stale or invalid element snapshot resource ${relativePath}`);
      closure.add(absolute); files.add(absolute);
    }
    const componentPath = path.join(snapshot.root, component);
    if (!closure.has(componentPath) || !/\.[jt]sx?$/.test(componentPath)) throw new Error('Element component is not in its admitted closure');
    for (const file of closure) validateImports(file, closure);

    const verified={ ...element, importPath: componentPath };
    cache?.set(verificationKey,{element:verified,files:[...closure]});
    elements.push(verified);
  }
  return { digest: digest(bytes), realmId: manifest.realmId, projects: [...projects.values()], elements, files: [...files] };
}
export function generateElementAdmissionModule(admission: VerifiedElementAdmission, configured = false): string {
  const imports = admission.elements.map((element, index) => `import Component${index} from ${JSON.stringify(element.importPath)};`).join('\n');
  // Snapshot paths remain build-only. Authoring paths are deliberate native agent metadata.
  const metadata = admission.elements.map(({ importPath: _import, snapshot: _snapshot, ...entry }) => entry);
  const components = admission.elements.map((entry, index) => `${JSON.stringify(JSON.stringify([entry.descriptor.packId, entry.descriptor.kind, entry.descriptor.id, entry.descriptor.revision]))}:Component${index}`).join(',');
  return `${imports}\nexport const configured=${JSON.stringify(configured)};\nexport const projectId=${JSON.stringify((admission as VerifiedElementAdmission & {projectId?:string}).projectId ?? null)};\nexport const selectionDigest=${JSON.stringify(admission.digest)};\nexport const realmId=${JSON.stringify(admission.realmId)};\nexport const projects=${JSON.stringify(admission.projects)};\nexport const elements=${JSON.stringify(metadata)};\nexport const components={${components}};`;
}
export function createElementAdmissionsPlugin(options?: ProjectSelectionOptions): Plugin {
  const versions = new Map<string,VerifiedElementAdmission>();
  if(options)options={...options,verificationCache:new Map(),resolvedCache:new Map()};
  let server: ViteDevServer | undefined;
  const empty:VerifiedElementAdmission = {digest:'empty',realmId:options?.realmId??null,projects:[],elements:[],files:[]};
  const importedFiles = () => new Set([...versions.values()].flatMap(version=>version.files));
  return {
    name:'astrid-element-admissions',enforce:'pre',
    resolveId(id,importer) {
      if(id===ADMISSION_MODULE||id.startsWith(ADMISSION_MODULE+'?'))return RESOLVED+id.slice(ADMISSION_MODULE.length);
      const files=importedFiles();
      if(importer&&files.has(importer.split('?')[0])){
        // Authored imports were validated against the immutable closure above.
        // Here Vite has already injected refresh/runtime imports and resolved
        // aliases (including absolute React paths). Let its normal host pipeline
        // resolve those transformed imports; never widen source admission rules.
        if(id.startsWith('.'))return importTarget(id,importer.split('?')[0],files);
        return;
      }
      if(path.isAbsolute(id)&&files.has(id))return id;
    },
    load(id) {
      if(id===RESOLVED||id.startsWith(RESOLVED+'?')) {
        const version=new URLSearchParams(id.split('?')[1]??'').get('v');
        const selected=version?versions.get(version):empty;
        if(!selected)throw new Error('Unknown active-project admitted build selection');
        for(const element of selected.elements)for(const file of element.snapshot.files){
          const absolute=path.join(element.snapshot.root,file.path);regular(absolute);
          if(digest(fs.readFileSync(absolute))!==file.sha256)throw new Error('Admitted immutable element snapshot changed');
        }
        return generateElementAdmissionModule(selected,Boolean(options));
      }
    },
    configureServer(value) {
      server=value;
      server.middlewares.use(INFO_PATH,async(request,response)=>{
        response.setHeader('Content-Type','application/json');
        try {
          if(!options||request.method!=='POST')throw new Error('Active Runtime project element scope is required');
          let body='';for await(const chunk of request){body+=chunk;if(body.length>32768)throw new Error('Element scope request exceeds limit');}
          const scope=JSON.parse(body) as {projectId:string;refs:ElementRef[]};
          if(!Array.isArray(scope.refs))throw new Error('Exact element refs are required');
          const selection=await selectProjectElements(scope.projectId,scope.refs,options);
          versions.set(selection.digest,selection);
          while(versions.size>32)versions.delete(versions.keys().next().value!);
          server?.config.server.fs.allow.push(...selection.files.filter(file=>!server!.config.server.fs.allow.includes(file)));
          response.end(JSON.stringify({digest:selection.digest,projectId:scope.projectId,moduleUrl:'/@id/__x00__'+ADMISSION_MODULE+'?v='+selection.digest}));
        }catch(error){response.statusCode=409;response.end(JSON.stringify({error:String(error)}));}
      });
    },
    handleHotUpdate(context){
      if(!importedFiles().has(context.file))return;
      // Immutable inputs changing on disk retire their verification/build cache.
      // Keep the mounted editor/adapter alive; a scoped refresh must verify again.
      options?.verificationCache?.clear();options?.resolvedCache?.clear();
      for(const [key,version] of versions)if(version.files.includes(context.file))versions.delete(key);
      context.server.ws.send({type:'custom',event:'astrid:elements-admitted',data:{}});
      return [];
    },
  };
}
