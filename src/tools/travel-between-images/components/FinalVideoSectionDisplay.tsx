import React from 'react';
import { Film, Loader2 } from 'lucide-react';
import type { GenerationRow } from '@/domains/generation/types';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { VideoItem } from './VideoGallery/components/VideoItem';

const noop = () => {};

interface FinalVideoSectionDisplayProps {
  projectAspectRatio?: string;
  shouldShowSkeleton: boolean;
  hasFinalOutput: boolean;
  parentVideoRow: GenerationRow | null;
  isMobile: boolean;
  onLightboxOpen: () => void;
  onMobileTap: () => void;
  onApplySettingsFromTask?: (taskId: string) => void;
  hasActiveJoinTask: boolean;
}

function getFinalVideoWidthStyle(projectAspectRatio?: string): React.CSSProperties {
  if (!projectAspectRatio) {
    return { width: '50%' };
  }

  const [width, height] = projectAspectRatio.split(':').map(Number);
  if (!width || !height) {
    return { width: '50%' };
  }

  const ratio = width / height;
  if (height > width) {
    return { width: `min(100%, calc(60vh * ${ratio}))` };
  }

  return { width: '50%' };
}

export const FinalVideoSectionDisplay: React.FC<FinalVideoSectionDisplayProps> = ({
  projectAspectRatio,
  shouldShowSkeleton,
  hasFinalOutput,
  parentVideoRow,
  isMobile,
  onLightboxOpen,
  onMobileTap,
  onApplySettingsFromTask,
  hasActiveJoinTask,
}) => {
  if (shouldShowSkeleton) {
    return (
      <div className="flex justify-center mt-4">
        <div style={getFinalVideoWidthStyle(projectAspectRatio)}>
          <Skeleton
            className="w-full rounded-lg"
            style={{
              aspectRatio: projectAspectRatio ? projectAspectRatio.replace(':', '/') : '16/9',
            }}
          />
        </div>
      </div>
    );
  }

  if (hasFinalOutput && parentVideoRow) {
    return (
      <div className="flex justify-center mt-4">
        <div className="relative group" style={getFinalVideoWidthStyle(projectAspectRatio)}>
          <VideoItem
            video={parentVideoRow}
            index={0}
            originalIndex={0}
            shouldPreload="metadata"
            isMobile={isMobile}
            projectAspectRatio={projectAspectRatio}
            onLightboxOpen={() => onLightboxOpen()}
            onMobileTap={() => onMobileTap()}
            onDelete={noop}
            deletingVideoId={null}
            onHoverStart={noop}
            onHoverEnd={noop}
            onMobileModalOpen={noop}
            selectedVideoForDetails={null}
            showTaskDetailsModal={false}
            onApplySettingsFromTask={onApplySettingsFromTask || noop}
            hideActions
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center pt-4 pb-1 text-muted-foreground">
      {hasActiveJoinTask ? (
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Generating joined clip...</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 opacity-40" />
          <span className="text-sm">No final video yet</span>
        </div>
      )}
    </div>
  );
};
