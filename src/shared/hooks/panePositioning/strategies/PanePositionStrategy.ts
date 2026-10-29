import { PanePosition } from '@/shared/config/panes';

export interface PanePositionStrategy {
  getStyle(position: PanePosition): React.CSSProperties;
}