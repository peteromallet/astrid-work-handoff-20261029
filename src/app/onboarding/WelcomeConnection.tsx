import { RuntimeConnectionProvider, RuntimeConnectionGate } from '@/integrations/runtime/RuntimeConnectionProvider.tsx';
import { runtimeOrigin } from '@/integrations/runtime/connection.ts';
import { requiresLocalNetworkPermission } from '@/integrations/runtime/localNetworkPermission.ts';
import { RuntimeConnectionPanel } from '@/shared/components/RuntimeConnection/RuntimeConnectionPanel.tsx';
import { StarterProjectHandoff } from './StarterProjectHandoff.tsx';
import { completeWelcome } from './welcomeProgress.ts';

export default function WelcomeConnection({ onBack }: { readonly onBack: () => void }) {
  // The durable welcome phase is the handoff into a new app window and across reloads. Its gate is armed in this
  // window; a sessionStorage flag from the installing tab cannot follow the app into its own window.
  const runtime = runtimeOrigin();
  const hosted = runtime !== '';
  const needsLocalNetworkPermission = requiresLocalNetworkPermission(runtime, typeof window === 'undefined' ? '' : window.location.origin);
  return <RuntimeConnectionProvider gated requireLocalNetworkPermission={needsLocalNetworkPermission}><RuntimeConnectionGate connectOnEntry={hosted}
    panel={(connection, exit) => <RuntimeConnectionPanel connection={connection} exit={exit} onBack={exit ? undefined : onBack} />}>
    <StarterProjectHandoff onContinueWithoutProject={() => window.location.replace(completeWelcome())} onReady={selection => window.location.replace(completeWelcome(selection))} />
  </RuntimeConnectionGate></RuntimeConnectionProvider>;
}
