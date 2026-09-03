import React, { PropsWithChildren, createContext, useContext, useState } from 'react';
import { LifeMapRuntime, createLifeMapRuntime } from './createLifeMapRuntime';

const LifeMapRuntimeContext = createContext<LifeMapRuntime | undefined>(undefined);

export const LifeMapProvider = ({ children, runtime: provided }: PropsWithChildren<{ runtime?: LifeMapRuntime }>) => {
  const [runtime] = useState(() => provided ?? createLifeMapRuntime());
  return <LifeMapRuntimeContext.Provider value={runtime}>{children}</LifeMapRuntimeContext.Provider>;
};

export const useLifeMapRuntime = (): LifeMapRuntime => {
  const runtime = useContext(LifeMapRuntimeContext);
  if (!runtime) throw new Error('useLifeMapRuntime must be used inside LifeMapProvider');
  return runtime;
};
