import React from "react";
import { Trash2, Star } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from '@/shared/components/ui/contracts/cn';
import { getGenerationId } from "@/shared/lib/media/mediaTypeHelpers";
import type { GeneratedImageWithMetadata } from "../../MediaGallery/types";

interface ActionButtonsProps {
  image: GeneratedImageWithMetadata;
  localStarred: boolean;
  isTogglingStar: boolean;
  isDeleting: boolean;
  showStar: boolean;
  showDelete: boolean;
  onToggleStar?: (id: string, starred: boolean) => void;
  setIsTogglingStar: (toggling: boolean) => void;
  setLocalStarred: (starred: boolean) => void;
  onDelete?: (id: string) => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  image,
  localStarred,
  isTogglingStar,
  isDeleting,
  showStar,
  showDelete,
  onToggleStar,
  setIsTogglingStar,
  setLocalStarred,
  onDelete,
}) => {
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTogglingStar) return;
    setIsTogglingStar(true);
    const nextStarred = !localStarred;
    setLocalStarred(nextStarred);
    const targetId = getGenerationId(image) ?? image.id;
    if (!targetId) {
      setIsTogglingStar(false);
      setLocalStarred(!nextStarred);
      return;
    }
    try {
      if (!onToggleStar) {
        setIsTogglingStar(false);
        setLocalStarred(!nextStarred);
        return;
      }
      onToggleStar(targetId, nextStarred);
      setIsTogglingStar(false);
    } catch {
      setIsTogglingStar(false);
      setLocalStarred(!nextStarred);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(image.id!);
  };

  return (
    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between z-20">
      {/* Star Button - Left (always visible when starred) */}
      <div className={`flex items-center gap-1.5 transition-opacity ${
        localStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        {showStar && (
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
            onClick={handleStarClick}
            disabled={isTogglingStar}
          >
            <Star className={`h-3.5 w-3.5 ${localStarred ? 'fill-current' : ''}`} />
          </Button>
        )}
      </div>

      {/* Delete Button - Right (only visible on hover) */}
      <div className={cn(
        "flex items-center gap-1.5 transition-opacity",
        "opacity-0 group-hover:opacity-100"
      )}>
        {onDelete && showDelete && (
          <Button
            variant="destructive"
            size="icon"
            className="h-7 w-7 p-0 rounded-full"
            onClick={handleDeleteClick}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-white"></div>
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
