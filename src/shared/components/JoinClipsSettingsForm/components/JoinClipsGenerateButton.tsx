import { Check, Film, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';

interface JoinClipsGenerateButtonProps {
  onGenerate: () => void;
  isGenerating: boolean;
  generateSuccess: boolean;
  generateButtonText: string;
  isGenerateDisabled: boolean;
}

export function JoinClipsGenerateButton({
  onGenerate,
  isGenerating,
  generateSuccess,
  generateButtonText,
  isGenerateDisabled,
}: JoinClipsGenerateButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3 pt-4">
      <Button
        onClick={onGenerate}
        disabled={isGenerateDisabled || isGenerating || generateSuccess}
        className={cn(
          'w-full max-w-md shadow-lg gap-2 h-12',
          generateSuccess && 'bg-green-500 hover:bg-green-600',
        )}
        size="lg"
      >
        {isGenerating ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : generateSuccess ? (
          <Check className="w-5 h-5" />
        ) : (
          <Film className="w-5 h-5" />
        )}
        <span className="font-medium text-lg">
          {generateSuccess ? 'Task Created' : generateButtonText}
        </span>
      </Button>
    </div>
  );
}
