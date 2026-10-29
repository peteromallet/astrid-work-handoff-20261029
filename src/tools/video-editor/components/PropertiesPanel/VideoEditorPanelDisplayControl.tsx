import { useRef, useState } from 'react';
import { PanelsTopLeft } from 'lucide-react';
import { useTimelineEditorData, useTimelineEditorOps } from '@/tools/video-editor/hooks/timelineStore';
import { defaultPreferences } from '@/tools/video-editor/hooks/useEditorPreferences';
import { getPanelKey } from '@/tools/video-editor/runtime/ExtensionPanelHost';
import { useVideoEditorAssetPanels } from '@/tools/video-editor/runtime/useVideoEditorRenderContext';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/shared/components/ui/dropdown-menu';

export const HOST_PROPERTIES_PANEL_KEY = 'host:properties';
/** The Extensions tab when no extension panel exists to select: the dock stays open. */
export const HOST_EXTENSIONS_PANEL_KEY = 'host:extensions';

/** One display menu for the open dock and its closed toolbar affordance. */
export function VideoEditorPanelDisplayControl({ className = '', visible = true }: { className?: string; visible?: boolean }) {
  const panels = useVideoEditorAssetPanels();
  const data = useTimelineEditorData();
  const ops = useTimelineEditorOps();
  const preferences = data.preferences ?? defaultPreferences;
  const selected = preferences.selectedRightPanelId;
  const tab = selected ? selected === HOST_PROPERTIES_PANEL_KEY ? 'inspector' : 'extensions' : preferences.rightPanelTab ?? 'inspector';
  const remembered = panels.find((panel) => getPanelKey(panel) === preferences.lastExtensionPanelId) ?? panels[0];
  const tool = panels.find((panel) => getPanelKey(panel) === selected) ?? remembered;
  const toolKey = tool ? getPanelKey(tool) : null;
  const currentKey = tab === 'inspector' ? HOST_PROPERTIES_PANEL_KEY : toolKey ?? HOST_PROPERTIES_PANEL_KEY;
  const layout = preferences.rightPanelLayoutSlotsByPanelId[HOST_PROPERTIES_PANEL_KEY]
    ?? preferences.rightPanelLayoutSlotsByPanelId[currentKey]
    ?? 'dock';
  const open = selected !== null;
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocusScope = useRef<HTMLElement | null>(null);

  return <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
    <DropdownMenuTrigger ref={trigger} data-video-editor-panel-display="true" hidden={!visible} aria-hidden={!visible} disabled={!visible} style={{ display: visible ? undefined : 'none' }} className={`${className} flex h-8 min-h-10 sm:min-h-8 w-10 sm:w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card/90 text-muted-foreground backdrop-blur-md hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`} aria-label="Panel display" title="Panel display">
      <PanelsTopLeft className="h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" finalFocus={() => {
      const scope = returnFocusScope.current;
      returnFocusScope.current = null;
      if (!scope) return true;
      return [...scope.querySelectorAll<HTMLButtonElement>('[data-video-editor-panel-display]')]
        .find((button) => !button.closest('[hidden]')) ?? true;
    }}>
      <DropdownMenuLabel>Panel display</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={open ? layout : 'closed'} onValueChange={(value) => {
        returnFocusScope.current = trigger.current?.closest<HTMLElement>('[data-video-editor-instance]') ?? null;
        setMenuOpen(false);
        if (value === 'closed') ops.setSelectedRightPanelId(null);
        else {
          ops.setRightPanelLayoutSlot(HOST_PROPERTIES_PANEL_KEY, value as 'compact' | 'dock');
          if (!open) ops.setSelectedRightPanelId(tab === 'inspector' ? HOST_PROPERTIES_PANEL_KEY : toolKey ?? HOST_EXTENSIONS_PANEL_KEY);
        }
      }}>
        <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dock">Full-height</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="closed">Closed</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
