import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourCard } from './TourCard';
import { TOUR_CARD_ENTRANCE_MS } from './useTourCardEntrance';
import { TOUR_FINALE_ENTRANCE_MS } from './TourStrip';
import { EDITOR_TOUR_SCRIPT as SCRIPT } from '../tourScript';
import { EDITOR_TOUR_MEDIA } from '../tourMedia';
import { DISCORD_URL } from '@/pages/Home/publicAstridLinks';
import {
  exitEditorTour,
  getEditorTourState,
  setEditorTourBeat,
  skipEditorTourAnimation,
  startEditorTour,
  type EditorTourAct,
  type EditorTourBeat,
} from '@/shared/state/editorTourStore';

const play = vi.fn(() => Promise.resolve());
const cardReady = () => getEditorTourState().ready.card;

function renderAt(tourAct: EditorTourAct, beat: EditorTourBeat, options: { reducedMotion?: boolean; coarsePointer?: boolean; onSkip?: () => void } = {}) {
  const { reducedMotion = false, coarsePointer = false } = options;
  const onSkip = 'onSkip' in options ? options.onSkip : vi.fn();
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query === '(pointer: coarse)' ? coarsePointer : reducedMotion, media: query } as MediaQueryList));
  startEditorTour();
  setEditorTourBeat(tourAct, beat);
  const onPrimary = vi.fn();
  const view = render(<TourCard act={tourAct} beat={beat} onPrimary={onPrimary} onSkip={onSkip} />);
  return { ...view, onPrimary, onSkip };
}

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh) Chrome/131.0.0.0 Safari/537.36');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  exitEditorTour();
  vi.useRealTimers();
  vi.restoreAllMocks();
  play.mockClear();
});

describe('TourCard', () => {
  it('opens with Astrid\'s welcome and reports ready once its entrance has played', () => {
    const { onPrimary, onSkip } = renderAt(1, 'welcome');
    expect(screen.getByRole('heading')).toHaveTextContent(SCRIPT.welcome.title);
    expect(screen.getByText(SCRIPT.welcome.body)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    advance(TOUR_CARD_ENTRANCE_MS - 1);
    expect(cardReady()).toBe(false);
    advance(1);
    expect(cardReady()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${SCRIPT.welcome.action}`) }));
    fireEvent.click(screen.getByRole('button', { name: /Skip tour/ }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('on compose shows a quiet hint and never reports ready', () => {
    renderAt(1, 'compose');
    expect(screen.getByText(SCRIPT.hints.compose)).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
    advance(TOUR_CARD_ENTRANCE_MS * 2);
    expect(cardReady()).toBe(false);
  });

  it('on respond (act 1) offers the reply its Next, with the hint', () => {
    const { onPrimary } = renderAt(1, 'respond');
    expect(screen.getByText(SCRIPT.hints.respond)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    advance(TOUR_CARD_ENTRANCE_MS * 2);
    expect(cardReady()).toBe(false);
  });

  it.each([1, 2, 3] as const)('explains act %i on land and reports ready once its entrance has played', (tourAct) => {
    const { onPrimary, onSkip, container } = renderAt(tourAct, 'land');
    const { title, body, labels } = SCRIPT.acts[tourAct].card;
    expect(screen.getByRole('heading')).toHaveTextContent(title);
    expect(screen.queryByRole('heading', { name: new RegExp(`^${tourAct} · `) })).toBeNull();
    // The top row: the "N of 3" counter and Skip share it; Next stays in the bottom row.
    const topRow = screen.getByText(`${tourAct} of 3`).closest('.justify-between');
    expect(topRow).not.toBeNull();
    expect(topRow).toContainElement(screen.getByRole('button', { name: /Skip tour/ }));
    expect(topRow).not.toContainElement(screen.getByRole('button', { name: /Next/ }));
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    expect(screen.getByText(body)).toBeInTheDocument();
    for (const label of labels) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    for (const step of SCRIPT.strip) expect(screen.getAllByText(step).length).toBeGreaterThan(0);
    // The strip fills act by act; at rest the video step shows where the flight ends, as a still.
    expect(container.querySelectorAll('ol img, ol video')).toHaveLength(tourAct);
    if (tourAct === 3) expect(container.querySelectorAll('ol img')[2]).toHaveAttribute('src', EDITOR_TOUR_MEDIA.stills[3].url);

    expect(container.querySelector('.editor-tour-card-playing')).not.toBeNull();
    advance(TOUR_CARD_ENTRANCE_MS - 1);
    expect(cardReady()).toBe(false);
    advance(1);
    expect(cardReady()).toBe(true);
    expect(container.querySelector('[data-settled]')).not.toBeNull();
    expect(container.querySelector('.editor-tour-card-playing')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Skip tour/ }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('asks "Do you get it?" at the finale with the whole strip', () => {
    const { onPrimary, container } = renderAt(3, 'finale');
    expect(screen.getByRole('heading')).toHaveTextContent(SCRIPT.finale.title);
    for (const recap of SCRIPT.finale.recap) expect(screen.getByText(recap)).toBeInTheDocument();
    expect(container.querySelectorAll('ol img, ol video')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Skip tour/ })).toBeNull();
    advance(TOUR_FINALE_ENTRANCE_MS);
    expect(cardReady()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(SCRIPT.finale.action) }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  describe('the finale chain', () => {
    const litNodes = (root: Element) => root.querySelectorAll('[data-tour-lit="node"]');
    const litLines = (root: Element) => root.querySelectorAll('[data-tour-lit="line"]');
    const delayOf = (el: Element) => parseInt((el as HTMLElement).style.getPropertyValue('--tour-delay'), 10);

    it('lights node, line, node, line, node in order while the card plays, and ends lit', () => {
      const { container } = renderAt(3, 'finale');
      expect(litNodes(container)).toHaveLength(3);
      expect(litLines(container)).toHaveLength(2);
      // Lit in the accent: the nodes' borders and the lines.
      for (const el of litNodes(container)) expect(el).toHaveClass('border-primary');
      for (const el of litLines(container)) expect(el).toHaveClass('bg-primary');
      const [n1, n2, n3] = [...litNodes(container)];
      const [l1, l2] = [...litLines(container)];
      // Each step starts after the one before it, so the chain lights in reading order.
      const order = [n1, l1, n2, l2, n3].map(delayOf);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size).toBe(5);
      expect(n1).toHaveClass('editor-tour-light');
      expect(l1).toHaveClass('editor-tour-draw');
      expect(container.querySelector('.editor-tour-card-playing')).not.toBeNull();

      // The chain is still lighting when an ordinary card would have settled.
      advance(TOUR_CARD_ENTRANCE_MS);
      expect(cardReady()).toBe(false);
      expect(TOUR_FINALE_ENTRANCE_MS).toBeGreaterThan(delayOf(n3));
      advance(TOUR_FINALE_ENTRANCE_MS - TOUR_CARD_ENTRANCE_MS);
      expect(cardReady()).toBe(true);
      // At rest: no animation runs, and every node and line keeps its lit style.
      expect(container.querySelector('.editor-tour-card-playing')).toBeNull();
      expect(litNodes(container)).toHaveLength(3);
      expect(litLines(container)).toHaveLength(2);
    });

    it('arrives already lit, without playing, when reached by Back (instant)', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: false, media: query } as MediaQueryList));
      startEditorTour();
      setEditorTourBeat(3, 'finale', true);
      expect(getEditorTourState().instant).toBe(true);
      const { container } = render(<TourCard act={3} beat="finale" onPrimary={vi.fn()} onBack={vi.fn()} />);
      expect(cardReady()).toBe(true);
      expect(container.querySelector('.editor-tour-card-playing')).toBeNull();
      expect(litNodes(container)).toHaveLength(3);
      expect(litLines(container)).toHaveLength(2);
    });

    it('arrives already lit, without playing, under reduced motion', () => {
      const { container } = renderAt(3, 'finale', { reducedMotion: true });
      expect(cardReady()).toBe(true);
      expect(container.querySelector('.editor-tour-card-reduced')).not.toBeNull();
      expect(container.querySelector('.editor-tour-card-playing')).toBeNull();
      expect(litNodes(container)).toHaveLength(3);
      expect(litLines(container)).toHaveLength(2);
    });

    it('settles lit at once on a skipAnimation bump', () => {
      const { container } = renderAt(3, 'finale');
      advance(200);
      act(() => skipEditorTourAnimation());
      expect(cardReady()).toBe(true);
      expect(container.querySelector('.editor-tour-card-playing')).toBeNull();
      expect(litNodes(container)).toHaveLength(3);
    });

    it('leaves the act cards\' compact strip unlit', () => {
      const { container } = renderAt(3, 'land');
      expect(litNodes(container)).toHaveLength(0);
      expect(litLines(container)).toHaveLength(0);
    });
  });

  it.each([1, 2, 3] as const)('shows act %i its own compose header, above the Press Send line', (tourAct) => {
    renderAt(tourAct, 'compose');
    const header = screen.getByRole('heading', { name: SCRIPT.acts[tourAct].composeHeader });
    expect(header.compareDocumentPosition(screen.getByText(SCRIPT.hints.compose)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(`${tourAct} of 3`).compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.closest('section')).toHaveClass('w-[360px]');
  });

  it('gives every act a distinct compose header', () => {
    const headers = [1, 2, 3].map((tourAct) => SCRIPT.acts[tourAct as EditorTourAct].composeHeader);
    expect(new Set(headers).size).toBe(3);
    for (const tourAct of [1, 2, 3] as const) {
      const view = renderAt(tourAct, 'compose');
      expect(screen.getByRole('heading', { name: SCRIPT.acts[tourAct].composeHeader })).toBeInTheDocument();
      view.unmount();
      exitEditorTour();
    }
  });

  it('asks for feedback at the end, with a Discord link that opens in a new tab', () => {
    const { onPrimary } = renderAt(3, 'feedback');
    expect(screen.getByRole('heading')).toHaveTextContent(SCRIPT.feedback.title);
    expect(screen.getByText(SCRIPT.feedback.body)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: SCRIPT.feedback.discord });
    expect(link).toHaveAttribute('href', DISCORD_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: /Skip tour/ })).toBeNull();
    advance(TOUR_CARD_ENTRANCE_MS);
    expect(cardReady()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${SCRIPT.feedback.action}`) }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('settles at once on a skipAnimation bump', () => {
    const { container } = renderAt(2, 'land');
    advance(200);
    expect(cardReady()).toBe(false);
    act(() => skipEditorTourAnimation());
    expect(cardReady()).toBe(true);
    expect(container.querySelector('.editor-tour-card-playing')).toBeNull();
  });

  it('replays the entrance for the next beat after a skip', () => {
    const view = renderAt(1, 'land');
    act(() => skipEditorTourAnimation());
    expect(cardReady()).toBe(true);
    act(() => setEditorTourBeat(2, 'land'));
    expect(cardReady()).toBe(false);
    advance(TOUR_CARD_ENTRANCE_MS);
    expect(cardReady()).toBe(false); // still showing act 1: the runner has not moved the card on yet
    view.rerender(<TourCard act={2} beat="land" onPrimary={view.onPrimary} onSkip={view.onSkip} />);
    advance(TOUR_CARD_ENTRANCE_MS);
    expect(cardReady()).toBe(true);
  });

  it('with reduced motion is ready at once, only fades in, and keeps videos still', () => {
    const { container } = renderAt(3, 'land', { reducedMotion: true });
    expect(cardReady()).toBe(true);
    expect(container.querySelector('.editor-tour-card-reduced')).not.toBeNull();
    expect(container.querySelector('.editor-tour-card-playing')).toBeNull();
    expect(container.querySelector('.editor-tour-playhead')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('plays the act-3 video with motion on', () => {
    renderAt(3, 'land');
    expect(play).toHaveBeenCalled();
  });

  it('plays the act-3 video when the card is reached by Back (instant)', () => {
    startEditorTour();
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: false, media: query } as MediaQueryList));
    setEditorTourBeat(3, 'land', true);
    expect(getEditorTourState().instant).toBe(true);
    render(<TourCard act={3} beat="land" onPrimary={vi.fn()} onSkip={vi.fn()} />);
    expect(play).toHaveBeenCalled();
    expect(cardReady()).toBe(true);
  });

  it('names Esc without a skip handler', () => {
    renderAt(1, 'land', { onSkip: undefined });
    expect(screen.queryByRole('button', { name: /Skip tour/ })).toBeNull();
    expect(screen.getByText('Esc')).toBeInTheDocument();
  });

  it('hides keyboard hints on phones', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('iPhone');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    renderAt(1, 'compose');
    expect(screen.queryByText('Esc')).not.toBeInTheDocument();
    expect(screen.queryByText('↵')).not.toBeInTheDocument();
  });

  it('hides keyboard hints on coarse pointer devices', () => {
    renderAt(1, 'compose', { coarsePointer: true });
    expect(screen.queryByText('Esc')).not.toBeInTheDocument();
    expect(screen.queryByText('↵')).not.toBeInTheDocument();
  });

  it('on a phone leaves the picture to the spotlit preview, sizes controls for a finger and ends the tour toward a computer', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('iPhone');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: false, media: query } as MediaQueryList));
    startEditorTour();
    setEditorTourBeat(1, 'land');
    const { container, rerender } = render(<TourCard act={1} beat="land" device="phone" onPrimary={vi.fn()} onBack={vi.fn()} onSkip={vi.fn()} />);
    expect(container.querySelector('[aria-hidden="true"].h-32')).toBeNull();
    expect(screen.getByRole('button', { name: SCRIPT.controls.next })).toHaveClass('h-11');
    expect(screen.getByRole('button', { name: /Skip tour/ })).toHaveClass('min-h-11');
    setEditorTourBeat(3, 'feedback');
    rerender(<TourCard act={3} beat="feedback" device="phone" onPrimary={vi.fn()} onBack={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByRole('button', { name: SCRIPT.feedback.mobileAction })).toBeInTheDocument();
  });

  it('a card still showing the previous beat never reports ready for the new one', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: false, media: query } as MediaQueryList));
    startEditorTour();
    setEditorTourBeat(1, 'compose'); // the store has moved on; the runner still shows the welcome
    const { container } = render(<TourCard act={1} beat="welcome" onPrimary={vi.fn()} onSkip={vi.fn()} />);
    advance(TOUR_CARD_ENTRANCE_MS * 2);
    expect(container.querySelector('[data-editor-tour-card]')).toHaveAttribute('data-settled');
    expect(cardReady()).toBe(false);
  });

  describe('Back', () => {
    function renderWithBack(tourAct: EditorTourAct, beat: EditorTourBeat) {
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: false, media: query } as MediaQueryList));
      startEditorTour();
      setEditorTourBeat(tourAct, beat);
      const onBack = vi.fn();
      const view = render(<TourCard act={tourAct} beat={beat} onPrimary={vi.fn()} onBack={onBack} onSkip={vi.fn()} />);
      return { ...view, onBack };
    }

    it.each(['compose', 'respond', 'land'] as const)('sits right of the counter on the %s top row, with Skip after it', (beat) => {
      const { onBack } = renderWithBack(2, beat);
      const counter = screen.getByText('2 of 3');
      const back = screen.getByRole('button', { name: /Back/ });
      const skip = screen.getByRole('button', { name: /Skip tour/ });
      expect(counter.nextElementSibling).toBe(back);
      expect(counter.closest('.justify-between')).toContainElement(skip);
      expect(back.compareDocumentPosition(skip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.click(back);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('is bottom-left on the finale, opposite the primary action', () => {
      const { onBack } = renderWithBack(3, 'finale');
      const back = screen.getByRole('button', { name: /Back/ });
      const primary = screen.getByRole('button', { name: new RegExp(`^${SCRIPT.finale.action}`) });
      expect(back.parentElement).toBe(primary.parentElement);
      expect(back.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      fireEvent.click(back);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('is bottom-left on the feedback card, opposite Start creating', () => {
      const { onBack } = renderWithBack(3, 'feedback');
      const back = screen.getByRole('button', { name: /Back/ });
      const primary = screen.getByRole('button', { name: new RegExp(`^${SCRIPT.feedback.action}`) });
      expect(back.parentElement).toBe(primary.parentElement);
      fireEvent.click(back);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('is absent on the welcome', () => {
      renderWithBack(1, 'welcome');
      expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
    });

    it('arrives settled and ready at once when the beat was reached by Back', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: false, media: query } as MediaQueryList));
      startEditorTour();
      setEditorTourBeat(3, 'land', true);
      const { container } = render(<TourCard act={3} beat="land" onPrimary={vi.fn()} onBack={vi.fn()} onSkip={vi.fn()} />);
      expect(cardReady()).toBe(true);
      expect(container.querySelector('[data-editor-tour-card]')).toHaveAttribute('data-settled');
    });
  });
});
