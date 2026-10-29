import * as React from "react"
import { cn } from "@/shared/components/ui/contracts/cn"
import {
  TextFieldActionButtons,
  type ClearableFieldProps,
  useTextFieldActions,
} from "./textFieldActions"

interface InputProps extends React.ComponentProps<"input">, ClearableFieldProps {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    type,
    clearable = false,
    onClear,
    ...props
  }, ref) => {
    const fieldActions = useTextFieldActions({
      value: props.value,
      defaultValue: props.defaultValue,
      clearable,
      onClear,
      disabled: props.disabled,
    })

    return (
      <div
        className="relative"
        onMouseEnter={() => fieldActions.setIsHovered(true)}
        onMouseLeave={() => fieldActions.setIsHovered(false)}
      >
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-light file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]",
            fieldActions.showClear && "pr-10",
            className
          )}
          ref={ref}
          {...props}
        />

        {fieldActions.showButtons && (
          <TextFieldActionButtons
            onClearClick={fieldActions.handleClear}
            containerClassName="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1 z-10"
          />
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
