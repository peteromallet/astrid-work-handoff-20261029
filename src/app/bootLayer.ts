/**
 * index.html's boot layer: the page paper and Astrid's running mink, shown before the bundle
 * runs. index.html owns its look and CSS timings; this lifts it once the page's first real
 * frame has committed.
 *
 * Ready means #root has content and nothing in it holds the boot (`data-boot-hold`, which the
 * video editor renders while its workspace answers), so the paper dissolves straight into the
 * editor's frame rather than into an empty sky. The lift starts on the next frame, with that
 * frame already painted under it.
 *
 * With a visible mink and a page that draws the same mark in the same place (`data-boot-mink-continue`: the
 * connecting screen's MinkRunner, at the boot mink's size), the layer is removed at once and that mark carries on
 * from the boot mink's frame: nothing fades, runs on or restarts, so the mark never dims or jumps.
 *
 * With a visible mink and a logo to land on (`data-boot-mink-target`), the mink runs home to
 * the logo, slowing to a stop, while its body dissolves from the bottom up; only its head
 * arrives, on the logo's head, and the two trade places on the same pixels. Otherwise (no
 * logo, a fast load the mink never appeared for, or reduced motion) it runs on and fades as the
 * paper dissolves. Only transform and opacity move, so the compositor carries it all on a busy
 * main thread.
 */

/** The run home: long enough to read as travel, short enough not to keep anyone waiting. */
const FLIGHT_MS = 600;
/** Across first, then up into the corner, easing into place. */
const FLIGHT_X_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const FLIGHT_Y_EASE = 'cubic-bezier(0.6, 0, 0.3, 1)';
/** The body dissolves through the whole flight and finishes as the head settles. */
const WIPE_EASE = 'cubic-bezier(0.45, 0, 0.3, 1)';
/** The run eases to a stop a few strides on: no bobbing head at the landing. */
const RUN_STOP_FRAMES = 3;
const RUN_STOP_MS = 480;
const RUN_STOP_EASE = 'cubic-bezier(0.25, 0.6, 0.4, 1)';
/** The landing crossfade with the real logo (matches #boot.boot-landed in index.html). */
const LANDING_MS = 180;

/** MinkRunner's sheet: 11 frames of 81x44 sprite px, 770ms a cycle. */
const FRAME_W = 81;
const FRAME_H = 44;
const FRAME_COUNT = 11;
const CYCLE_MS = 770;
/** Each frame's eye centre (sprite px). The head bobs as it runs. */
const FRAME_EYES: ReadonlyArray<readonly [number, number]> = [
  [70, 14.5], [70, 14.5], [69, 9.5], [67, 9.5], [70, 9.5], [70, 9],
  [70.5, 6], [72, 9], [71, 16], [71, 19], [70.5, 16],
];
/** The header logo (public/astrid-favicon.svg) is the mink's head and neck on a 16px grid,
 *  eye centred at (10, 5); its head is drawn at about 1.45 sprite px per logo px. */
const LOGO_GRID = 16;
const LOGO_EYE: readonly [number, number] = [10, 5];
const SPRITE_PX_PER_LOGO_PX = 1.45;
/** The body wipe (index.html .boot-mink-wipe): its edge runs at 30deg, and ends this many
 *  sprite px before the eye's projection, just under the head. */
const WIPE_DIRECTION: readonly [number, number] = [Math.sin(Math.PI / 6), -Math.cos(Math.PI / 6)];
const WIPE_END_BEFORE_EYE = 7;
/** Where the CSS stops sit: the edge's centre starts 45 sprite px before the gradient line's
 *  midpoint, so the travel is the eye's projection from the frame centre plus 45 - 7. */
const WIPE_START_BEFORE_MIDPOINT = 45;

export function releaseBootLayerWhenReady(root: HTMLElement): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  let lifted = false;
  const ready = () => root.childElementCount > 0 && root.querySelector('[data-boot-hold]') === null;
  const lift = () => {
    if (lifted) return;
    lifted = true;
    observer.disconnect();
    requestAnimationFrame(() => {
      const target = root.querySelector<HTMLElement>('[data-boot-mink-target]');
      const sameMark = root.querySelector<HTMLElement>('[data-boot-mink-continue]');
      if (sameMark && minkIsFullyShowing(boot)) continueMink(boot, sameMark);
      else if (target && minkIsShowing(boot) && !prefersReducedMotion()) flyMinkHome(boot, target);
      else fadeOut(boot);
    });
  };
  const observer = new MutationObserver(() => {
    if (ready()) lift();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-boot-hold'] });
  if (ready()) lift();
}

function minkIsShowing(boot: HTMLElement): boolean {
  const mink = boot.querySelector<HTMLElement>('.boot-mink');
  return Boolean(mink) && Number(getComputedStyle(mink!).opacity) > 0.05;
}

/** Fully in: a mink still fading in has nothing to hand over, and the paper dissolving over the page reveals the mark. */
function minkIsFullyShowing(boot: HTMLElement): boolean {
  const mink = boot.querySelector<HTMLElement>('.boot-mink');
  return Boolean(mink) && Number(getComputedStyle(mink!).opacity) >= 0.99;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The page draws the same mink where the boot mink stands, so hand the stride over: start the page's sprite and ground
 * as far into their cycles as the boot strip is (a negative delay), and drop the boot layer in the same frame.
 */
function continueMink(boot: HTMLElement, mark: HTMLElement): void {
  const strip = boot.querySelector<HTMLElement>('.boot-mink-strip');
  const run = strip && typeof strip.getAnimations === 'function' ? strip.getAnimations()[0] : undefined;
  if (run) {
    const phase = (Number(run.currentTime) || 0) % CYCLE_MS;
    for (const part of mark.querySelectorAll<HTMLElement>('.astrid-mink-runner-sprite, .astrid-mink-runner-ground > span')) {
      part.style.animationDelay = `${-phase}ms`;
      // Already running from its own start: restart it so the delay is where it begins, in this frame.
      part.style.animationName = 'none';
      void part.offsetWidth;
      part.style.animationName = '';
    }
  }
  boot.remove();
}

function fadeOut(boot: HTMLElement): void {
  const paper = boot.querySelector<HTMLElement>('.boot-paper');
  if (!paper) {
    boot.remove();
    return;
  }
  // The mink's own transitions bubble here too; only the paper's end removes the layer.
  boot.addEventListener('transitionend', (event) => {
    if (event.target === paper) boot.remove();
  });
  boot.classList.add('boot-done');
  // Reduced motion turns the transitions off, so no transitionend arrives.
  if (getComputedStyle(paper).transitionDuration === '0s') boot.remove();
}

function flyMinkHome(boot: HTMLElement, target: HTMLElement): void {
  const mink = boot.querySelector<HTMLElement>('.boot-mink');
  const flightY = boot.querySelector<HTMLElement>('.boot-mink-flight-y');
  const flightX = boot.querySelector<HTMLElement>('.boot-mink-flight-x');
  const wipe = boot.querySelector<HTMLElement>('.boot-mink-wipe');
  const unwipe = boot.querySelector<HTMLElement>('.boot-mink-unwipe');
  const strip = boot.querySelector<HTMLElement>('.boot-mink-strip');
  if (!mink || !flightY || !flightX || !wipe || !unwipe || !strip) {
    fadeOut(boot);
    return;
  }
  const from = flightX.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const px = from.width / FRAME_W; // CSS px per sprite px

  // Ease the run to a stop a few frames on, so the landing frame (and its eye) is known now.
  const run = typeof strip.getAnimations === 'function' ? strip.getAnimations()[0] : undefined;
  let endFrame = 0;
  if (run && typeof strip.animate === 'function') {
    const startFrame = Math.floor(((Number(run.currentTime) || 0) % CYCLE_MS) / (CYCLE_MS / FRAME_COUNT));
    endFrame = startFrame + RUN_STOP_FRAMES;
    strip.animate([
      { transform: `translateX(${-startFrame * FRAME_W * px}px)`, easing: `steps(${RUN_STOP_FRAMES}, end)` },
      { transform: `translateX(${-endFrame * FRAME_W * px}px)` },
    ], { duration: RUN_STOP_MS, easing: RUN_STOP_EASE, fill: 'forwards' });
    run.cancel();
  }
  const [eyeX, eyeY] = FRAME_EYES[endFrame % FRAME_COUNT];

  // FLIP: the landing frame's eye onto the logo's eye, the head at the logo's head size.
  const logoPx = to.width / LOGO_GRID;
  const scale = logoPx / (SPRITE_PX_PER_LOGO_PX * px);
  const centreX = from.width / 2;
  const centreY = from.height / 2;
  const dx = to.left + LOGO_EYE[0] * logoPx - (from.left + centreX + scale * (eyeX * px - centreX));
  const dy = to.top + LOGO_EYE[1] * logoPx - (from.top + centreY + scale * (eyeY * px - centreY));

  // The body wipe: the masked layer travels up the gradient while its content travels back
  // down by the same distance, so the feathered edge sweeps up the mink and stops just under
  // the landing frame's eye.
  const eyeProjection = (eyeX - FRAME_W / 2) * WIPE_DIRECTION[0] + (eyeY - FRAME_H / 2) * WIPE_DIRECTION[1];
  const travel = (eyeProjection + WIPE_START_BEFORE_MIDPOINT - WIPE_END_BEFORE_EYE) * px;
  const [ux, uy] = WIPE_DIRECTION;

  const land = () => {
    target.style.transition = `opacity ${LANDING_MS}ms ease-out`;
    target.style.opacity = '';
    mink.addEventListener('transitionend', (event) => {
      if (event.target !== mink || event.propertyName !== 'opacity') return;
      boot.remove();
      target.style.transition = '';
    });
    boot.classList.add('boot-landed');
  };

  // The real logo waits, hidden, for the head to arrive on its pixels.
  target.style.opacity = '0';
  flightY.style.transition = `transform ${FLIGHT_MS}ms ${FLIGHT_Y_EASE}`;
  flightX.style.transition = `transform ${FLIGHT_MS}ms ${FLIGHT_X_EASE}`;
  wipe.style.transition = `transform ${FLIGHT_MS}ms ${WIPE_EASE}`;
  unwipe.style.transition = `transform ${FLIGHT_MS}ms ${WIPE_EASE}`;
  flightX.addEventListener('transitionend', (event) => {
    if (event.target === flightX && event.propertyName === 'transform') land();
  });
  boot.classList.add('boot-flying');
  flightY.style.transform = `translateY(${dy}px)`;
  flightX.style.transform = `translateX(${dx}px) scale(${scale})`;
  wipe.style.transform = `translate(${ux * travel}px, ${uy * travel}px)`;
  unwipe.style.transform = `translate(${-ux * travel}px, ${-uy * travel}px)`;
  // Already home (no distance to travel): no transition will run, so land now.
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.01) land();
}
