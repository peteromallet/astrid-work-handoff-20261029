import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RUNTIME_CONNECTION_COPY } from '@/shared/components/RuntimeConnection/copy.ts';

let origin = '';
vi.mock('@/integrations/runtime/connection.ts', () => ({ runtimeOrigin: () => origin }));

import { GenerateButton } from './GenerateButton';

function renderButton(editMode: string, isMobile = false) {
  return render(
    <GenerateButton
      isMobile={isMobile}
      editMode={editMode}
      handleUnifiedGenerate={vi.fn()}
      handleGenerateAnnotatedEdit={vi.fn()}
      brushStrokes={[{ id: 's' } as never]}
      inpaintPrompt="a prompt"
      isGeneratingInpaint={false}
      inpaintGenerateSuccess={false}
      isCreatingMagicEditTasks={false}
      magicEditTasksCreated={false}
    />,
  );
}

afterEach(() => { origin = ''; });

describe('GenerateButton on the hosted build', () => {
  it.each(['text', 'inpaint', 'annotate'])('%s tab: the button is disabled and the compose line says why', (editMode) => {
    origin = 'http://127.0.0.1:17340';
    renderButton(editMode);

    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText(RUNTIME_CONNECTION_COPY.composeDisabled)).toBeInTheDocument();
  });

  it('same-origin is unchanged: the button is enabled and no line shows', () => {
    origin = '';
    renderButton('text');

    expect(screen.getByRole('button')).toBeEnabled();
    expect(screen.queryByText(RUNTIME_CONNECTION_COPY.composeDisabled)).toBeNull();
  });
});
