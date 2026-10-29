import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { DiagnosticSeverity } from '@astrid/editor-sdk';

// ---------------------------------------------------------------------------
// Diagnostic severity styling helpers
// ---------------------------------------------------------------------------

export const DIAG_SEVERITY_ICON: Record<DiagnosticSeverity, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export const DIAG_SEVERITY_COLOR: Record<DiagnosticSeverity, string> = {
  error: 'text-ink-danger',
  warning: 'text-ink-warning',
  info: 'text-ink-info',
};

export const DIAG_SEVERITY_BG: Record<DiagnosticSeverity, string> = {
  error: 'bg-ink-danger/10 border-ink-danger/30',
  warning: 'bg-ink-warning/10 border-ink-warning/30',
  info: 'bg-ink-info/10 border-ink-info/30',
};
