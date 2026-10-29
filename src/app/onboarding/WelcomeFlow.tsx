import { lazy, Suspense, useCallback, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/shared/components/ui/tooltip.tsx';
import { BrowserTourEditor } from './BrowserTourEditor.tsx';
import { EditorBackdrop } from '@/shared/components/RuntimeConnection/EditorCardLayer.tsx';
import { WelcomeRunMode, type RunMode, type WindowMode } from './WelcomeRunMode.tsx';
import { WelcomeLocalSetup } from './WelcomeLocalSetup.tsx';
import { readWelcomePhase, writeWelcomePhase, type WelcomeEntry } from './welcomeProgress.ts';
import { detectInstallScenario } from '@/pages/Home/installScenario.ts';

// Even module initialization for connection/identity stays outside the browser-only tour.
const WelcomeConnection = lazy(() => import('./WelcomeConnection.tsx'));
export function WelcomeFlow({ entry, localBuild = false }: { entry: WelcomeEntry; localBuild?: boolean }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [phase, setPhase] = useState<WelcomeEntry>(() => {
    const savedPhase = readWelcomePhase();
    // An installer handoff must not change a fully local setup into the hosted route.
    if (entry === 'connection' && savedPhase === 'local') return 'local';
    if (entry !== 'editor' && savedPhase !== 'complete') writeWelcomePhase(entry);
    return entry;
  });
  const [windowMode, setWindowMode] = useState<WindowMode>('app-window');
  const [runMode, setRunMode] = useState<RunMode>(phase === 'local' ? 'local' : 'hosted');
  // Back from connecting returns to the tour's last card, not its welcome.
  const [tourAtEnd, setTourAtEnd] = useState(false);
  const enter = useCallback((next: 'tour' | 'choose' | 'connection' | 'local') => {
    writeWelcomePhase(next);
    setPhase(next);
  }, []);
  // A phone or local build has no run-mode choice: the tour leads straight to connecting, and Back returns to the tour.
  const skipsChoice = localBuild || detectInstallScenario() === 'mobile';
  const finishTour = useCallback(() => enter(skipsChoice ? 'connection' : 'choose'), [enter, skipsChoice]);
  return <QueryClientProvider client={queryClient}><TooltipProvider><MemoryRouter>
    {phase === 'tour' && <BrowserTourEditor onFinish={finishTour} atEnd={tourAtEnd} />}
    {phase === 'choose' && <WelcomeRunMode onContinue={enter} windowMode={windowMode} setWindowMode={setWindowMode} runMode={runMode} setRunMode={setRunMode} />}
    {phase === 'local' && <WelcomeLocalSetup onBack={() => enter('choose')} />}
    {phase === 'connection' && <Suspense fallback={<><EditorBackdrop /><p role="status" className="sr-only">Connecting to Astrid…</p></>}><WelcomeConnection onBack={() => { setTourAtEnd(skipsChoice); enter(skipsChoice ? 'tour' : 'choose'); }} /></Suspense>}
  </MemoryRouter></TooltipProvider></QueryClientProvider>;
}
