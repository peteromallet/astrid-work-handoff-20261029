import type { PanePositionStrategy } from './PanePositionStrategy';
import { PanePosition } from '@/shared/config/panes';

export class BottomPanePositionStrategy implements PanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties {
    const { dimension, offsets, isVisible } = position;
    const horizontalOffset = offsets.horizontal || 0;

    return {
      position: 'fixed',
      left: '50%',
      bottom: '0px',
      // When visible, position handle inside the pane (offset inward by ~40px for handle height)
      transform: `translateX(-50%) translateX(${horizontalOffset / 2}px) translateY(${isVisible ? -(dimension - 44) : 0}px)`,
    };
  }
} 