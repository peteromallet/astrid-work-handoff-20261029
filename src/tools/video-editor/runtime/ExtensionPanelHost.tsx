import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PanelRenderProps, PanelVideoAdapter } from '@astrid/editor-sdk';
import type { VideoEditorPanelDescriptor } from './extensionSurface';
import {
  HostContributionErrorBoundary,
  type ContributionErrorInfo,
} from './ContributionErrorBoundary';
import { PanelFullscreenFrame } from './PanelFullscreenFrame';

/** Stable contribution identity for selection/preferences within a host. */
export function getPanelKey(panel: Pick<VideoEditorPanelDescriptor, 'extensionId' | 'id'>): string {
  return `${panel.extensionId ?? 'host'}:${panel.id}`;
}

type MoveBeforeParent = Node & { moveBefore?: (node: Node, child: Node | null) => void };

/**
 * Put a panel's node last in `parent` without recreating it. `Element.moveBefore`
 * (Chromium) keeps iframes, focus and scroll running; elsewhere `appendChild`
 * detaches and reattaches, so an iframe reloads once. React state is unaffected
 * either way because the node is only a portal container.
 */
export function placePanelNode(node: Node, parent: Node): void {
  if (node.parentNode === parent && node === parent.lastChild) return;
  const target = parent as MoveBeforeParent;
  if (typeof target.moveBefore === 'function' && node.isConnected && parent.isConnected) {
    try {
      target.moveBefore(node, null);
      return;
    } catch {
      // Cross-document or disconnected moves throw; fall through to a plain move.
    }
  }
  parent.appendChild(node);
}

export interface ExtensionPanelHostProps {
  /** Include registered panels even while hidden. Removal ends their lifetime. */
  readonly panels: readonly VideoEditorPanelDescriptor[];
  /** Panels shown in their docked slot. A full-screen panel is visible regardless. */
  readonly visiblePanelKeys: ReadonlySet<string>;
  readonly video?: PanelVideoAdapter;
  /** Give one extension's panels their own adapter (e.g. one that knows who is dragging). */
  readonly bindVideo?: (video: PanelVideoAdapter, extensionId: string) => PanelVideoAdapter;
  readonly settingsByPanelKey?: Readonly<Record<string, PanelRenderProps['settings']>>;
  readonly onError?: (info: ContributionErrorInfo) => void;
  /** Controlled: the one panel shown full screen, if any. */
  readonly fullscreenPanelKey?: string | null;
  /** Supplying this is what offers `fullscreen` to panels. Null returns the panel to its slot. */
  readonly onFullscreenPanelKeyChange?: (key: string | null) => void;
}

function PanelContent({ panel, ...props }: PanelRenderProps & { panel: VideoEditorPanelDescriptor }) {
  return panel.render(props);
}

interface PanelSlotProps {
  readonly panel: VideoEditorPanelDescriptor;
  readonly panelKey: string;
  readonly instanceId: string;
  readonly dockedVisible: boolean;
  readonly fullscreenActive: boolean;
  readonly frameBody: () => HTMLElement | null;
  readonly video?: PanelVideoAdapter;
  readonly bindVideo?: ExtensionPanelHostProps['bindVideo'];
  readonly settings?: PanelRenderProps['settings'];
  readonly fullscreen?: PanelRenderProps['fullscreen'];
  readonly onError?: (info: ContributionErrorInfo) => void;
}

function PanelSlot({ panel, panelKey, instanceId, dockedVisible, fullscreenActive, frameBody, video: hostVideo, bindVideo, settings, fullscreen, onError }: PanelSlotProps) {
  const extensionId = panel.extensionId;
  const video = useMemo(
    () => (hostVideo && bindVideo && extensionId ? bindVideo(hostVideo, extensionId) : hostVideo),
    [hostVideo, bindVideo, extensionId],
  );
  // One DOM node per panel for its whole life; it is only ever moved, never recreated.
  const [node] = useState(() => {
    const el = document.createElement('div');
    el.className = 'flex h-full min-h-0 w-full flex-col @container/panel';
    el.dataset.panelNode = '';
    return el;
  });
  const mountRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const parent = fullscreenActive ? frameBody() : mountRef.current;
    if (parent) placePanelNode(node, parent);
  });
  useLayoutEffect(() => () => { node.remove(); }, [node]);
  const visible = dockedVisible || fullscreenActive;
  return (
    <div className="h-full min-h-0 flex-col" style={{ display: dockedVisible ? 'flex' : 'none' }} hidden={!dockedVisible} data-video-editor-panel-id={panel.id} data-panel-key={panelKey} data-fullscreen={fullscreenActive ? 'true' : undefined}>
      <div ref={mountRef} className="min-h-0 flex-1" hidden={fullscreenActive} />
      {createPortal(
        <HostContributionErrorBoundary
          contributionId={panel.id}
          extensionId={panel.extensionId}
          kind="panel"
          label={panel.label}
          onError={onError}
        >
          <PanelContent panel={panel} instanceId={instanceId} visible={visible} video={video} settings={settings} fullscreen={fullscreen} />
        </HostContributionErrorBoundary>,
        node,
      )}
    </div>
  );
}

/** One React instance per qualified contribution in each mounted host. */
export function ExtensionPanelHost({ panels, visiblePanelKeys, video, bindVideo, onError, settingsByPanelKey, fullscreenPanelKey = null, onFullscreenPanelKeyChange }: ExtensionPanelHostProps) {
  const hostId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const fullscreenPanel = fullscreenPanelKey === null ? undefined : panels.find((panel) => getPanelKey(panel) === fullscreenPanelKey);
  // The frame outlives full screen by one commit: the panel node must move back to its
  // slot (a state-preserving moveBefore) before React removes the frame's DOM.
  const activeKey = fullscreenPanel ? getPanelKey(fullscreenPanel) : null;
  const [shownKey, setShownKey] = useState(activeKey);
  if (activeKey && shownKey !== activeKey) setShownKey(activeKey);
  useLayoutEffect(() => {
    if (!activeKey && shownKey) setShownKey(null);
  }, [activeKey, shownKey]);
  const shown = shownKey === null ? undefined : panels.find((panel) => getPanelKey(panel) === shownKey);
  return (
    <>
      {shown && onFullscreenPanelKeyChange && (
        <PanelFullscreenFrame
          key={getPanelKey(shown)}
          ref={frameRef}
          title={shown.label || shown.id}
          onExit={() => onFullscreenPanelKeyChange(null)}
        />
      )}
      {panels.map((panel) => {
        const key = getPanelKey(panel);
        const active = key === activeKey;
        return (
          <PanelSlot
            key={key}
            panel={panel}
            panelKey={key}
            instanceId={`${hostId}:${key}`}
            dockedVisible={visiblePanelKeys.has(key)}
            fullscreenActive={active}
            frameBody={() => frameRef.current}
            video={video}
            bindVideo={bindVideo}
            settings={settingsByPanelKey?.[key]}
            fullscreen={onFullscreenPanelKeyChange ? {
              active,
              enter: () => onFullscreenPanelKeyChange(key),
              exit: () => { if (active) onFullscreenPanelKeyChange(null); },
            } : undefined}
            onError={onError}
          />
        );
      })}
    </>
  );
}
