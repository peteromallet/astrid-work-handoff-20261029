import { DefaultableTextarea } from '@/shared/components/DefaultableTextarea';
import type { SegmentFieldSectionProps } from '../types';

export function NegativePromptField({
  settings,
  onChange,
  shotDefaults,
  hasOverride,
  onSaveFieldAsDefault,
  handleSaveFieldAsDefault,
  savingField,
}: SegmentFieldSectionProps) {
  return (
    <DefaultableTextarea
      label="Negative Prompt:"
      value={settings.negativePrompt}
      defaultValue={shotDefaults?.negativePrompt}
      hasDbOverride={hasOverride?.negativePrompt}
      onChange={(value) => onChange({ negativePrompt: value })}
      onClear={() => onChange({ negativePrompt: '' })}
      onUseDefault={() => onChange({ negativePrompt: undefined })}
      onSetAsDefault={
        onSaveFieldAsDefault
          ? (displayValue) => handleSaveFieldAsDefault('negativePrompt', displayValue)
          : undefined
      }
      isSavingDefault={savingField === 'negativePrompt'}
      className="h-16 text-xs resize-none"
      placeholder="Things to avoid..."
      containerClassName="space-y-1.5"
    />
  );
}
