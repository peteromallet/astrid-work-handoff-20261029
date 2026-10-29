import * as React from "react"
import { X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { useIsMobile } from "@/shared/hooks/mobile"
import { cn } from "@/shared/components/ui/contracts/cn"

export interface ClearableFieldProps {
  clearable?: boolean
  onClear?: () => void
}

interface UseTextFieldActionsParams extends ClearableFieldProps {
  value: unknown
  defaultValue: unknown
  disabled?: boolean
}

function getTextFieldExistingValue(value: unknown, defaultValue: unknown): string {
  if (value != null) {
    return String(value)
  }
  if (defaultValue != null) {
    return String(defaultValue)
  }
  return ""
}

export function useTextFieldActions({
  value,
  defaultValue,
  clearable = false,
  onClear,
  disabled,
}: UseTextFieldActionsParams) {
  const [isHovered, setIsHovered] = React.useState(false)
  const isMobile = useIsMobile()

  const existingValue = getTextFieldExistingValue(value, defaultValue)
  const hasValue = existingValue.length > 0
  const showClear = Boolean(clearable && onClear && hasValue)
  const showButtons = (isMobile || isHovered) && !disabled && showClear

  const handleClear = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled && onClear) {
        onClear()
      }
    },
    [disabled, onClear]
  )

  return {
    setIsHovered,
    showClear,
    showButtons,
    handleClear,
  }
}

interface TextFieldActionButtonsProps {
  onClearClick: (event: React.MouseEvent) => void
  containerClassName: string
  clearButtonClassName?: string
}

export function TextFieldActionButtons({
  onClearClick,
  containerClassName,
  clearButtonClassName,
}: TextFieldActionButtonsProps) {
  return (
    <div className={containerClassName}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClearClick}
            className={cn(
              "h-6 w-6 rounded-md bg-muted/80 hover:bg-muted flex items-center justify-center transition-colors",
              clearButtonClassName
            )}
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={5}>
          Clear this field
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
