import {expect,test,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

type AssetEntry = {file?:string;media_id?:string;type?:string;duration?:number;generationId?:string};
type RequestRecord = {method:string;path:string;body?:unknown};
type ExportRecord = {path:string;body:{expected:Record<string,unknown>;destination_filename?:string};receipt:{receipt:{receipt_id:string};data:{task_id:string}}};
type TimelineWrite = {timelineId:string;expectedVersion:number;acceptedVersion?:number;error?:string};
interface ProductionWidgetEvidence {
 galleryUrl:string;galleryMediaId:string;mediaId:string;admitted:Record<string,string>;
 loads:Array<{instance:string;project:string;generationId:string}>;
 requests:RequestRecord[];exports:ExportRecord[];
 variantIdentities:Array<{project:string;path:string;object_id:string}>;
 writes:TimelineWrite[];
 provider:{loadAssetRegistry(timelineId:string):Promise<{assets:Record<string,AssetEntry>}>;loadTimeline(timelineId:string):Promise<{configVersion:number}>};
 setMediaPending(value:boolean):void;setTaskPending(value:boolean):void;releaseMedia():void;releaseTask():void;completeBackground():void;backgroundState():string|undefined;refreshTasks():Promise<void>;
}
type EvidenceWindow = Window & {productionWidgetEvidence:ProductionWidgetEvidence};
const diagnostic = new WeakMap<Page,{errors:string[];console:Array<{level:string;text:string}>}>();
test.beforeEach(async({page})=>{
 const logs={errors:[] as string[],console:[] as Array<{level:string;text:string}>};diagnostic.set(page,logs);
 page.on('pageerror',e=>logs.errors.push(e.message));page.on('console',e=>{if(['error','warning'].includes(e.type()))logs.console.push({level:e.type(),text:e.text()});});
 await page.setViewportSize({width:1440,height:1100});
 // Native image elements do not call window.fetch; serve the same canonical PNG bytes.
 await page.route('**/api/runtime/v1/objects/**',async route=>{const dataUrl=await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.galleryUrl);await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(dataUrl.split(',')[1],'base64')});});
});
test.afterEach(async({page},info)=>{
 await writeFile(info.outputPath('browser-diagnostics.json'),JSON.stringify(diagnostic.get(page),null,2));
 await page.screenshot({path:info.outputPath('production-widgets.png'),fullPage:true});
 expect(diagnostic.get(page)?.errors).toEqual([]);
});
async function open(page:Page,sameProject:boolean){
 await page.goto(`/tests/e2e/fixtures/production-widget-scope/index.html?localTest=1&sameProject=${sameProject?'1':'0'}`);
 await expect(page.getByTestId('version-full')).toHaveText('1');await expect(page.getByTestId('version-dialog')).toHaveText('1');
 await page.getByTestId('select-dialog').click();await expect(page.getByTestId('host-timeline')).toHaveText('workflow-dialog');
}
// The Tasks pane is the Runtime activity dock: its history (the Processing / Succeeded / Failed lists) opens
// from the dock's "Keep tasks open" control, and stays open once kept.
async function showTasks(page:Page,filter:'Processing'|'Succeeded'){
 const keep=page.getByRole('button',{name:/^(Keep|Stop keeping) tasks open$/});
 await expect(keep).toBeVisible();
 if(await keep.getAttribute('aria-pressed')!=='true')await keep.click();
 await page.getByRole('button',{name:new RegExp(`^${filter} \\(`)}).click();
}
// A task's row, and the one export control a row offers (its label names the task kind, not its id).
const taskRow=(page:Page,id:string)=>page.locator(`[data-runtime-task-id="${id}"]`);
const exportButton=(page:Page,id:string)=>taskRow(page,id).getByRole('button',{name:/^Export .* result$/});
async function gallerySend(page:Page){
 const item=page.locator('[data-testid="generations-pane"] [data-gallery-item-id]').first();await expect(item).toBeVisible();await item.click();
 await page.getByTestId('add-selected-generation-to-timeline').click();
}
// The gallery lists the route's project (8c28e1847), and an add lands in the selected editor. In the same project the
// load is captured for the dialog; in another project the add is refused (the Runtime would refuse a foreign object).
test('production Gallery refuses to add a route-project item to a dialog of another project',async({page})=>{
 await open(page,false);
 const item=page.locator('[data-testid="generations-pane"] [data-gallery-item-id]').first();await expect(item).toBeVisible();await item.click();
 const add=page.getByTestId('add-selected-generation-to-timeline');
 await expect(add).toBeVisible();await expect(add).toBeDisabled();
 const evidence=await page.evaluate(()=>{const e=(window as unknown as EvidenceWindow).productionWidgetEvidence;return {loads:e.loads,writes:e.writes,route:document.querySelector('[data-testid="route"]')?.textContent};});
 expect(evidence.loads).toEqual([]);
 expect(evidence.writes).toEqual([]);
 expect(evidence.route).toBe('/tools/video-editor?project=project-a&timeline=workflow-full');
});
for(const sameProject of [true,false]){
 if(sameProject)test('production Gallery targets selected dialog in the same project and captures pending load',async({page},info)=>{
  await open(page,true);
  await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.setMediaPending(true));
  await expect(page.locator('[data-testid="generations-pane"] [data-gallery-item-id]').first()).toBeVisible();
  await page.screenshot({path:info.outputPath('selected-dialog-gallery.png'),fullPage:true});
  await gallerySend(page);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.loads.length)).toBe(1);
  await expect(page.getByTestId('route')).toContainText('project=project-a');await expect(page.getByTestId('route')).toContainText('timeline=workflow-full');
  await page.getByTestId('select-full').click();await expect(page.getByTestId('host-timeline')).toHaveText('workflow-full');
  await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.releaseMedia());
  await expect.poll(()=>page.evaluate(async()=>{const e=(window as unknown as EvidenceWindow).productionWidgetEvidence;return Object.values((await e.provider.loadAssetRegistry('workflow-dialog')).assets).find((a)=>a.generationId===e.loads[0]?.generationId);})).toMatchObject({media_id:await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.galleryMediaId)});
  await expect(page.getByTestId('save-dialog')).toHaveText('saved');
  const importedAssetId = await page.evaluate(async()=>{const e=(window as unknown as EvidenceWindow).productionWidgetEvidence;return Object.entries((await e.provider.loadAssetRegistry('workflow-dialog')).assets).find(([,a])=>a.generationId===e.loads[0].generationId)?.[0];});
  expect(importedAssetId).toBeTruthy();
  await page.getByTestId('toggle-dialog').click();await page.getByTestId('toggle-dialog').click();
  await expect(page.getByTestId('config-dialog')).toContainText(importedAssetId!);
  const evidence=await page.evaluate(async()=>{const e=(window as unknown as EvidenceWindow).productionWidgetEvidence;return {route:document.querySelector('[data-testid="route"]')?.textContent,galleryMediaId:e.galleryMediaId,variantIdentities:e.variantIdentities,loads:e.loads,requests:e.requests,writes:e.writes,full:await e.provider.loadAssetRegistry('workflow-full'),dialog:await e.provider.loadAssetRegistry('workflow-dialog'),head:await e.provider.loadTimeline('workflow-dialog')};});
  expect(Object.values(evidence.full.assets).some((a)=>a.generationId===evidence.loads[0].generationId)).toBe(false);
  expect(evidence.variantIdentities.some((variant)=>variant.project===evidence.loads[0].project&&variant.object_id===evidence.galleryMediaId)).toBe(true);
  expect(evidence.loads).toEqual([{instance:'dialog',project:'project-a',generationId:expect.any(String)}]);
  expect(evidence.route).toBe('/tools/video-editor?project=project-a&timeline=workflow-full');
  expect(evidence.head.configVersion).toBeGreaterThan(1);
  expect(evidence.writes.every((w)=>w.timelineId==='workflow-dialog')).toBe(true);
  await writeFile(info.outputPath('gallery-captured-scope.json'),JSON.stringify(evidence,null,2));
 });
 test(`production Tasks selects dialog query and captured managed-output action (${sameProject?'same':'different'} project)`,async({page},info)=>{
  await open(page,sameProject);
  await expect.poll(()=>page.evaluate((project)=>(window as unknown as EvidenceWindow).productionWidgetEvidence.requests.some((r)=>r.path===`/api/runtime/v1/projects/${project}/tasks`),sameProject?'project-a':'project-b')).toBe(true);
  await showTasks(page,'Succeeded');
  const ids=await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.admitted);
  await expect(page.locator(`[data-runtime-task-id="${ids.dialog}"]`)).toBeVisible();
  await expect(exportButton(page,ids.dialog)).toBeVisible();
  await expect(exportButton(page,ids.full)).toHaveCount(0);
  await page.screenshot({path:info.outputPath('selected-dialog-tasks.png'),fullPage:true});
  await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.setTaskPending(true));
  await exportButton(page,ids.dialog).click();
  await expect.poll(()=>page.evaluate((id)=>(window as unknown as EvidenceWindow).productionWidgetEvidence.requests.some((r)=>r.path===`/api/runtime/v1/tasks/${id}`),ids.dialog)).toBe(true);
  await page.getByTestId('select-full').click();
  await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.releaseTask());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.exports.length)).toBe(1);
  const evidence=await page.evaluate(() => {const e=(window as unknown as EvidenceWindow).productionWidgetEvidence;return {exports:e.exports,requests:e.requests,admitted:e.admitted};});
  expect(evidence.exports[0].receipt.receipt.receipt_id).toBe('selected-export');
  expect(evidence.exports[0].receipt.data.task_id).toBe(ids.dialog);
  expect(evidence.exports[0].body.expected).toMatchObject({project_id:sameProject?'project-a':'project-b',task_id:ids.dialog,association_id:'output-dialog',filename:'dialog.mp4'});
  await writeFile(info.outputPath('tasks-captured-scope.json'),JSON.stringify(evidence,null,2));
 });
}
test('production Tasks recovers same admitted task after Widgets and editor close/reopen with background completion',async({page},info)=>{
 await open(page,false);const ids=await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.admitted);
 await showTasks(page,'Processing');
 await expect(page.locator(`[data-runtime-task-id="${ids.background}"]`)).toContainText(/running/i);
 await page.getByTestId('toggle-widgets').click();await expect(page.locator('[data-runtime-task-list]')).toHaveCount(0);
 await page.getByTestId('toggle-dialog').click();await expect(page.getByTestId('host-timeline')).toHaveText('workflow-full');
 expect(await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.backgroundState())).toBe('running');
 await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.completeBackground());
 await page.getByTestId('toggle-dialog').click();await page.getByTestId('select-dialog').click();await page.getByTestId('toggle-widgets').click();
 await page.evaluate(()=>(window as unknown as EvidenceWindow).productionWidgetEvidence.refreshTasks());
 await showTasks(page,'Succeeded');
 await expect(page.locator(`[data-runtime-task-id="${ids.background}"]`)).toContainText(/complete/i);
 await expect(exportButton(page,ids.background)).toBeVisible();
 const evidence=await page.evaluate(()=>{const e=(window as unknown as EvidenceWindow).productionWidgetEvidence;return {admitted:e.admitted,requests:e.requests};});
 expect(evidence.requests.filter((r)=>r.path.includes('/cancel'))).toEqual([]);
 expect(evidence.requests.filter((r)=>r.method==='POST'&&r.path.endsWith('/v1/tasks'))).toHaveLength(3);
 await writeFile(info.outputPath('task-lifetime.json'),JSON.stringify(evidence,null,2));
});
