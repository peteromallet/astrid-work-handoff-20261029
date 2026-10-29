// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MAX_TIMELINE_SCALE_WIDTH } from '@/tools/video-editor/lib/timeline-scale';
import { TimeRuler } from './TimeRuler';

afterEach(() => vi.restoreAllMocks());

it.each([360, 1440])('keeps maximum-zoom ticks bounded to a %ipx viewport on a long timeline', (width) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  render(<TimeRuler scale={5} scaleWidth={MAX_TIMELINE_SCALE_WIDTH} scaleSplitCount={5} startLeft={144}
    scrollLeft={100_000} totalWidth={1_000_000} gestureOwner="none" onClickTimeArea={vi.fn()}
    onCursorDrag={vi.fn()} setGestureOwner={vi.fn()} setInputModalityFromPointerType={() => 'mouse'} />);
  const ruler = screen.getByTestId('timeline-ruler');
  const ticks = ruler.querySelectorAll('.absolute.bottom-0.w-px');
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks.length).toBeLessThan(25);
});


it('bounds the very first unmeasured render on a practical long timeline', () => {
  const html = renderToStaticMarkup(<TimeRuler scale={5} scaleWidth={MAX_TIMELINE_SCALE_WIDTH} scaleSplitCount={5} startLeft={144}
    scrollLeft={100_000} totalWidth={1_000_000} gestureOwner="none" onClickTimeArea={vi.fn()}
    onCursorDrag={vi.fn()} setGestureOwner={vi.fn()} setInputModalityFromPointerType={() => 'mouse'} />);
  const ticks = html.match(/class="absolute bottom-0 w-px/g) ?? [];
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks.length).toBeLessThan(25);
});
