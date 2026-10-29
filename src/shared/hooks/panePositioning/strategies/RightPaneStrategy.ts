import type { PanePositionStrategy } from './PanePositionStrategy';
import { PanePosition } from '@/shared/config/panes';

export class RightPanePositionStrategy implements PanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties {
    const { dimension, offsets, isVisible } = position;
    const bottomOffset = offsets.bottom || 0;

    // 50dvh stays centered as iOS Safari browser chrome shows/hides
    return {
      position: 'fixed',
      top: '50dvh',
      right: '0px',
      transform: `translateX(${isVisible ? -dimension : 0}px) translateY(calc(-50% - ${bottomOffset / 2}px))`,
    };
  }
}