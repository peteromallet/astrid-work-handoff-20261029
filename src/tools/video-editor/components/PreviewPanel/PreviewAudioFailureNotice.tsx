import { VolumeX } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import { usePreviewAudioFailures } from '@/tools/video-editor/compositions/PreviewMediaFailureContext.tsx';

/**
 * Editor chrome for audio that still fails after its automatic retries. It
 * sits over the stage, outside the Player's composition, so it never reaches
 * a rendered frame.
 */
export function PreviewAudioFailureNotice() {
  const { failures, retry } = usePreviewAudioFailures();
  if (failures.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="preview-audio-failure"
      className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-2 rounded bg-background/90 px-2 py-1 text-xs text-foreground"
    >
      <VolumeX aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
      <span>
        {failures.length === 1 ? 'Audio unavailable for 1 clip' : `Audio unavailable for ${failures.length} clips`}
      </span>
      <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={retry}>
        Retry audio
      </Button>
    </div>
  );
}
