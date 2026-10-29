import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle,
  Info,
  ShieldX,
} from 'lucide-react';
import type { PackageState } from '@/tools/video-editor/runtime/extensionLoader';

// ---------------------------------------------------------------------------
// State display helpers
// ---------------------------------------------------------------------------

const PACKAGE_STATE_CONFIG: Record<
  PackageState,
  { label: string; icon: typeof CheckCircle; color: string; bg: string }
> = {
  loaded: {
    label: 'Loaded',
    icon: CheckCircle,
    color: 'text-wes-forest',
    bg: 'bg-wes-forest/10 border-wes-forest/30',
  },
  'disabled-by-user': {
    label: 'Disabled',
    icon: Ban,
    color: 'text-muted-foreground',
    bg: 'bg-muted-foreground/10 border-muted-foreground/30',
  },
  invalid: {
    label: 'Invalid',
    icon: ShieldX,
    color: 'text-ink-danger',
    bg: 'bg-ink-danger/10 border-ink-danger/30',
  },
  incompatible: {
    label: 'Incompatible',
    icon: AlertTriangle,
    color: 'text-ink-warning',
    bg: 'bg-ink-warning/10 border-ink-warning/30',
  },
  duplicate: {
    label: 'Duplicate',
    icon: Info,
    color: 'text-ink-info',
    bg: 'bg-ink-info/10 border-ink-info/30',
  },
  'settings-error': {
    label: 'Settings Error',
    icon: AlertCircle,
    color: 'text-ink-warning',
    bg: 'bg-ink-warning/10 border-ink-warning/30',
  },
  'runtime-error': {
    label: 'Runtime Error',
    icon: AlertCircle,
    color: 'text-ink-danger',
    bg: 'bg-ink-danger/10 border-ink-danger/30',
  },
};

export function PackageStateBadge({ state }: { state: PackageState }) {
  const config = PACKAGE_STATE_CONFIG[state];
  const Icon = config.icon;

  return (
    <span
      data-video-editor-extension-state-badge={state}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
