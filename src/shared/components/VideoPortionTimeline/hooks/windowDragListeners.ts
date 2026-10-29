export function registerWindowDragListeners(
  handleMove: (event: MouseEvent | TouchEvent) => void,
  handleEnd: () => void
): () => void {
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);
  window.addEventListener('touchmove', handleMove, { passive: false });
  window.addEventListener('touchend', handleEnd);
  window.addEventListener('touchcancel', handleEnd);

  return () => {
    window.removeEventListener('mousemove', handleMove);
    window.removeEventListener('mouseup', handleEnd);
    window.removeEventListener('touchmove', handleMove);
    window.removeEventListener('touchend', handleEnd);
    window.removeEventListener('touchcancel', handleEnd);
  };
}
