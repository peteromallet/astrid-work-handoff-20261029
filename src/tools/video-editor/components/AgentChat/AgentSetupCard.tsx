import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, Search, Terminal } from 'lucide-react';
import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import { isAgentSetupError } from '@/integrations/astrid/acpRoutes.ts';
import { BridgeRouteError } from '@/integrations/astrid/transport.ts';
import { AGENT_CHAT_COPY as copy, AGENT_INTEGRATION_PROMPT } from '@/integrations/astrid/chatCopy.ts';
import { LOCAL_AGENT_IDS, type LocalAgentChoice, type LocalAgentId } from '@/integrations/astrid/localAgents.ts';
import { CopyFallback, useCopyAction } from '@/shared/components/RuntimeConnection/CopyInstallCommand.tsx';
import { Button } from '@/shared/components/ui/button.tsx';
import { Input } from '@/shared/components/ui/input.tsx';
import { AgentIcon, agentNames, isAgentUsable } from './agentIdentity';
import { CommandLine, CommandStep } from './CommandLine';
import { readNewChatChoice, rememberNewChatChoice } from './newChatThinkingSelection';
import { AstridOpenRouterKeyForm } from './AstridOpenRouterKeyForm';

// The model catalog is separate from the shared key entry form and can take longer than a read.
const client = new AstridLocalClient({ projectSlug: 'astrid-acp', timeoutMs: 120_000 });
// ACP model ids are provider/model selectors; the catalog lists bare ids per provider.
const selectorOf = (providerId: string, modelId: string) => `${providerId}/${modelId}`;
const setupName = (agent: LocalAgentId) => agent === 'astrid' ? copy.astridAgent : agentNames[agent];
const setupState = (agent: LocalAgentChoice | undefined) => JSON.stringify([agent?.state, agent?.signIn, agent?.steps?.map(({ kind, command, label }) => [kind, command, label])]);
const SETUP_CHOICES = [...LOCAL_AGENT_IDS, 'other'] as const;
type SetupChoice = typeof SETUP_CHOICES[number];

type Props = {
  agents: LocalAgentChoice[];
  defaultAgent: LocalAgentId;
  initialAgent?: LocalAgentId;
  initialError?: unknown;
  refetchAgents: (options?: { cancelRefetch: boolean }) => Promise<unknown> | unknown;
  startChatWith: (agent: LocalAgentId, model?: string, isCurrent?: () => boolean) => Promise<{ error?: unknown; sessionId?: string | null } | void>;
  onSetup?: (agent: LocalAgentId) => void;
  onComplete: (agent: LocalAgentId, sessionId?: string | null) => void;
};

function status(agent: LocalAgentChoice | undefined, id: LocalAgentId) {
  if (id === 'astrid' && (!isAgentUsable(agent) || agent?.signIn === 'unknown')) return copy.setUp;
  if (agent?.state === 'not-installed') return copy.notInstalled;
  if (agent?.state === 'sign-in' || agent?.signIn === 'signed-out') return copy.signIn;
  return isAgentUsable(agent) ? agent?.signIn === 'unknown' ? copy.checkSignIn : copy.ready : copy.setUp;
}

/** Inline setup owns its steps; AgentChat owns session creation and recovery. */
export function AgentSetupCard({ agents, defaultAgent, initialAgent, initialError, refetchAgents, startChatWith, onSetup, onComplete }: Props) {
  const refreshAgents = useCallback(() => refetchAgents({ cancelRefetch: false }), [refetchAgents]);
  const [selected, setSelected] = useState<LocalAgentId>(() => {
    const last = readNewChatChoice()?.agent ?? defaultAgent;
    return initialAgent ?? (isAgentUsable(agents.find(agent => agent.id === last)) ? last
      : LOCAL_AGENT_IDS.find(id => id !== 'astrid' && agents.some(agent => agent.id === id && agent.signIn === 'signed-in')) ?? 'astrid');
  });
  const [otherSelected, setOtherSelected] = useState(false);
  const selectedChoice = otherSelected ? 'other' : selected;
  const [step, setStep] = useState<'choose' | 'setup' | 'starting' | 'failed' | 'other'>(initialAgent ? 'setup' : 'choose');
  const integrationCopy = useCopyAction(AGENT_INTEGRATION_PROMPT);
  const [agentFailure, setAgentFailure] = useState({ agent: initialAgent ?? selected, error: initialError });
  const failure = agentFailure.agent === selected ? agentFailure.error : null;
  const [failedRow, setFailedRow] = useState(() => initialError ? { id: initialAgent, state: setupState(agents.find(row => row.id === initialAgent)) } : null);
  const [showStartingBack, setShowStartingBack] = useState(false);
  const [search, setSearch] = useState('');
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  const rows = useRef<Partial<Record<SetupChoice, HTMLDivElement | null>>>({});
  const inFlight = useRef(false);
  const attempt = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!initialAgent || inFlight.current) return;
    setSelected(initialAgent);
    setOtherSelected(false);
    if (initialError) {
      setAgentFailure({ agent: initialAgent, error: initialError });
      setFailedRow({ id: initialAgent, state: setupState(agents.find(row => row.id === initialAgent)) });
    }
    setStep(isAgentSetupError(initialError) === 'agent_runtime_missing' ? 'failed' : 'setup');
  }, [initialAgent, initialError]);
  const agent = agents.find(row => row.id === selected);
  const currentAgent = useRef(agent);
  currentAgent.current = agent;
  const canAdvance = failedRow?.id !== selected || failedRow.state !== setupState(agent);
  const models = useQuery({
    queryKey: ['agent-setup-models'], queryFn: () => client.acp.models(),
    enabled: step === 'setup' && selected === 'astrid', retry: false,
    refetchInterval: step === 'setup' && selected === 'astrid' ? 3000 : false,
    refetchOnWindowFocus: true,
  });
  const begin = useCallback(async (model?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const request = ++attempt.current;
    const isCurrent = () => mounted.current && request === attempt.current;
    setStep('starting');
    setAgentFailure({ agent: selected, error: null });
    try {
      const result = await startChatWith(selected, model, isCurrent);
      if (!isCurrent()) return;
      if (result?.error) throw result.error;
      await refreshAgents();
      if (!isCurrent()) return;
      rememberNewChatChoice({ agent: selected, ...(model ? { model } : {}) });
      onComplete(selected, result?.sessionId);
    } catch (error) {
      if (!isCurrent()) return;
      setAgentFailure({ agent: selected, error });
      setFailedRow({ id: selected, state: setupState(currentAgent.current) });
      if (isAgentSetupError(error) && isAgentSetupError(error) !== 'agent_runtime_missing') {
        setStep('setup');
        void refreshAgents();
        if (selected === 'astrid') void models.refetch();
      } else setStep('failed');
    } finally { inFlight.current = false; }
  }, [models.refetch, onComplete, refreshAgents, selected, startChatWith]);

  const back = () => {
    attempt.current += 1;
    setStep('choose');
  };
  useEffect(() => {
    setShowStartingBack(false);
    if (step !== 'starting') return;
    const timer = window.setTimeout(() => setShowStartingBack(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (step === 'choose') rows.current[selectedChoice]?.focus({ preventScroll: true });
  }, [step, selectedChoice]);
  // A new step moves focus to its heading, so keyboard and screen reader users land on what changed.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    if (step !== 'choose') headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (step !== 'setup') return;
    const refresh = () => { void refreshAgents(); };
    const focus = () => { refresh(); if (selected === 'astrid') void models.refetch(); };
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('focus', focus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [models.refetch, refreshAgents, selected, step]);
  useEffect(() => {
    if (failedRow?.id === selected && failedRow.state !== setupState(agent)) setFailedRow(null);
  }, [agent, failedRow, selected]);
  useEffect(() => {
    if (step === 'setup' && selected !== 'astrid' && canAdvance && isAgentUsable(agent)) void begin();
  }, [agent, begin, canAdvance, selected, step]);

  const providers = [...(models.data?.providers ?? [])].sort((a, b) => Number(b.signedIn) - Number(a.signedIn));
  const hasModels = providers.some(provider => provider.signedIn && provider.models.length > 0);
  const openRouterKeySaved = Boolean(models.data?.providers.some(provider => provider.id === 'openrouter' && provider.signedIn));
  const availableModels = providers.filter(provider => provider.signedIn)
    .flatMap(provider => provider.models.filter(item => `${provider.name} ${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()))
      .map(item => ({ ...item, selector: selectorOf(provider.id, item.id) })));
  const modelId = chosenModel && availableModels.some(model => model.selector === chosenModel) ? chosenModel
    : (!chosenModel ? availableModels.find(model => model.selector === models.data?.currentModel)?.selector : undefined) ?? availableModels[0]?.selector;
  const model = availableModels.find(model => model.selector === modelId);
  const setupError = isAgentSetupError(failure);
  const steps = agent?.steps?.length ? agent.steps.filter(item => agent.state === 'not-installed' || item.kind === 'sign-in') : [];
  const commandRows = failure instanceof BridgeRouteError && failure.nextAction ? [{ command: failure.nextAction, label: copy.setUp }] : steps;
  const instructions = (caption = true) => commandRows.length ? <div className="space-y-2">
    {caption && <p className="text-xs text-muted-foreground">{copy.runInTerminal}</p>}
    <ol className="space-y-2">
      {commandRows.map((item, index) => <li key={index} className="flex min-w-0 items-start gap-2">
        {commandRows.length > 1 && <span aria-hidden="true" className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>}
        <div className="min-w-0 flex-1"><CommandStep {...item} /></div>
      </li>)}
    </ol>
  </div> : agent?.line ? <p className="text-sm"><CommandLine line={agent.line} /></p> : null;
  const waiting = (text: string) => <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" />{text}</p>;
  const alertBox = (text: string) => <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-ink-danger">{text}</p>;
  const errorMessage = failure instanceof BridgeRouteError ? failure.code === 'acp_process_exited' ? copy.agentStopped(setupName(selected)) : failure.detail
    : failure instanceof Error ? failure.message : failure ? String(failure) : null;
  const credit = (row: LocalAgentChoice | undefined, inRow = false) => row?.creditLine ? <span className="block text-[11px] leading-4 text-muted-foreground">
    {row.creditUrl ? <a href={row.creditUrl} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground"
      {...(inRow ? { onClick: (event: React.MouseEvent) => event.stopPropagation(), onKeyDown: (event: React.KeyboardEvent) => event.stopPropagation() } : {})}>{row.creditLine}</a> : row.creditLine}
  </span> : null;
  const selectChoice = (id: SetupChoice) => { setOtherSelected(id === 'other'); if (id !== 'other') setSelected(id); };
  const pick = (id: SetupChoice) => {
    selectChoice(id);
    if (id === 'other') setStep('other');
    else { setStep('setup'); onSetup?.(id); }
  };

  return <section aria-label={copy.setupTitle} className="@container space-y-3 rounded-xl border border-border/70 bg-card p-3 text-sm shadow-sm">
    {step === 'choose' ? <>
      <div className="space-y-0.5 px-0.5">
        <h2 ref={headingRef} tabIndex={-1} className="text-base leading-snug outline-none">{copy.setupTitle}</h2>
        <p className="text-xs text-muted-foreground">{copy.setupHint}</p>
      </div>
      <div role="listbox" aria-label={copy.setupTitle} className="-mx-1 space-y-0.5">
        {SETUP_CHOICES.map((id, index) => {
          const row = agents.find(item => item.id === id);
          const label = id === 'other' ? null : status(row, id);
          return <div key={id} ref={node => { rows.current[id] = node; }} role="option" aria-selected={selectedChoice === id} tabIndex={selectedChoice === id ? 0 : -1}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-muted [@media(pointer:coarse)]:min-h-11"
            onFocus={() => selectChoice(id)} onClick={() => pick(id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(id); return; }
              const next = event.key === 'ArrowDown' ? (index + 1) % SETUP_CHOICES.length : event.key === 'ArrowUp' ? (index + SETUP_CHOICES.length - 1) % SETUP_CHOICES.length : event.key === 'Home' ? 0 : event.key === 'End' ? SETUP_CHOICES.length - 1 : null;
              if (next !== null) { event.preventDefault(); selectChoice(SETUP_CHOICES[next]); }
            }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background">{id === 'other' ? <Terminal aria-hidden="true" className="h-4 w-4" /> : <AgentIcon agent={id} className="h-4 w-4" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block leading-5">{id === 'other' ? copy.anotherAgent : setupName(id)}</span>
              <span className="block text-xs leading-4 text-muted-foreground">{id === 'other' ? copy.anotherAgentSubtitle : id === 'astrid' ? copy.astridSubtitle : copy.computerSubtitle(agentNames[id])}</span>
              {id === 'astrid' && credit(row, true)}
            </span>
            {label && <StatusBadge label={label} ready={label === copy.ready} />}
          </div>;
        })}
      </div>
    </> : step === 'other' ? <>
      <BackButton onClick={back} />
      <div className="space-y-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-base leading-snug outline-none">{copy.anotherAgentTerminal}</h2>
        <p className="text-xs text-muted-foreground">{copy.anotherAgentTerminalHint}</p>
        <CommandStep command={copy.anotherAgentInstruction(agents.find(row => row.id === 'astrid')?.terminal?.command || 'astrid')} label={copy.copyAgentInstruction} />
      </div>
      <div className="space-y-2 border-t border-border/70 pt-3">
        <h3 className="text-base leading-snug">{copy.anotherAgentIntegration}</h3>
        <p className="text-xs text-muted-foreground">{copy.anotherAgentIntegrationHint}</p>
        <Button type="button" className="h-auto min-h-9 w-full gap-2 whitespace-normal py-2 text-left" onClick={() => void integrationCopy.copy()}>
          {integrationCopy.status === 'copied' ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : <Copy aria-hidden="true" className="h-4 w-4 shrink-0" />}
          <span aria-live="polite">{integrationCopy.status === 'copied' ? copy.integrationPromptCopied : copy.copyIntegrationPrompt}</span>
        </Button>
        {integrationCopy.status === 'failed' && <CopyFallback text={AGENT_INTEGRATION_PROMPT} label={copy.copyIntegrationPrompt} />}
      </div>
    </> : step === 'starting' ? <>
      <div role="status" aria-live="polite" className="flex items-center gap-2.5">
        <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
        <h2 ref={headingRef} tabIndex={-1} className="text-base leading-snug outline-none">{copy.gettingReady(setupName(selected))}</h2>
      </div>
      <p className="text-xs text-muted-foreground">{copy.firstTime}</p>
      {showStartingBack && <BackButton onClick={back} />}
    </> : <>
      <div className="space-y-2">
        <BackButton onClick={back} />
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background"><AgentIcon agent={selected} className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 ref={headingRef} tabIndex={-1} className="text-base leading-tight outline-none">{setupName(selected)}</h2>
            {selected === 'astrid' && credit(agent)}
          </div>
        </div>
      </div>
      {errorMessage && alertBox(errorMessage)}
      {setupError && (selected === 'astrid' || step === 'failed') && instructions()}
      {step === 'failed' ? <Button className="w-full" onClick={() => void begin(selected === 'astrid' ? modelId : undefined)}>{copy.tryAgain}</Button>
        : selected !== 'astrid' ? <>
          {instructions()}
          <div className="space-y-0.5 rounded-lg bg-muted/50 px-3 py-2">
            {waiting(agent?.state === 'not-installed' && setupError !== 'agent_sign_in_required' ? copy.waitingForAgent(agentNames[selected]) : copy.waitingForSignIn)}
            <p className="pl-[1.375rem] text-xs text-muted-foreground">{copy.movesOnByItself}</p>
          </div>
        </>
        : models.isLoading ? waiting(copy.loadingModels)
        : hasModels ? <>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" aria-label={copy.searchModels} value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.searchModels} className="h-9 pl-8 text-sm focus-visible:ring-offset-0 [@media(pointer:coarse)]:h-11" />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1">
            {providers.map(provider => {
              const matches = provider.models.filter(item => `${provider.name} ${item.name} ${item.id}`.toLowerCase().includes(search.toLowerCase()));
              return matches.length ? <fieldset key={provider.id} disabled={!provider.signedIn} className="disabled:opacity-60">
                <legend className="px-2 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{provider.name}</legend>
                {matches.map(item => { const selector = selectorOf(provider.id, item.id); return <label key={selector} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/70 has-[:checked]:bg-muted has-[:disabled]:cursor-not-allowed [@media(pointer:coarse)]:min-h-11">
                  <input type="radio" name="setup-model" value={selector} checked={modelId === selector} onChange={() => setChosenModel(selector)} className="h-4 w-4 shrink-0 accent-primary" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{item.name}</span>
                </label>; })}
              </fieldset> : null;
            })}
          </div>
          <Button className="w-full" disabled={!model} onClick={() => void begin(modelId)}><span className="truncate">{copy.useModel(model?.name ?? '')}</span></Button>
        </> : <>
          {models.error && alertBox(copy.modelsFailed)}
          <p>{copy.openRouterRecommendation}</p>
          <AstridOpenRouterKeyForm keySaved={openRouterKeySaved} onSaved={async () => {
            setChosenModel(null);
            await Promise.all([models.refetch(), refreshAgents()]);
          }} />
          <details className="group rounded-lg border border-border/70">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11 [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" />{copy.alternativeSignIn}
            </summary>
            <div className="space-y-2.5 px-3 pb-3">
              <p className="text-xs">{copy.alternativeInstruction}</p>
              {!setupError && instructions(false)}
              {waiting(copy.waitingForSignIn)}
            </div>
          </details>
        </>}
    </>}
  </section>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <Button type="button" variant="ghost" size="sm" onClick={onClick}
    className="-ml-2 h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11">
    <ChevronLeft aria-hidden="true" />{copy.back}
  </Button>;
}

function StatusBadge({ label, ready }: { label: string; ready: boolean }) {
  return <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] leading-4 ${ready ? 'bg-primary/10 text-primary' : 'border border-border/80 text-muted-foreground'}`}>
    {ready && <Check aria-hidden="true" className="h-3 w-3" />}{label}
  </span>;
}
