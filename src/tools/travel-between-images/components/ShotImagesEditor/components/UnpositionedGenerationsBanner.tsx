import React from 'react';
import { Button } from '@/shared/components/ui/button';

interface UnpositionedGenerationsBannerProps {
  count: number;
  onOpen: () => void;
}

export const UnpositionedGenerationsBanner: React.FC<UnpositionedGenerationsBannerProps> = ({
  count,
  onOpen,
}) => (
  <div className="mt-4">
    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
      <div className="text-sm text-muted-foreground">
        {count} unpositioned generation{count !== 1 ? 's' : ''}
      </div>
      <Button variant="outline" size="sm" onClick={onOpen} className="text-xs">
        View & Position
      </Button>
    </div>
  </div>
);
