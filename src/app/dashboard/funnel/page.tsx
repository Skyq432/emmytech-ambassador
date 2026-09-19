'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Search, Users } from 'lucide-react';
import { FUNNEL_STAGES, type FunnelPerson } from '@/lib/funnel/funnel.ts';
import { timeAgo } from '@/lib/funnel/format';
import { useReportingPeriod } from '@/components/reporting/reporting-period-context';
import { ReportingPeriodPanel } from '@/components/reporting/reporting-period-panel';
import { TrackingBadge } from '@/components/funnel/tracking-badge';
import { PersonDrawer } from '@/components/funnel/person-drawer';
import { cn } from '@/lib/utils';

function PersonCard({ person, onOpen }: { person: FunnelPerson; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open details"
      className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-emmy-primary/40"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="truncate text-sm text-slate-950">{person.name}</strong>
        {person.isCustomer && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">Customer</span>}
      </div>
      <p className="truncate text-xs text-slate-500">{person.product}</p>
      <p className="font-mono text-[11px] text-slate-400">{person.maskedPhone === '—' ? 'No phone yet' : person.maskedPhone}</p>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span className="truncate">{person.lastAction}</span>
        <span className="flex shrink-0 items-center gap-1 font-bold text-emmy-primary">
          {timeAgo(person.lastActivityIso)} <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

export default function FunnelPage() {
  const { range } = useReportingPeriod();
  const [people, setPeople] = useState<FunnelPerson[]>([]);
  const [unmatchedLeads, setUnmatchedLeads] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/dashboard/funnel', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Unable to load your funnel.');
        if (active) {
          setPeople(payload.people ?? []);
          setUnmatchedLeads(payload.meta?.unmatchedLeads ?? 0);
          setError(null);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load your funnel.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  // Same meaning as the staff CRM: "in this period" = the person had activity inside it.
  const inPeriod = useMemo(
    () => people.filter((person) => person.lastActivityIso >= range.startIso && person.lastActivityIso < range.endExclusiveIso),
    [people, range.startIso, range.endExclusiveIso]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inPeriod;
    return inPeriod.filter((person) => [person.name, person.product, person.stageName, person.lastAction].join(' ').toLowerCase().includes(q));
  }, [inPeriod, query]);

  const selected = useMemo(() => people.find((person) => person.id === selectedId) ?? null, [people, selectedId]);
  const customers = inPeriod.filter((person) => person.isCustomer).length;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-emmy-primary">10 stages</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">My Funnel</h1>
          <p className="mt-1 max-w-[64ch] text-sm text-slate-500">
            See how the people you brought in move from their first spin to a purchase. This view is read-only — EmmyTech handles the follow-up.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your leads…"
            aria-label="Search your leads"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emmy-primary focus:ring-2 focus:ring-emmy-primary/10"
          />
        </div>
      </div>

      <ReportingPeriodPanel audience="ambassador" />

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading your funnel…</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-700">{error}</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">In your funnel</p>
              <p className="mt-1 text-3xl font-extrabold text-slate-950">{inPeriod.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Became customers</p>
              <p className="mt-1 text-3xl font-extrabold text-emerald-600">{customers}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Still moving</p>
              <p className="mt-1 text-3xl font-extrabold text-emmy-primary">{inPeriod.length - customers}</p>
            </div>
          </div>

          {unmatchedLeads > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-emmy-primary">
              <Users className="h-4 w-4 shrink-0" />
              {unmatchedLeads} of your leads {unmatchedLeads === 1 ? "isn't" : "aren't"} in the funnel yet — they appear here once EmmyTech has matched them to a customer profile.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <TrackingBadge type="Automatic" /> <span>picked up by the system</span>
            <TrackingBadge type="Manual" /> <span>confirmed by the EmmyTech team</span>
          </div>

          {people.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-slate-700">No one is in your funnel yet</p>
              <p className="mt-1 text-xs text-slate-500">Leads you bring in will appear here and move across as they progress.</p>
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div className="flex gap-3">
                {FUNNEL_STAGES.map((stage) => {
                  const cards = visible.filter((person) => person.stage === stage.id);
                  return (
                    <section key={stage.id} className="flex w-[240px] shrink-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3" aria-label={`${stage.name} stage`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn('grid h-6 w-6 place-items-center rounded-md bg-white text-[10.5px] font-extrabold', stage.id >= 6 ? 'text-emerald-600' : 'text-slate-500')}>{stage.id}</span>
                          <strong className="text-sm text-slate-950">{stage.name}</strong>
                        </div>
                        <b className="font-mono text-sm text-slate-950">{cards.length}</b>
                      </div>
                      <p className="text-xs text-slate-500">{stage.short}</p>
                      <div className="flex flex-col gap-2">
                        {cards.length ? (
                          cards.map((person) => <PersonCard key={person.id} person={person} onOpen={() => setSelectedId(person.id)} />)
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-[11px] text-slate-400">No one here yet</div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <PersonDrawer person={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
