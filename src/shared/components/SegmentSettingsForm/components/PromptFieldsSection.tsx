import { DefaultableTextarea } from '@/shared/components/DefaultableTextarea';
import type { SegmentFieldSectionProps } from '../types';

export function PromptFieldsSection({
  settings,
  onChange,
  shotDefaults,
  hasOverride,
  onSaveFieldAsDefault,
  handleSaveFieldAsDefault,
  savingField,
}: SegmentFieldSectionProps) {
  if (
    shotDefaults?.textBeforePrompts === undefined &&
    shotDefaults?.textAfterPrompts === undefined
  ) {
    return null;
  }

  return (
    <div className="space-y-2">
      <DefaultableTextarea
        label="Before:"
        value={settings.textBeforePrompts}
        defaultValue={shotDefaults?.textBeforePrompts}
        hasDbOverride={hasOverride?.textBeforePrompts}
        onChange={(value) => onChange({ textBeforePrompts: value })}
        onClear={() => onChange({ textBeforePrompts: '' })}
        onUseDefault={() => onChange({ textBeforePrompts: undefined })}
        onSetAsDefault={
          onSaveFieldAsDefault
            ? (displayValue) =>
                handleSaveFieldAsDefault('textBeforePrompts', displayValue)
            : undefined
        }
        isSavingDefault={savingField === 'textBeforePrompts'}
        className="min-h-0 h-8 text-xs resize-none py-1.5 overflow-hidden"
        placeholder="Text to prepend..."
      />
      <DefaultableTextarea
        label="After:"
        value={settings.textAfterPrompts}
        defaultValue={shotDefaults?.textAfterPrompts}
        hasDbOverride={hasOverride?.textAfterPrompts}
        onChange={(value) => onChange({ textAfterPrompts: value })}
        onClear={() => onChange({ textAfterPrompts: '' })}
        onUseDefault={() => onChange({ textAfterPrompts: undefined })}
        onSetAsDefault={
          onSaveFieldAsDefault
            ? (displayValue) =>
                handleSaveFieldAsDefault('textAfterPrompts', displayValue)
            : undefined
        }
        isSavingDefault={savingField === 'textAfterPrompts'}
        className="min-h-0 h-8 text-xs resize-none py-1.5 overflow-hidden"
        placeholder="Text to append..."
      />
    </div>
  );
}
