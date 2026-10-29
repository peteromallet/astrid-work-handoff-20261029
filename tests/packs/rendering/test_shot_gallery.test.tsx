// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShotGallery, ShotsStrip, filterShots, pageCount, SHOTS_PER_PAGE } from '../../../astrid/packs/rendering/ui/threejs-live-editor/explorer/ShotGallery';
import { shotStills } from '../../../astrid/packs/rendering/ui/threejs-live-editor/shotStills';

afterEach(cleanup);

const SHOTS = Array.from({ length: 12 }, (_, i) => ({ name: i % 4 === 0 ? `Bridge ${i + 1}` : `Shot ${i + 1}`, start: i * 5, end: i * 5 + 5 }));
const handle = () => ({ draggable: true as const, onDragStart: vi.fn(), onDragEnd: vi.fn() });

function mount(over: Partial<Parameters<typeof ShotGallery>[0]> = {}) {
  const props = {
    shots: SHOTS, currentIndex: 0, revision: 'gallery-test', fullscreen: false, addDisabled: false,
    dragPropsFor: vi.fn(() => handle()), onSelect: vi.fn(), onAdd: vi.fn(), ...over,
  };
  return { props, view: render(<ShotGallery {...props} />) };
}
const cards = (view: ReturnType<typeof render>) => within(view.getByRole('list', { name: 'Shots' })).getAllByRole('listitem');

describe('gallery helpers', () => {
  it('filters by name, case-insensitively, keeping indexes in the full list', () => {
    expect(filterShots(SHOTS, ' bridge ').map(({ index }) => index)).toEqual([0, 4, 8]);
    expect(filterShots(SHOTS, '')).toHaveLength(12);
    expect(filterShots(SHOTS, 'zzz')).toEqual([]);
  });
  it('pages nine at a time and always has at least one page', () => {
    expect([0, 1, 9, 10, 18, 19].map((n) => pageCount(n))).toEqual([1, 1, 1, 2, 2, 3]);
    expect(SHOTS_PER_PAGE).toBe(9);
  });
});

describe('ShotGallery', () => {
  it('shows nine cards on page one with a count, and the rest on page two', () => {
    const { view } = mount();
    expect(cards(view)).toHaveLength(9);
    expect(view.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search 12 shots');
    expect(view.queryByText(/^\d+ of \d+$/)).toBeNull();
    expect(view.getByLabelText('Page 1 of 2')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(view.getByRole('button', { name: 'Next page' }));
    expect(cards(view)).toHaveLength(3);
    expect(view.getByLabelText('Page 2 of 2')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(within(cards(view)[0]).getByText('Shot 10')).toBeTruthy();
  });
  it('hides the page controls when everything fits on one page', () => {
    const { view } = mount({ shots: SHOTS.slice(0, 4) });
    expect(view.queryByRole('navigation', { name: 'Shots pages' })).toBeNull();
  });
  it('searching resets to page 1, shows the match count, and keeps paging working', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `Tower ${i + 1}`, start: i, end: i + 1 }));
    const { view } = mount({ shots: [...many, { name: 'Harbour', start: 30, end: 31 }] });
    fireEvent.click(view.getByRole('button', { name: 'Next page' }));
    expect(view.getByLabelText('Page 2 of 3')).toBeTruthy();
    fireEvent.change(view.getByRole('searchbox', { name: 'Search shots' }), { target: { value: 'tower' } });
    expect(view.getByLabelText('Page 1 of 3')).toBeTruthy();
    expect(view.getByText('25 of 26')).toBeTruthy();
    fireEvent.change(view.getByRole('searchbox', { name: 'Search shots' }), { target: { value: 'harb' } });
    expect(cards(view)).toHaveLength(1);
    expect(view.getByText('1 of 26')).toBeTruthy();
    expect(view.queryByRole('navigation', { name: 'Shots pages' })).toBeNull();
  });
  it('says so when nothing matches, and Clear search brings everything back', () => {
    const { view } = mount();
    fireEvent.change(view.getByRole('searchbox', { name: 'Search shots' }), { target: { value: 'nope' } });
    expect(view.getByText(/No shots match/)).toBeTruthy();
    expect(view.getByText('0 of 12')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Clear search' }));
    expect(cards(view)).toHaveLength(9);
    expect((view.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
  it('Escape clears the search without leaving the field', () => {
    const { view } = mount();
    const box = view.getByRole('searchbox') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'bridge' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('');
  });
  it('selecting a card reports its index in the full list, even when filtered', () => {
    const { view, props } = mount();
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'bridge' } });
    fireEvent.click(within(view.getByRole('list', { name: 'Shots' })).getByRole('button', { name: /^Bridge 5,/ }));
    expect(props.onSelect).toHaveBeenCalledWith(4);
  });
  it('marks the current shot', () => {
    const { view } = mount({ currentIndex: 2 });
    expect(within(cards(view)[2]).getByRole('button', { name: /^Shot 3,/ })).toHaveAttribute('aria-current', 'true');
    expect(within(cards(view)[1]).getByRole('button', { name: /^Shot 2,/ })).not.toHaveAttribute('aria-current');
  });
  it('docked: every card has one drag-or-add button, and Enter/click adds that shot at the playhead', () => {
    const { view, props } = mount();
    const handles = view.getAllByTestId('shot-drag-handle');
    expect(handles).toHaveLength(9);
    expect(handles[0].tagName).toBe('BUTTON');
    expect(handles[0]).toHaveAttribute('aria-label', 'Add Bridge 1 to video, or drag it onto the timeline');
    expect(view.queryByRole('button', { name: /^Add .* to video$/ })).toBeNull();
    fireEvent.click(handles[2]);
    expect(props.onAdd).toHaveBeenCalledWith(2);
  });
  it('the action sits beside the caption, never inside the still button', () => {
    const { view } = mount({ fullscreen: true });
    const card = cards(view)[0];
    const face = within(card).getByRole('button', { name: /^Bridge 1,/ });
    const action = within(card).getByRole('button', { name: 'Add Bridge 1 to video' });
    expect(face.contains(action)).toBe(false);
    expect(face.querySelector('img, [role="img"]')).not.toBeNull();
    expect(face.querySelector('button')).toBeNull();
  });
  it('the pager is the last thing in the search row and keeps its width on every page', () => {
    const { view } = mount();
    const nav = view.getByRole('navigation', { name: 'Shots pages' });
    expect(nav.parentElement?.lastElementChild).toBe(nav);
    const width = (view.getByLabelText('Page 1 of 2') as HTMLElement).style.width;
    fireEvent.click(view.getByRole('button', { name: 'Next page' }));
    expect((view.getByLabelText('Page 2 of 2') as HTMLElement).style.width).toBe(width);
  });
  it('the search row is sticky on the explorer surface, with no strip of its own above the field', () => {
    const { view } = mount();
    const row = view.getByRole('searchbox').closest('div.sticky') as HTMLElement;
    expect(row.className).toContain('sticky top-0');
    expect(row.className).not.toContain('-mt-1');
    expect(row.getAttribute('style')).toContain('var(--explorer-surface');
  });
  it('cards sit flush: no negative margin on the grid, and the caption row holds the action', () => {
    const { view } = mount({ fullscreen: true });
    const list = view.getByRole('list', { name: 'Shots' });
    expect(list.className).not.toContain('-mx-1');
    expect(list.className).toContain('gap-x-3');
    const card = cards(view)[0];
    const action = within(card).getByRole('button', { name: 'Add Bridge 1 to video' });
    expect(action.parentElement?.className).toContain('h-6');
    expect(within(card).getByRole('button', { name: /^Bridge 1,/ }).className).toContain('p-0');
  });
  it('full screen: every card offers Add to video instead of a handle', () => {
    const { view, props } = mount({ fullscreen: true });
    expect(view.queryByTestId('shot-drag-handle')).toBeNull();
    const add = view.getAllByRole('button', { name: /^Add .* to video$/ });
    expect(add).toHaveLength(9);
    fireEvent.click(add[1]);
    expect(props.onAdd).toHaveBeenCalledWith(1);
  });
  it('disables Add when the panel cannot add', () => {
    const { view } = mount({ fullscreen: true, addDisabled: true, addTitle: 'Open a timeline to add worlds to a video.' });
    expect(view.getAllByRole('button', { name: /^Add .* to video$/ })[0]).toBeDisabled();
  });
  it('docked: a disabled add does not fire onAdd', () => {
    const { view, props } = mount({ addDisabled: true });
    fireEvent.click(view.getAllByTestId('shot-drag-handle')[0]);
    expect(props.onAdd).not.toHaveBeenCalled();
  });
  it('has its own clear button while searching, and no native one', () => {
    const { view } = mount();
    expect(view.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Bridge' } });
    fireEvent.click(view.getByRole('button', { name: 'Clear search' }));
    expect((view.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
  it('shows a loading placeholder until the still arrives, then the image', () => {
    const { view } = mount({ shots: SHOTS.slice(0, 1) });
    expect(view.getByRole('img', { name: /Loading preview of Bridge 1/ })).toBeTruthy();
    const took = shotStills.take('gallery-test');
    expect(took).toEqual({ revision: 'gallery-test', start: 0 });
    view.rerender(<ShotGallery shots={SHOTS.slice(0, 1)} currentIndex={0} revision="gallery-test" fullscreen={false} addDisabled={false} dragPropsFor={() => null} onSelect={() => {}} onAdd={() => {}} />);
    act(() => { shotStills.fulfil('gallery-test', 0, 'data:image/jpeg;base64,AAAA'); });
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');
  });
  it('says what an empty world gets', () => {
    const { view } = mount({ shots: [] });
    expect(view.getByText(/no shots yet/)).toBeTruthy();
  });
});

describe('ShotsStrip', () => {
  const strip = (shots: typeof SHOTS, over: Record<string, unknown> = {}) => {
    const props = { shots, revision: 'gallery-test', fullscreen: false, addDisabled: false, dragPropsFor: vi.fn(() => handle()), onSelect: vi.fn(), onAdd: vi.fn(), onViewAll: vi.fn(), ...over };
    return { props, view: render(<ShotsStrip {...props} />) };
  };

  it('shows the count, a View shots link, and every card when they fit', () => {
    const { view, props } = strip(SHOTS.slice(0, 4));
    expect(view.getByText('Shots · 4')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'View shots →' }));
    expect(props.onViewAll).toHaveBeenCalled();
    expect(within(view.getByRole('list', { name: 'Shots preview' })).getAllByRole('listitem')).toHaveLength(4);
    expect(view.queryByRole('button', { name: /more shots/ })).toBeNull();
  });

  it('turns the last slot into a +N more tile when there are more shots than rows', () => {
    const { view, props } = strip(SHOTS);
    const items = within(view.getByRole('list', { name: 'Shots preview' })).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    const more = view.getByRole('button', { name: `${SHOTS.length - 5} more shots, view shots` });
    expect(more).toHaveTextContent(`+${SHOTS.length - 5} more`);
    fireEvent.click(more);
    expect(props.onViewAll).toHaveBeenCalled();
  });

  it('selecting a card reports its index', () => {
    const { view, props } = strip(SHOTS);
    fireEvent.click(view.getAllByRole('button', { name: /^Shot 2,/ })[0]);
    expect(props.onSelect).toHaveBeenCalledWith(1);
  });

  it('says so, with no link, when the world has no shots', () => {
    const { view } = strip([]);
    expect(view.getByText('No shots in this world yet')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'View shots →' })).toBeNull();
  });
});
