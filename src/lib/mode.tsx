'use client';

import { createContext, useContext, useTransition } from 'react';
import { setMode } from '@/app/actions';

const Ctx = createContext(true);

/**
 * Hands the app-wide test/live switch to client pages. The root layout reads it
 * on the server (.data/db.json) and passes it in; flipping it revalidates the
 * layout, so this value updates without any client-side fetching.
 */
export function ModeProvider({ testmode, children }: { testmode: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={testmode}>{children}</Ctx.Provider>;
}

export const useTestmode = () => useContext(Ctx);

export function ModeToggle() {
  const testmode = useTestmode();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!testmode}
      className={`mode-toggle ${testmode ? '' : 'live'}`}
      disabled={pending}
      onClick={() => startTransition(() => setMode(!testmode))}
      title={testmode ? 'Test mode. Click to go live.' : 'Live — real money. Click for test mode.'}
    >
      <span className="track"><span className="thumb" /></span>
      {testmode ? 'Test' : 'LIVE'}
    </button>
  );
}
