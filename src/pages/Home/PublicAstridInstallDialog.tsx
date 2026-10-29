import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Monitor, X } from 'lucide-react';
import {
  APP_ENTRY_PATH,
  isRunningInstalled,
  rememberAppEntryPreference,
} from '@/app/entryClassification.ts';
import { requestAutoConnect } from '@/integrations/runtime/autoConnectRequest.ts';
import { runInstallPrompt, useInstallPromptSignals } from '@/shared/hooks/platformInstall/signals';
import { detectBrowser, detectPlatform } from '@/shared/hooks/platformInstall/platformDetection';
import { detectInstallScenario, type InstallScenario } from './installScenario.ts';
import { ToolbarPointer } from '@/shared/components/ToolbarPointer/ToolbarPointer.tsx';
import './PublicAstridInstallDialog.css';

const AVATAR_SRC = '/astrid-app-icon-192.png';

/** Landing page wording is kept together here for the product copy pass. */
export const SET_UP_ASTRID_COPY = {
  title: 'Set up Astrid',
  appTitle: 'Get the Astrid app',
  appSubtitle: 'Install Astrid so it opens in its own window, or use it right here in the browser.',
  installNow: 'Install Astrid',
  installDone: 'Done — continue',
  useBrowser: 'Use it in the browser',
  installedTitle: 'Astrid is installed',
  installedSubtitle: 'It opens in its own window.',
  openHere: 'Open here instead',
};

function useInstallScenario(): InstallScenario {
  return useMemo(detectInstallScenario, []);
}

function useBrowserInstall(active: boolean) {
  const { deferredPrompt, isAppInstalled, consumeDeferredPrompt } = useInstallPromptSignals();
  const activeRef = useRef(active);
  const requestRef = useRef(0);

  useEffect(() => {
    activeRef.current = active;
    if (!active) requestRef.current += 1;
  }, [active]);

  useEffect(() => () => {
    activeRef.current = false;
    requestRef.current += 1;
  }, []);

  // Installing from anywhere (the address bar included, not just this dialog) sends later visits
  // straight into the app.
  useEffect(() => {
    if (isAppInstalled) rememberAppEntryPreference();
  }, [isAppInstalled]);

  const promptInstall = useCallback(async () => {
    if (!activeRef.current || !deferredPrompt) return false;
    const promptEvent = deferredPrompt;
    const request = ++requestRef.current;
    try {
      const { outcome } = await runInstallPrompt(promptEvent);
      if (!activeRef.current || request !== requestRef.current || !consumeDeferredPrompt(promptEvent)) return false;
      if (outcome === 'accepted') rememberAppEntryPreference();
      return outcome === 'accepted';
    } catch {
      if (activeRef.current && request === requestRef.current) consumeDeferredPrompt(promptEvent);
      return false;
    }
  }, [consumeDeferredPrompt, deferredPrompt]);

  return { canPrompt: Boolean(deferredPrompt), installed: isAppInstalled, promptInstall };
}

function openInBrowser() {
  rememberAppEntryPreference();
  // Choosing the browser already says "take me in": the app goes straight to Chrome's prompt instead of explaining it first.
  requestAutoConnect();
  window.location.assign(APP_ENTRY_PATH);
}

/** A little window mock: the address bar's install icon pulses, is clicked, and offers Install. */
function ChromiumVisual() {
  return (
    <div className="astrid-install-visual" data-scenario="chromium" aria-hidden="true">
      <div className="astrid-install-window">
        <div className="astrid-install-toolbar">
          <span className="astrid-install-lights"><i /><i /><i /></span>
          <span className="astrid-install-omnibox">
            <span className="astrid-install-url">astrid</span>
            <span className="astrid-install-target astrid-install-target-chromium">
              <Monitor size={11} strokeWidth={2.2} />
              <ArrowRight className="astrid-install-target-arrow" size={7} strokeWidth={3} />
            </span>
          </span>
          <span className="astrid-install-menu"><i /><i /><i /></span>
        </div>
        <div className="astrid-install-page"><i /><i /><i /></div>
        <div className="astrid-install-popover">
          <span className="astrid-install-popover-title">Install app?</span>
          <span className="astrid-install-popover-app">
            <img src={AVATAR_SRC} alt="" />
            <span>Astrid</span>
          </span>
          <span className="astrid-install-popover-actions">
            <span>Cancel</span>
            <span className="astrid-install-popover-confirm">Install</span>
          </span>
        </div>
        <span className="astrid-install-cursor" />
      </div>
    </div>
  );
}

/** Where an installed app lives on this computer. */
function appHome(): string {
  const platform = detectPlatform();
  return platform === 'windows' ? 'your taskbar' : platform === 'linux' ? 'your app launcher' : 'your dock';
}

function desktopCopy(scenario: Exclude<InstallScenario, 'mobile'>): { lede: string; steps: string[] } {
  if (scenario === 'chromium') {
    return {
      lede: `Astrid installs straight from your browser, into its own window and ${appHome()}.`,
      steps: ['Click the install icon at the right end of the address bar, up here.', 'Choose Install.'],
    };
  }
  // Safari blocks an https page from reaching Astrid on this computer (checked with WebKit), so it can't be used here at all.
  if (detectBrowser() === 'safari') return { lede: 'Astrid needs Chrome or Edge to reach your computer. Open this page there.', steps: [] };
  return { lede: 'This browser can’t install web apps. Open this page in Chrome or Edge to install Astrid, or use it right here.', steps: [] };
}

const MOBILE_COPY = {
  ios: { lede: 'Put Astrid on your home screen.', steps: ['Tap the Share button in Safari.', 'Choose Add to Home Screen.'] },
  other: { lede: 'Put Astrid on your home screen.', steps: ['Open your browser’s menu.', 'Choose Install app or Add to Home screen.'] },
};

/**
 * The landing page's install flow: a visual explainer for installing Astrid as an app from the
 * browser, anchored in the top-right corner where the browser's install control lives, with the
 * option to use it right here instead. Either choice makes the site open straight into the app on
 * later visits; /home keeps the landing page.
 */
const FOCUSABLE_CONTROL = 'button, a[href], input, select, textarea, [role="button"]';

export function PublicAstridInstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lastActivatedRef = useRef<HTMLElement | null>(null);
  const closeNotifiedRef = useRef(true);
  const onCloseRef = useRef(onClose);
  const scenario = useInstallScenario();
  const { canPrompt, installed, promptInstall } = useBrowserInstall(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Safari (macOS and iOS) does not focus a button when it is clicked or tapped: `document.activeElement` is the
  // body, or the nearest focusable ancestor (here `main`), when the dialog opens, and focus would return there.
  // The control that was activated is the opener either way.
  useEffect(() => {
    const remember = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(FOCUSABLE_CONTROL) : null;
      lastActivatedRef.current = target;
    };
    document.addEventListener('click', remember, true);
    return () => document.removeEventListener('click', remember, true);
  }, []);

  const restoreFocus = useCallback(() => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (!target || !target.isConnected || target.hasAttribute('disabled') || target.closest('[inert], [aria-hidden="true"]')) return;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }, []);

  const notifyClosed = useCallback(() => {
    if (closeNotifiedRef.current) return;
    closeNotifiedRef.current = true;
    onCloseRef.current();
    restoreFocus();
  }, [restoreFocus]);

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    notifyClosed();
  }, [notifyClosed]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const focused = document.activeElement;
      const focusedControl = focused instanceof HTMLElement && focused.matches(FOCUSABLE_CONTROL) ? focused : null;
      const activated = lastActivatedRef.current?.isConnected ? lastActivatedRef.current : null;
      lastActivatedRef.current = null;
      const opener = focusedControl ?? activated ?? (focused instanceof HTMLElement && focused !== document.body ? focused : null);
      if (opener && !dialog.contains(opener)) returnFocusRef.current = opener;
      closeNotifiedRef.current = false;
      dialog.showModal();
      closeButtonRef.current?.focus({ preventScroll: true });
    } else if (!open) {
      if (dialog.open) dialog.close();
      notifyClosed();
    }
  }, [notifyClosed, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
      notifyClosed();
    };
  }, [notifyClosed]);

  const desktop = scenario !== 'mobile';
  const copy = desktop ? desktopCopy(scenario) : null;
  const needsChrome = scenario === 'unsupported' && detectBrowser() === 'safari';
  const pointsUp = scenario === 'chromium';
  const [step, setStep] = useState<'app' | 'installed'>('app');
  const skipApp = installed || (open && isRunningInstalled());
  useEffect(() => {
    // Each opening starts at the app step, unless Astrid is already installed here.
    if (open) setStep(skipApp ? 'installed' : 'app');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (skipApp) setStep('installed');
  }, [skipApp]);
  const showApp = step === 'app' && !skipApp;
  const mobileCopy = !desktop
    ? (/iPhone|iPad|iPod/.test(navigator.userAgent) ? MOBILE_COPY.ios : MOBILE_COPY.other)
    : null;
  const guide = copy ?? mobileCopy;
  const onInstall = async () => {
    if (await promptInstall()) setStep('installed');
  };
  return (
    <dialog
      ref={dialogRef}
      className="astrid-install-dialog"
      data-scenario={scenario}
      data-points-up={showApp && !canPrompt && pointsUp && !installed ? '' : undefined}
      aria-labelledby="astrid-install-title"
      aria-modal="true"
      onClose={notifyClosed}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside its card) dismisses it.
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div className="astrid-install-card">
        {open && showApp && !canPrompt && pointsUp && !installed ? (
          <ToolbarPointer label="Up here" />
        ) : null}
        <button ref={closeButtonRef} type="button" className="astrid-install-close" onClick={requestClose} aria-label="Close">
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <header className="astrid-install-header">
          <img className="astrid-install-avatar" src={AVATAR_SRC} alt="" />
          <div>
            <h2 id="astrid-install-title">{showApp ? SET_UP_ASTRID_COPY.appTitle : SET_UP_ASTRID_COPY.installedTitle}</h2>
            <p>{showApp ? SET_UP_ASTRID_COPY.appSubtitle : SET_UP_ASTRID_COPY.installedSubtitle}</p>
          </div>
        </header>

        {showApp && guide ? (
          <>
            {canPrompt ? null : (
              <div className="astrid-install-body">
                {scenario === 'chromium' ? <ChromiumVisual /> : null}
                <div>
                  <p className="astrid-install-lede">{guide.lede}</p>
                  {guide.steps.length ? <ol className="astrid-install-steps">{guide.steps.map((item) => <li key={item}>{item}</li>)}</ol> : null}
                </div>
              </div>
            )}
            <div className="astrid-install-actions">
              {canPrompt ? (
                <button type="button" className="astrid-button astrid-button-primary" onClick={onInstall}>
                  <span>{SET_UP_ASTRID_COPY.installNow}</span> <Monitor size={17} aria-hidden="true" />
                </button>
              ) : scenario !== 'unsupported' ? (
                <button type="button" className="astrid-button astrid-button-primary" onClick={openInBrowser}>
                  <span>{SET_UP_ASTRID_COPY.installDone}</span> <ArrowRight size={17} aria-hidden="true" />
                </button>
              ) : null}
              {needsChrome ? null : (
                <button type="button" className="astrid-button astrid-install-here" onClick={openInBrowser}>
                  <span>{SET_UP_ASTRID_COPY.useBrowser}</span><ArrowRight size={17} aria-hidden="true" />
                </button>
              )}
            </div>
          </>
        ) : null}

        {!showApp ? (
          <div className="astrid-install-actions">
            <button type="button" className="astrid-install-quiet" onClick={openInBrowser}>{SET_UP_ASTRID_COPY.openHere}</button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
