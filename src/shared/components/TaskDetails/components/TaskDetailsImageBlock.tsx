import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { mediaCrossOrigin } from '@/shared/lib/media/mediaCrossOrigin';

interface TaskDetailsImageBlockProps {
  config: ReturnType<typeof getVariantConfig>;
  label: string;
  imageUrl: string;
  alt: string;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  imageClassName?: string;
}

export function TaskDetailsImageBlock({
  config,
  label,
  imageUrl,
  alt,
  containerClassName,
  containerStyle,
  imageClassName,
}: TaskDetailsImageBlockProps) {
  return (
    <div className="space-y-2">
      <p className={`${config.textSize} font-medium text-muted-foreground`}>
        {label}
      </p>
      <div className={cn('relative group', containerClassName)} style={containerStyle}>
        <img
          src={imageUrl}
          crossOrigin={mediaCrossOrigin(imageUrl)}
          alt={alt}
          className={cn('w-full object-cover rounded border shadow-sm', imageClassName)}
        />
      </div>
    </div>
  );
}
