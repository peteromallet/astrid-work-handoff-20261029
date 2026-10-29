import { RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card.tsx';
import { runtimeOrigin } from '@/integrations/runtime/connection.ts';
import { RUNTIME_CONNECTION_COPY as COPY } from '@/shared/components/RuntimeConnection/copy.ts';
import { useOnAstridAnswers } from '@/shared/components/RuntimeConnection/useRuntimeRestartWatch.ts';

/**
 * Takes the timeline region's place when the timeline failed to load. A load
 * failure happens before the first render, so no error boundary can catch it —
 * this is the only thing standing between a malformed backend payload and a
 * blank editor whose badge claims `saved`.
 *
 * On the hosted build (a gateway origin is configured) the failure is almost
 * always "Astrid is not answering", and the raw message names the Runtime, the
 * workspace and the loopback address. A person gets the connection cards' words
 * inside the timeline panel's surface instead, never the message, and the load is
 * tried again by itself as soon as Astrid answers.
 */
export function TimelineLoadErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return runtimeOrigin() !== '' ? <HostedLoadErrorCard onRetry={onRetry} /> : <LoadErrorCard message={message} onRetry={onRetry} />;
}

/**
 * The timeline panel's own surface (the loaded timeline and its loading state use the same rounded card), so the
 * editor's frame stays whole and the message sits where the timeline would be. Inside it, the connection cards' words:
 * a serif heading, one sentence and one filled primary button, centred. A short panel (a narrow window) scrolls
 * rather than clipping the heading or the button.
 */
function HostedLoadErrorCard({ onRetry }: { onRetry: () => void }) {
  useOnAstridAnswers(onRetry);
  return (
    <section role="alert" className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-border bg-card/95 p-4 text-center text-card-foreground sm:p-6">
      {/* `m-auto` centres the block, and unlike `justify-center` never pushes its top out of reach when space runs short. */}
      <div className="m-auto w-full max-w-md space-y-4 sm:space-y-5">
        <div className="space-y-2 sm:space-y-3">
          <h2 className="text-balance font-serif font-theme-heading text-xl leading-tight text-foreground sm:text-2xl">{COPY.loadFailed.title}</h2>
          <p className="text-balance text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{COPY.loadFailed.sentence}</p>
        </div>
        <div className="flex flex-col items-center">
          <Button type="button" className="w-full sm:w-auto" onClick={onRetry}>{COPY.loadFailed.button}</Button>
        </div>
      </div>
    </section>
  );
}

function LoadErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-4">
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <CardTitle className="text-base">Unable to load this timeline</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The editor kept its toolbar so you can switch timelines, but there is
            nothing to edit until the timeline loads.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 gap-1.5"
            onClick={onRetry}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
