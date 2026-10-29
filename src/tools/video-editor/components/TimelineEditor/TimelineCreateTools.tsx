import type { ComponentType } from 'react';
import { Layers, Sparkles, Spline } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip.tsx';

/** The drafts the footer tools put into the agent composer (not sent). One definition each, so the canvas and
 *  the shell's sequence-creator entry cannot drift apart. */
export const AI_GENERATION_DRAFT = 'Generate a new image or video of ';
export const EXTENSION_DRAFT = 'Build a new extension that ';
export const EFFECT_OR_ANIMATION_DRAFT = 'Create a custom effect or animation that ';
export const CREATE_ANIMATION_PROMPT = "I'd like to create an animation.";

export const AI_GENERATION_LABEL = 'New AI generation';
export const EXTENSION_LABEL = 'New extension';
export const EFFECT_OR_ANIMATION_LABEL = 'New effect or animation';

const TOOL_BUTTON_BASE_CLASS = 'pointer-events-auto relative flex items-center justify-center rounded-full ring-1 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 active:translate-y-0 active:scale-100 focus-visible:outline-none focus-visible:ring-2';
const TOOL_BUTTON_SIZE_CLASS = 'h-6 w-6';
const ACCENT_TOOL_TONE_CLASS = 'bg-[var(--video-editor-accent-bg-strong)] text-foreground ring-[var(--video-editor-accent-ring)] hover:bg-[var(--video-editor-accent-bg-hover)] hover:shadow-[0_6px_18px_var(--video-editor-accent-shadow-soft)] hover:ring-[var(--video-editor-accent-border)] focus-visible:ring-[var(--video-editor-accent-border)]';
const EFFECT_TOOL_TONE_CLASS = 'bg-[var(--video-editor-effect-bg)] text-foreground ring-[var(--video-editor-effect-ring)] hover:bg-[var(--video-editor-effect-bg-hover)] hover:shadow-[0_6px_18px_var(--video-editor-effect-shadow-soft)] hover:ring-[var(--video-editor-effect-ring-strong)] focus-visible:ring-[var(--video-editor-effect-ring-strong)]';
const SUCCESS_TOOL_TONE_CLASS = 'bg-[var(--video-editor-success-bg)] text-foreground ring-[var(--video-editor-success-ring)] hover:bg-[var(--video-editor-success-bg-hover)] hover:shadow-[0_6px_18px_var(--video-editor-success-shadow-soft)] hover:ring-[var(--video-editor-success-ring-strong)] focus-visible:ring-[var(--video-editor-success-focus-ring)]';

export interface TimelineCreateToolsProps {
  /** Width of the sticky track-name column (the timeline's `startLeft`): the cluster sits just right of it. */
  labelWidth: number;
  /** Presence shows the AI generation tool: opens the agent chat with a draft. */
  onCreateImageGeneration?: () => void;
  /** Presence shows the extension tool: opens the agent chat with a draft. */
  onCreateExtension?: () => void;
  /** Presence shows the effect or animation tool: opens the agent chat with a draft (or drags an effect layer). */
  onCreateEffect?: () => void;
  /** The effect tool is a drag source (an effect layer dropped on a track) instead of a prompt button. */
  effectDragSource?: boolean;
}

interface ToolButtonProps {
  label: string;
  tone: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}

function ToolButton({ label, tone, icon: Icon, onClick }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`${TOOL_BUTTON_BASE_CLASS} ${TOOL_BUTTON_SIZE_CLASS} ${tone}`}
          onClick={onClick}
        >
          <Icon className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The AI generation / extension / effect-or-animation tools in the pinned timeline footer: 24px round tinted
 * buttons, desktop only. Touch has no create tools (adding elements is the agent's job there).
 */
export function TimelineCreateTools({
  labelWidth,
  onCreateImageGeneration,
  onCreateExtension,
  onCreateEffect,
  effectDragSource = false,
}: TimelineCreateToolsProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div
        data-testid="timeline-tool-buttons"
        className="pointer-events-none sticky z-30 ml-2 flex shrink-0 gap-1.5 self-center"
        style={{ left: labelWidth + 8 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {onCreateImageGeneration && (
          <ToolButton label={AI_GENERATION_LABEL} tone={SUCCESS_TOOL_TONE_CLASS} icon={Sparkles} onClick={onCreateImageGeneration} />
        )}
        {onCreateExtension && (
          <ToolButton label={EXTENSION_LABEL} tone={ACCENT_TOOL_TONE_CLASS} icon={Spline} onClick={onCreateExtension} />
        )}
        {onCreateEffect && (effectDragSource ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                draggable
                aria-label={EFFECT_OR_ANIMATION_LABEL}
                onDragStart={(event) => {
                  event.dataTransfer.setData('effect-layer', 'true');
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                className={`${TOOL_BUTTON_BASE_CLASS} ${TOOL_BUTTON_SIZE_CLASS} cursor-grab active:cursor-grabbing ${EFFECT_TOOL_TONE_CLASS}`}
              >
                <Layers className="h-3 w-3" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">{EFFECT_OR_ANIMATION_LABEL}</TooltipContent>
          </Tooltip>
        ) : (
          <ToolButton label={EFFECT_OR_ANIMATION_LABEL} tone={EFFECT_TOOL_TONE_CLASS} icon={Layers} onClick={onCreateEffect} />
        ))}
      </div>
    </TooltipProvider>
  );
}
