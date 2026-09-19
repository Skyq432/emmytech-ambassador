import { cn } from '@/lib/utils';
import type { Tracking } from '@/lib/funnel/funnel.ts';

const STYLES: Record<Tracking, string> = {
  Automatic: 'bg-blue-50 text-blue-700',
  Manual: 'bg-amber-50 text-amber-700',
  Recommended: 'bg-emerald-50 text-emerald-700',
};

const LABELS: Record<Tracking, string> = {
  Automatic: 'Tracked automatically',
  Manual: 'Confirmed by EmmyTech',
  Recommended: 'System suggestion',
};

export function TrackingBadge({ type, className }: { type: Tracking; className?: string }) {
  return (
    <span className={cn('inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold', STYLES[type], className)}>
      {LABELS[type]}
    </span>
  );
}
