import React from 'react';
import type { getVariantConfig } from '@/shared/types/taskDetailsTypes';

interface TaskDetailsFieldProps {
  config: ReturnType<typeof getVariantConfig>;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

export function TaskDetailsField({
  config,
  label,
  value,
  valueClassName,
}: TaskDetailsFieldProps) {
  return (
    <div className="space-y-1">
      <p className={`${config.textSize} font-medium text-muted-foreground`}>{label}</p>
      <p className={`${config.textSize} ${config.fontWeight} text-foreground ${valueClassName ?? ''}`.trim()}>
        {value}
      </p>
    </div>
  );
}
