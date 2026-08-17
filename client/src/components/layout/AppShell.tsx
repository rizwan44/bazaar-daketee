import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <main className="flex-1 min-h-0 overflow-y-auto pb-24 pt-safe-top flex flex-col">{children}</main>
      <BottomNav />
    </div>
  );
}
