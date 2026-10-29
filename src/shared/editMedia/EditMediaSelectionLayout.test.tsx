import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageIcon } from 'lucide-react';
import type React from 'react';

import { EditMediaSelectionLayout } from './EditMediaSelectionLayout';

type LayoutProps = React.ComponentProps<typeof EditMediaSelectionLayout>;

function renderLayout(overrides: Partial<LayoutProps> = {}) {
  const onFileUpload = vi.fn();
  const baseProps: LayoutProps = {
    isMobile: false,
    isDraggingOver: false,
    isUploading: false,
    dropIcon: ImageIcon,
    dropLabel: 'Drop file',
    uploadLabel: 'Upload file',
    uploadingLabel: 'Uploading...',
    mobileHint: 'Tap to upload',
    desktopHint: 'Drag and drop a file',
    accept: 'image/*',
    onFileUpload,
    rightPanel: <div data-testid="right-panel">panel</div>,
  };

  const result = render(<EditMediaSelectionLayout {...baseProps} {...overrides} />);
  return { ...result, onFileUpload };
}

describe('EditMediaSelectionLayout', () => {
  it('renders desktop hint and upload button in default state', () => {
    renderLayout();

    expect(screen.getByText('Drag and drop a file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload file' })).toBeInTheDocument();
    expect(screen.getByTestId('right-panel')).toBeInTheDocument();
  });

  it('renders mobile hint in mobile mode', () => {
    renderLayout({ isMobile: true });
    expect(screen.getByText('Tap to upload')).toBeInTheDocument();
  });

  it('renders drag overlay when dragging', () => {
    renderLayout({ isDraggingOver: true });
    expect(screen.getByText('Drop file')).toBeInTheDocument();
  });

  it('renders upload overlay when uploading', () => {
    renderLayout({ isUploading: true });
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
  });
});
