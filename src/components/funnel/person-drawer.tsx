'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { FUNNEL_STAGES, type FunnelPerson, type Tone } from '@/lib/funnel/funnel.ts';
import { formatDateTime, timeAgo } from '@/lib/funnel/format';
import { TrackingBadge } from '@/components/funnel/tracking-badge';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<Tone, string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  slate: 'bg-slate-400',
};

export function PersonDrawer({ person, onClose }: { person: FunnelPerson | null; onClose: () => void }) {
  useEffect(() => {
    if (!person) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [person, onClose]);

  if (!person) return null;
  const stage = FUNNEL_STAGES.find((item) => item.id === person.stage);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close details" onClick={onClose} className="absolute inset-0 bg-slate-950/40" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl" role="dialog" aria-label={`${person.name} details`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">Your lead</p>
            <h2 className="mt-1 truncate text-xl font-extrabold text-slate-950">{person.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{person.maskedPhone === '—' ? 'No phone yet' : person.maskedPhone}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <section>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Current stage</p>
                <p className="mt-1 text-lg font-extrabold text-slate-950">{person.stage}. {person.stageName}</p>
              </div>
              <TrackingBadge type={person.tracking} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{stage?.short}</p>
            <div className="mt-3 flex gap-1" aria-label={`Stage ${person.stage} of 10`}>
              {FUNNEL_STAGES.map((item) => (
                <span
                  key={item.id}
                  title={item.name}
                  className={cn('h-2 flex-1 rounded-full', item.id <= person.stage ? (person.isCustomer ? 'bg-emerald-500' : 'bg-emmy-primary') : 'bg-slate-200')}
                />
              ))}
            </div>
            {person.isCustomer && <p className="mt-2 text-xs font-bold text-emerald-700">This lead has become a customer.</p>}
          </section>

          <section className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Interested in</p>
              <p className="mt-1 font-bold text-slate-900">{person.product}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Last activity</p>
              <p className="mt-1 font-bold text-slate-900">{timeAgo(person.lastActivityIso)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">First seen</p>
              <p className="mt-1 font-bold text-slate-900">{formatDateTime(person.firstSeenIso)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Latest step</p>
              <p className="mt-1 font-bold text-slate-900">{person.lastAction}</p>
            </div>
          </section>

          <section>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Journey so far</p>
            {person.activities.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">No activity recorded yet.</p>
            ) : (
              <ol className="mt-3 space-y-4">
                {person.activities.map((activity, index) => (
                  <li key={`${activity.title}-${activity.atIso}-${index}`} className="relative flex gap-3">
                    <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', TONE_DOT[activity.tone])} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{activity.title}</p>
                      <p className="text-xs text-slate-500">{activity.detail}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(activity.atIso)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
