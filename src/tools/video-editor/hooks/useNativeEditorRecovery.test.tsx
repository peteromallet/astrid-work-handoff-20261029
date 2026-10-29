// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const probe = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/astrid/nativeEditorConnection.ts', () => ({assertNativeEditorConnection:probe}));
import { useNativeEditorRecovery } from './useNativeEditorRecovery.ts';
afterEach(()=>vi.useRealTimers());
describe('mounted native recovery budget',()=>{
  it('shares three automatic attempts across repeated failures and preserves manual retry after exhaustion',async()=>{
    vi.useFakeTimers();probe.mockReset().mockRejectedValue(new Error('Unavailable'));
    const recovered=vi.fn();const view=renderHook(()=>useNativeEditorRecovery({enabled:true,scope:'project/timeline',onRecovered:recovered}));
    await act(async()=>{view.result.current.reportFailure();});expect(probe).toHaveBeenCalledTimes(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(3000);});expect(probe).toHaveBeenCalledTimes(2);
    await act(async()=>{view.result.current.reportFailure();});expect(probe).toHaveBeenCalledTimes(3);
    await act(async()=>{view.result.current.reportFailure();await vi.advanceTimersByTimeAsync(15000);});
    expect(probe).toHaveBeenCalledTimes(3);expect(view.result.current.retrying).toBe(false);expect(recovered).not.toHaveBeenCalled();
    act(()=>{const token=view.result.current.beginManualAttempt();expect(view.result.current.completeRecovery(token)).toBe(true);});
    expect(recovered).toHaveBeenCalledOnce();
    await act(async()=>{view.result.current.reportFailure();});expect(probe).toHaveBeenCalledTimes(4);
    view.unmount();
  });
  it('cannot clear a different owner with an old manual or in-flight verified attempt',async()=>{
    let release!:()=>void;probe.mockReset().mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));
    const recovered=vi.fn();const view=renderHook(({scope})=>useNativeEditorRecovery({enabled:true,scope,onRecovered:recovered}),{initialProps:{scope:'old'}});
    let token!:ReturnType<typeof view.result.current.beginManualAttempt>;
    act(()=>{token=view.result.current.beginManualAttempt();view.result.current.reportFailure();});
    view.rerender({scope:'new'});
    await act(async()=>{release();});
    act(()=>{expect(view.result.current.completeRecovery(token)).toBe(false);});expect(recovered).not.toHaveBeenCalled();view.unmount();
  });
});
