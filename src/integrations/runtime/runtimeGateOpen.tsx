import React, { createContext, useContext } from 'react';

/** False while a connection panel is still drawn over the mounted app (it is inert then); true everywhere else. */
const RuntimeGateOpenContext = createContext(true);

export function RuntimeGateOpenProvider({ open, children }: { open: boolean; children: React.ReactNode }) {
  return <RuntimeGateOpenContext.Provider value={open}>{children}</RuntimeGateOpenContext.Provider>;
}

/** Whether the app is open to the person: no connection panel is over it. Things that start on their own (the editor tour) wait for it. */
export function useRuntimeGateOpen(): boolean {
  return useContext(RuntimeGateOpenContext);
}
