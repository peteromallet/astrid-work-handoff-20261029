// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderSection } from './HeaderSection';

const {
  headerPropsMock,
  useShotSettingsIdentityMock,
  useShotSettingsUiMock,
} = vi.hoisted(() => ({
  headerPropsMock: vi.fn(),
  useShotSettingsIdentityMock: vi.fn(),
  useShotSettingsUiMock: vi.fn(),
}));

vi.mock('../ui/Header', () => ({
  Header: (props: Record<string, unknown>) => {
    headerPropsMock(props);
    return <div data-testid="header" />;
  },
}));

vi.mock('../ShotSettingsContext', () => ({
  useShotSettingsIdentity: useShotSettingsIdentityMock,
  useShotSettingsUi: useShotSettingsUiMock,
}));

function createCallbacks() {
  return {
    onBack: vi.fn(),
    onUpdateShotName: vi.fn(),
    onPreviousShot: vi.fn(),
    onNextShot: vi.fn(),
    hasPrevious: true,
    hasNext: true,
    onNameClick: vi.fn(),
    onNameSave: vi.fn(),
    onNameCancel: vi.fn(),
    onNameKeyDown: vi.fn(),
  };
}

describe('HeaderSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('feeds the header with shot identity, name-editing state and the caller callbacks', () => {
    const selectedShot = { id: 'shot-1', name: 'Shot 1' };
    const actions = { setEditingNameValue: vi.fn() };
    const callbacks = createCallbacks();
    useShotSettingsIdentityMock.mockReturnValue({ selectedShot });
    useShotSettingsUiMock.mockReturnValue({
      state: { isEditingName: true, editingName: 'Draft', isTransitioningFromNameEdit: false },
      actions,
    });

    render(
      <HeaderSection
        callbacks={callbacks}
        layout={{ headerContainerRef: { current: null }, centerSectionRef: { current: null }, isSticky: true }}
      />,
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
    const props = headerPropsMock.mock.calls[0][0];
    expect(props.selectedShot).toBe(selectedShot);
    expect(props.isEditingName).toBe(true);
    expect(props.editingName).toBe('Draft');
    expect(props.onBack).toBe(callbacks.onBack);
    expect(props.onUpdateShotName).toBe(callbacks.onUpdateShotName);
    expect(props.onEditingNameChange).toBe(actions.setEditingNameValue);
    expect(props.isSticky).toBe(true);
    expect(props).not.toHaveProperty('autoAdjustedInfo');
    expect(props).not.toHaveProperty('onRevertAspectRatio');
  });
});
