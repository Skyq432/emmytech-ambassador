export type ReportingPreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'selected_month'
  | 'this_year'
  | 'all_time'
  | 'custom';

export interface ReportingRange {
  preset: ReportingPreset;
  startDate: string;
  endDate: string;
  startIso: string;
  endExclusiveIso: string;
  label: string;
  shortLabel: string;
}

const NIGERIA_OFFSET = '+01:00';

export const reportingPresetOptions: Array<{
  value: ReportingPreset;
  label: string;
}> = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'selected_month', label: 'Select month' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

function parts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: string, numberOfDays: number) {
  const { year, month, day } = parts(date);
  const next = dateFromParts(year, month, day);
  next.setUTCDate(next.getUTCDate() + numberOfDays);
  return formatDateOnly(next);
}

export function nigeriaToday() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function displayDate(date: string) {
  const { year, month, day } = parts(date);

  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dateFromParts(year, month, day));
}

function toRange(
  preset: ReportingPreset,
  startDate: string,
  endDate: string,
  label: string
): ReportingRange {
  return {
    preset,
    startDate,
    endDate,
    startIso: `${startDate}T00:00:00${NIGERIA_OFFSET}`,
    endExclusiveIso: `${addDays(endDate, 1)}T00:00:00${NIGERIA_OFFSET}`,
    label,
    shortLabel:
      startDate === endDate
        ? displayDate(startDate)
        : `${displayDate(startDate)} – ${displayDate(endDate)}`,
  };
}

export function getReportingRange(
  preset: ReportingPreset,
  customStart?: string,
  customEnd?: string,
  today = nigeriaToday()
): ReportingRange {
  const { year, month, day } = parts(today);
  const todayDate = dateFromParts(year, month, day);

  if (preset === 'today') {
    return toRange('today', today, today, 'Today');
  }

  if (preset === 'this_week') {
    const weekday = todayDate.getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const startDate = addDays(today, mondayOffset);
    const endDate = addDays(startDate, 6);

    return toRange('this_week', startDate, endDate, 'This week');
  }

  if (preset === 'last_month') {
    const start = dateFromParts(year, month - 1, 1);
    const end = dateFromParts(year, month, 0);

    return toRange(
      'last_month',
      formatDateOnly(start),
      formatDateOnly(end),
      'Last month'
    );
  }

  if (preset === 'last_30_days') {
    return toRange('last_30_days', addDays(today, -29), today, 'Last 30 days');
  }

  if (preset === 'this_year') {
    return toRange(
      'this_year',
      `${year}-01-01`,
      `${year}-12-31`,
      'This year'
    );
  }

  if (preset === 'selected_month') {
    const selectedMonth = customStart?.slice(0, 7) || today.slice(0, 7);
    const [selectedYear, selectedMonthNumber] = selectedMonth.split('-').map(Number);
    const startDate = `${selectedMonth}-01`;
    const endDate = formatDateOnly(
      dateFromParts(selectedYear, selectedMonthNumber + 1, 0)
    );

    return toRange('selected_month', startDate, endDate, 'Selected month');
  }

  if (preset === 'all_time') {
    return toRange(
      'all_time',
      '2000-01-01',
      '9999-12-31',
      'All time'
    );
  }

  if (preset === 'custom' && customStart && customEnd) {
    const startDate = customStart <= customEnd ? customStart : customEnd;
    const endDate = customStart <= customEnd ? customEnd : customStart;

    return toRange('custom', startDate, endDate, 'Custom range');
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = formatDateOnly(dateFromParts(year, month + 1, 0));

  return toRange('this_month', startDate, endDate, 'This month');
}
