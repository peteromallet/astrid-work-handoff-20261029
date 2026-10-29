// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSettingsModal } from './ProjectSettingsModal';

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectCrudContext: () => ({
    updateProject: vi.fn(),
    isUpdatingProject: false,
    deleteProject: vi.fn(),
    isDeletingProject: false,
  }),
}));

vi.mock('@/shared/components/GenerationControls/AspectRatioSelector', () => ({
  AspectRatioSelector: () => <div data-testid="aspect-ratio-selector" />,
}));

vi.mock('@/shared/components/ModalContainer', () => ({
  ModalContainer: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

const project = {
  id: 'project-1',
  name: 'My project',
  aspectRatio: '16:9',
} as React.ComponentProps<typeof ProjectSettingsModal>['project'];

describe('ProjectSettingsModal', () => {
  it('shows name and aspect ratio but no crop-to-project-size control', () => {
    render(<ProjectSettingsModal isOpen onOpenChange={vi.fn()} project={project} />);

    expect(screen.getByLabelText('Name:')).toHaveProperty('value', 'My project');
    expect(screen.getByTestId('aspect-ratio-selector')).toBeTruthy();
    expect(screen.queryByText('Crop uploaded images to project size')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
