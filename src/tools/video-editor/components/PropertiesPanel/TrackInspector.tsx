import { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import { FieldLabel, TrackSettingsFields } from '../TimelineEditor/TrackLabel.tsx';
import type { TrackDefinition } from '@/tools/video-editor/types/index.ts';

/** Touch track editing shares the Inspector with clip actions and properties. */
export function TrackInspector({ track, hasClips, readOnly = false, onChange, onAddTrack, onRemove }: {
  track: TrackDefinition;
  hasClips: boolean;
  readOnly?: boolean;
  onChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  onAddTrack: (kind: 'visual' | 'audio') => void;
  onRemove: (trackId: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 2000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  // Where the Inspector is wide (iPad) the fields and actions take two columns, so the whole
  // track fits without scrolling; a phone stacks them.
  return <div className="@container">
    <fieldset disabled={readOnly} className="min-w-0 space-y-4 [&_[role=combobox]]:h-11" aria-label="Track settings">
      <div className="space-y-1.5">
        <FieldLabel>Name</FieldLabel>
        <input
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={track.label}
          aria-label="Track name"
          onChange={(event) => onChange(track.id, { label: event.target.value })}
        />
      </div>
      <TrackSettingsFields
        track={track}
        onChange={onChange}
        disabled={readOnly}
        className="@[34rem]:grid @[34rem]:grid-cols-2 @[34rem]:items-start @[34rem]:gap-4 @[34rem]:space-y-0"
      />
      <div className="grid grid-cols-2 gap-2 @[34rem]:grid-cols-3">
        <Button type="button" variant="secondary" className="h-11 min-w-0 px-2" onClick={() => onAddTrack('visual')}>Add video track</Button>
        <Button type="button" variant="secondary" className="h-11 min-w-0 px-2" onClick={() => onAddTrack('audio')}>Add audio track</Button>
        <Button
          type="button"
          variant="outline"
          className={`col-span-2 h-11 min-w-0 gap-1.5 @[34rem]:col-span-1 ${confirmingDelete ? 'border-destructive text-destructive' : ''}`}
          onClick={() => {
            if (hasClips && !confirmingDelete) setConfirmingDelete(true);
            else {
              setConfirmingDelete(false);
              onRemove(track.id);
            }
          }}
        >
          {confirmingDelete ? <Check className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          {confirmingDelete ? 'Tap again to confirm deletion' : 'Delete track'}
        </Button>
      </div>
    </fieldset>
  </div>;
}
