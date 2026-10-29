import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MinkCircle } from './MinkCircle';

describe('home circle loading mark', () => {
  it('switches to an actual static image when motion preference changes', () => {
    const { container, rerender } = render(<MinkCircle reducedMotion={false} />);
    const image = container.querySelector('img')!;
    expect(image.src).toContain('astrid-minks-loop.webp');
    expect(image).toHaveAttribute('aria-hidden', 'true');
    expect(image).toHaveAttribute('width', '96');
    rerender(<MinkCircle reducedMotion />);
    expect(image.src).toContain('astrid-minks-still.png');
    rerender(<MinkCircle reducedMotion={false} />);
    expect(image.src).toContain('astrid-minks-loop.webp');
  });
});
