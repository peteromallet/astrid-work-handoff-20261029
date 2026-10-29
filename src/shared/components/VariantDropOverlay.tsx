import { Plus } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';

interface VariantDropOverlayProps {
  isVisible: boolean;
  activeRegion: 'variant' | 'main' | null;
}

export function VariantDropOverlay({ isVisible, activeRegion }: VariantDropOverlayProps) {
  if (!isVisible) {
    return null;
  }

  const regionClassName = (region: 'variant' | 'main') =>
    cn(
      'flex items-center justify-center bg-primary/20 text-primary-foreground transition-colors',
      activeRegion === region && 'bg-primary/40',
    );

  return (
    <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden rounded-[inherit] border border-primary/30">
      <div className="flex h-full flex-col bg-background/10 backdrop-blur-sm">
        <div className={cn(regionClassName('variant'), 'flex-[3] border-b border-primary/30')}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" />
            <span>Variant</span>
          </div>
        </div>
        <div className={cn(regionClassName('main'), 'flex-1 text-xs font-semibold uppercase tracking-[0.2em]')}>
          <span>Main</span>
        </div>
      </div>
    </div>
  );
}
