import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RUNTIME_CONNECTION_COPY } from '@/shared/components/RuntimeConnection/copy.ts';

let origin = '';
vi.mock('@/integrations/runtime/connection.ts', () => ({ runtimeOrigin: () => origin }));
vi.mock('@/domains/lora/components', () => ({
  ActiveLoRAsDisplay: () => null,
}));

import { Img2ImgControls } from './Img2ImgControls';

function renderControls() {
  return render(
    <Img2ImgControls
      isMobile={false}
      img2imgPrompt="a prompt"
      setImg2imgPrompt={vi.fn()}
      flushTextFields={vi.fn().mockResolvedValue(undefined)}
      img2imgStrength={0.5}
      setImg2imgStrength={vi.fn()}
      isGeneratingImg2Img={false}
      img2imgGenerateSuccess={false}
      handleGenerateImg2Img={vi.fn()}
      availableLoras={[]}
      SectionLabel={({ children }) => <span>{children}</span>}
    />,
  );
}

describe('Img2ImgControls on the hosted build', () => {
  it('shows the plain disabled-reason note with no link to a local app', () => {
    origin = 'http://127.0.0.1:17340';
    renderControls();

    expect(screen.getByRole('note')).toHaveTextContent("Making new images isn't on this page yet.");
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('with the gateway origin, disables Transform and shows the compose line', () => {
    origin = 'http://127.0.0.1:17340';
    renderControls();

    expect(screen.getByRole('button', { name: /Transform Image/ })).toBeDisabled();
    expect(screen.getByText(RUNTIME_CONNECTION_COPY.composeDisabled)).toBeInTheDocument();
  });

  it('same-origin is unchanged: Transform is enabled and no line shows', () => {
    origin = '';
    renderControls();

    expect(screen.getByRole('button', { name: /Transform Image/ })).toBeEnabled();
    expect(screen.queryByText(RUNTIME_CONNECTION_COPY.composeDisabled)).toBeNull();
  });
});
