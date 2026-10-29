import {Button} from '@/shared/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/shared/components/ui/dialog';
import type {EffectCategory,EffectResource} from '@/tools/video-editor/hooks/useEffectResources';
export interface EffectCreatorPanelProps {
  open:boolean;onOpenChange(open:boolean):void;editingEffect?:EffectResource|null;
  onSaved?:(resourceId:string,category:EffectCategory,defaultParams:Record<string,unknown>)=>void;
  previewAssetSrc?:string|null;timelineFps?:number;
}
/** Compatibility entrypoint for retired resource-source authoring, never a compiler or publisher. */
export function EffectCreatorPanel({open,onOpenChange}:EffectCreatorPanelProps){
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Custom effects use project packs</DialogTitle>
    <DialogDescription>Ask Astrid to inspect or create the project’s draft pack, edit its files, and admit a revision. Existing saved source is preserved for migration.</DialogDescription>
  </DialogHeader><Button onClick={()=>onOpenChange(false)}>Close</Button></DialogContent></Dialog>;
}
