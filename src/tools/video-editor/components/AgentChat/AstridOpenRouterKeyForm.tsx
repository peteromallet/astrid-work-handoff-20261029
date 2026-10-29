import { useId, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { AstridLocalClient } from '@/integrations/astrid/client.ts';
import { AGENT_CHAT_COPY as copy } from '@/integrations/astrid/chatCopy.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Input } from '@/shared/components/ui/input.tsx';

const client = new AstridLocalClient({ projectSlug: 'astrid-acp', timeoutMs: 120_000 });

/** Shared key entry for the setup card and the New chat model panel. */
export function AstridOpenRouterKeyForm({ compact = false, keySaved = false, onSaved }: {
  compact?: boolean;
  keySaved?: boolean;
  onSaved: () => Promise<unknown> | unknown;
}) {
  const keyId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const key = input.current?.value.trim() ?? '';
    if (!key) {
      setError(copy.emptyKey);
      input.current?.focus();
      return;
    }
    input.current!.value = '';
    setSaving(true);
    setError(null);
    try {
      await client.acp.saveAstridApiKey('openrouter', key);
      await onSaved();
    } catch (cause) {
      const failure = cause as { code?: string; status?: number; detail?: string; message?: string };
      setError(failure.code === 'invalid_key' ? copy.invalidKey
        : failure.code === 'provider_unreachable' ? copy.providerUnreachable
          : failure.status === 403 || failure.status === 404 || failure.code === 'not_found' ? copy.keyServiceOutdated
            : failure.detail || failure.message || copy.keySaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
    {keySaved && <p className="text-xs text-muted-foreground">{copy.keyAlreadySaved}</p>}
    <form className="space-y-1.5" onSubmit={event => void submit(event)} onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}>
      <label htmlFor={keyId} className="block text-xs font-medium text-muted-foreground">{copy.openRouterKey}</label>
      <div className={compact ? 'flex min-w-0 gap-2' : 'flex flex-col gap-2 @[17rem]:flex-row'}>
        <div className="min-w-0 flex-1"><Input id={keyId} ref={input} type="password" placeholder={copy.openRouterPlaceholder} autoComplete="off" spellCheck={false}
          className="h-9 font-mono text-sm focus-visible:ring-offset-0 [@media(pointer:coarse)]:h-11" /></div>
        <Button type="submit" aria-disabled={saving || undefined} className="h-9 shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 [@media(pointer:coarse)]:h-11">
          {saving ? copy.connecting : compact ? copy.saveKey : copy.connect}
        </Button>
      </div>
      {saving && <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />{copy.checkingKey}</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-ink-danger">{error}</p>}
    </form>
    <div className="space-y-1 text-xs text-muted-foreground">
      <p><a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-border underline-offset-2 hover:text-foreground">{copy.getOpenRouterKey}<ExternalLink aria-hidden="true" className="h-3 w-3" /></a></p>
      <p>{copy.keyPrivacy}</p>
    </div>
  </div>;
}
