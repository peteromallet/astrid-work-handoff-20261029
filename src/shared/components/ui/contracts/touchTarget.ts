/**
 * A compact control that is still a 44px touch target. On a coarse pointer
 * (phones, tablets) it draws at 36px and an invisible 4px ring around it takes
 * the hit area to 44px, so a row of controls stays light without being hard to
 * tap. A fine pointer keeps the control's own size.
 *
 * Space neighbouring controls at least 8px apart (`gap-2`) so their rings meet
 * rather than overlap.
 */
export const COARSE_TOUCH_TARGET = [
  'relative',
  '[@media(pointer:coarse)]:h-9',
  '[@media(pointer:coarse)]:min-h-9',
  '[@media(pointer:coarse)]:min-w-9',
  "[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-1 [@media(pointer:coarse)]:after:content-['']",
].join(' ');
