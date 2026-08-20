'use client';

import { useState } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ShieldCheck,
} from 'lucide-react';
import { reportingPresetOptions } from '@/lib/reporting-period';
import { useReportingPeriod } from './reporting-period-context';

type ReportingAudience = 'admin' | 'ambassador';

const helpContent: Record<
  ReportingAudience,
  {
    affects: string[];
    doesNotAffect: string[];
    note?: string;
  }
> = {
  admin: {
    affects: [
      'New ambassadors created in the selected period',
      'Leads created in the selected period',
      'Activities submitted in the selected period',
      'Approved conversions and revenue in the selected period',
      'Recent activity, top performers and reporting lists',
    ],
    doesNotAffect: [
      'The current number of active ambassadors',
      'Pending activity reviews and pending lead edits',
      'Unread admin alerts and other current attention items',
      'Current account status, balances and referral details',
    ],
    note:
      'The integrated Spin Wheel admin keeps its own report-period control because it reports on a separate operational dataset.',
  },
  ambassador: {
    affects: [
      'Your leads and approved conversions in the selected period',
      'WhatsApp referral clicks and credited leads',
      'Spin Wheel referral clicks and qualified leads',
      'Paid payouts recorded in the selected period',
      'Bonuses, commissions and other dated performance activity',
      'My Leads, My Activity, Payout History and Leaderboard reports',
    ],
    doesNotAffect: [
      'Your current available balance',
      'Your ambassador account status',
      'Your referral links, referral code and profile details',
      'Your current payout-account settings',
    ],
  },
};

export function ReportingPeriodPanel({
  audience,
}: {
  audience: ReportingAudience;
}) {
  const { range, setPreset, setCustomRange, setSelectedMonth } = useReportingPeriod();
  const [helpOpen, setHelpOpen] = useState(false);
  const content = helpContent[audience];

  return (
    <section
      aria-labelledby={`${audience}-reporting-period-title`}
      className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emmy-primary text-white shadow-sm">
            <CalendarRange className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p
                id={`${audience}-reporting-period-title`}
                className="text-sm font-bold text-slate-950"
              >
                Dashboard time frame
              </p>

              <button
                type="button"
                onClick={() => setHelpOpen((current) => !current)}
                aria-expanded={helpOpen}
                aria-controls={`${audience}-reporting-period-help`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 text-xs font-semibold text-emmy-primary transition hover:border-blue-200 hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <CircleHelp className="h-4 w-4" />
                Help
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    helpOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-700">{range.shortLabel}</span>.
              The selected time frame follows you across reporting pages.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`${audience}-reporting-preset`}>
            Select dashboard time frame
          </label>

          <select
            id={`${audience}-reporting-preset`}
            value={range.preset}
            onChange={(event) =>
              setPreset(event.target.value as typeof range.preset)
            }
            className="h-11 min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emmy-primary focus:ring-4 focus:ring-blue-100"
          >
            {reportingPresetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {range.preset === 'selected_month' && (
            <>
              <label className="sr-only" htmlFor={`${audience}-reporting-month`}>
                Select reporting month
              </label>
              <input
                id={`${audience}-reporting-month`}
                type="month"
                value={range.startDate.slice(0, 7)}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emmy-primary focus:ring-4 focus:ring-blue-100"
              />
            </>
          )}

          {range.preset === 'custom' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="sr-only" htmlFor={`${audience}-reporting-start`}>
                Start date
              </label>
              <input
                id={`${audience}-reporting-start`}
                type="date"
                value={range.startDate}
                max={range.endDate}
                onChange={(event) =>
                  setCustomRange(event.target.value, range.endDate)
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emmy-primary focus:ring-4 focus:ring-blue-100"
              />

              <label className="sr-only" htmlFor={`${audience}-reporting-end`}>
                End date
              </label>
              <input
                id={`${audience}-reporting-end`}
                type="date"
                value={range.endDate}
                min={range.startDate}
                onChange={(event) =>
                  setCustomRange(range.startDate, event.target.value)
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-emmy-primary focus:ring-4 focus:ring-blue-100"
              />
            </div>
          )}
        </div>
      </div>

      {helpOpen && (
        <div
          id={`${audience}-reporting-period-help`}
          className="border-t border-blue-100 bg-blue-50/50 p-4 sm:p-5"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="text-sm font-bold">
                  What the selected time frame affects
                </h3>
              </div>

              <ul className="mt-3 space-y-2">
                {content.affects.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-sm leading-5 text-slate-600"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-amber-100 bg-white p-4">
              <div className="flex items-center gap-2 text-amber-700">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="text-sm font-bold">
                  What the selected time frame does not affect
                </h3>
              </div>

              <ul className="mt-3 space-y-2">
                {content.doesNotAffect.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-sm leading-5 text-slate-600"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {content.note && (
            <p className="mt-4 rounded-xl border border-blue-100 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
              {content.note}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
