import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/primitives/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { CollapsibleSection } from "@/shared/components/ui/composed/collapsible-section";
import { SectionHeader } from "./SectionHeader";
import { usePromptsSectionController } from "./prompts-section/usePromptsSectionController";

export const PromptsSection: React.FC = () => {
  const controller = usePromptsSectionController();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <SectionHeader title="Prompts" theme="orange" />
      </div>

      {/* Prompt summary: click to open the editor */}
      <div className="space-y-3">
        {!controller.ready ? (
          // Simple skeleton loading state
          <div>
            <div className="p-3 rounded-md shadow-sm bg-slate-50/30 dark:bg-slate-800/30">
              <div className="min-h-[60px] bg-muted rounded animate-pulse"></div>
            </div>
          </div>
        ) : (
          <div
            className="mt-2 group relative p-3 border rounded-md text-center bg-muted/50 hover:border-primary/50 cursor-pointer flex items-center justify-center min-h-[60px]"
            onClick={controller.onOpenPromptModal}
          >
            {controller.prompts.length === 1 && controller.actionablePromptsCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                Click to add prompts...
              </p>
            ) : controller.actionablePromptsCount === controller.prompts.length ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-light text-primary">{controller.prompts.length} {controller.prompts.length === 1 ? 'prompt' : 'prompts'}</span> currently active.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {controller.prompts.length} {controller.prompts.length === 1 ? 'prompt' : 'prompts'}, <span className="font-light text-primary">{controller.actionablePromptsCount} currently active</span>
              </p>
            )}
            {/* Delete All button - hide when there's only one empty prompt */}
            {controller.handleResetPromptsToSingleBlank && !(controller.prompts.length === 1 && controller.actionablePromptsCount === 0) && (
              <div className={`absolute top-1 right-1 flex items-center gap-1 ${controller.isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          controller.handleResetPromptsToSingleBlank();
                        }}
                        disabled={controller.isGenerating || !controller.ready}
                        aria-label="Delete all prompts"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Delete all and reset to one empty prompt
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Additional prompt settings (Before / After prompt modifiers) */}
      <CollapsibleSection title="Additional prompt settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="beforeEachPromptText">
              Before each prompt:
            </Label>
            <Textarea
              id="beforeEachPromptText"
              value={controller.beforeEachPromptText}
              onChange={controller.onBeforeEachPromptTextChange}
              placeholder="Text to prepend"
              disabled={controller.isGenerating}
              className="mt-1 h-16 resize-none"
              rows={2}
              clearable
              onClear={controller.onClearBeforeEachPromptText}
            />
          </div>
          <div>
            <Label htmlFor="afterEachPromptText">
              After each prompt:
            </Label>
            <Textarea
              id="afterEachPromptText"
              value={controller.afterEachPromptText}
              onChange={controller.onAfterEachPromptTextChange}
              placeholder="Text to append"
              disabled={controller.isGenerating}
              className="mt-1 h-16 resize-none"
              rows={2}
              clearable
              onClear={controller.onClearAfterEachPromptText}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};
