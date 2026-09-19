/* eslint-disable @typescript-eslint/no-explicit-any */
// Ambassador-facing view of the EmmyTech behaviour funnel.
//
// The stage rules below are a deliberate COPY of the ones EmmyTech OS uses for the
// staff CRM (src/app/api/crm/identities/route.ts in the OS repo), so an ambassador
// sees the same stage staff see for the same person. If those rules change in OS,
// change them here too.
//
// This module is pure (no I/O, no imports) so the two properties that matter most —
// (1) only the ambassador's OWN people are ever returned and (2) nothing staff-internal
// leaks into the result — can be unit-tested.

export type Row = Record<string, any>;
export type Tracking = 'Automatic' | 'Manual' | 'Recommended';
export type Tone = 'blue' | 'green' | 'amber' | 'slate';

export interface FunnelStage {
  id: number;
  name: string;
  short: string;
  tracking: Tracking;
}

export const FUNNEL_STAGES: FunnelStage[] = [
  { id: 1, name: 'Awareness', short: 'Spin', tracking: 'Automatic' },
  { id: 2, name: 'Interest', short: 'Voucher claim', tracking: 'Automatic' },
  { id: 3, name: 'Consideration', short: 'Browse / ask', tracking: 'Automatic' },
  { id: 4, name: 'Intent', short: 'Added to cart', tracking: 'Automatic' },
  { id: 5, name: 'Purchase', short: 'WhatsApp handoff', tracking: 'Manual' },
  { id: 6, name: 'Onboarding', short: 'Paid / delivery', tracking: 'Manual' },
  { id: 7, name: 'Satisfaction', short: 'Feedback / review', tracking: 'Manual' },
  { id: 8, name: 'Loyalty', short: 'Repeat buyer', tracking: 'Manual' },
  { id: 9, name: 'Expansion', short: 'Cross-sell ready', tracking: 'Recommended' },
  { id: 10, name: 'Advocacy', short: 'Qualified referral', tracking: 'Manual' },
];

const STAGE_NAMES = new Map(FUNNEL_STAGES.map((stage) => [stage.id, stage.name]));

export interface FunnelActivity {
  title: string;
  detail: string;
  atIso: string;
  tone: Tone;
}

/** Everything an ambassador is allowed to see about one of their people. */
export interface FunnelPerson {
  id: string;
  name: string;
  maskedPhone: string;
  stage: number;
  stageName: string;
  tracking: Tracking;
  product: string;
  firstSeenIso: string;
  lastActivityIso: string;
  lastAction: string;
  isCustomer: boolean;
  activities: FunnelActivity[];
}

/** Raw rows for ONE ambassador's people. Loaded and scoped by the server route. */
export interface FunnelRawData {
  ambassadorId: string;
  identities: Row[];
  /** Every lead row for those identities, from any ambassador — used only to decide ownership. */
  leads: Row[];
  identityEvents: Row[];
  spinPlayers: Row[];
  spinLogs: Row[];
  spinPrizes: Row[];
  productInterests: Row[];
  websiteEvents: Row[];
  products: Row[];
  conversions: Row[];
  manualUpdates: Row[];
  /** spin_referrals where the referrer is one of these identities. */
  referrals: Row[];
  /** Identity ids (referred people) that have an approved conversion. */
  referredIdentityIdsWithApprovedConversion: string[];
}

function normalize(value?: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function humanize(value?: unknown) {
  const s = String(value ?? '').replace(/[_-]+/g, ' ').trim();
  if (!s) return 'Activity';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stageFromText(value?: unknown) {
  const s = normalize(value);
  if (!s) return 0;
  if (/(advocacy|qualified.?referral)/.test(s)) return 10;
  if (/(expansion|cross.?sell)/.test(s)) return 9;
  if (/(loyalty|repeat.?buyer|repeat.?purchase)/.test(s)) return 8;
  if (/(satisfaction|feedback|review)/.test(s)) return 7;
  if (/(onboarding|paid|delivery|customer_active)/.test(s)) return 6;
  if (/(purchase|whatsapp|handoff|send.?to.?emmy)/.test(s)) return 5;
  if (/(intent|added.?to.?cart|add.?to.?cart|cart)/.test(s)) return 4;
  if (/(consideration|brows|product.?interest|product.?view|search)/.test(s)) return 3;
  if (/(interest|voucher|claim)/.test(s)) return 2;
  if (/(awareness|spin|new.?lead)/.test(s)) return 1;
  return 0;
}

export function websiteStage(eventType?: unknown) {
  const s = normalize(eventType);
  if (!s) return 0;
  if (/(whatsapp|send.?to.?emmy|send.?message|handoff|checkout)/.test(s)) return 5;
  if (/(add.?to.?cart|cart.?add|cart_item_added)/.test(s)) return 4;
  if (/(product|view|search|browse)/.test(s)) return 3;
  return 0;
}

export function trackingForStage(stage: number): Tracking {
  if (stage === 9) return 'Recommended';
  if (stage >= 5) return 'Manual';
  return 'Automatic';
}

/** 08031234567 -> 0803•••4567 style: enough to recognise, not enough to contact. */
export function maskPhone(value?: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length < 7) return '•'.repeat(digits.length);
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Fixed month names: Intl abbreviations differ between runtimes ('Sep' vs 'Sept').
function shortDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', timeZone: 'Africa/Lagos' }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? 0);
  return `${day} ${MONTHS[month - 1] ?? ''}`.trim();
}

/** Anonymous WhatsApp visitors all share a placeholder name; add the first-seen date so cards are tellable apart. */
export function displayName(raw: unknown, firstSeenIso?: string | null) {
  const name = String(raw ?? '').trim();
  if (name && !/^(whatsapp lead|unknown|lead|customer)$/i.test(name)) return name;
  const d = firstSeenIso ? new Date(firstSeenIso) : null;
  const when = d && !Number.isNaN(d.getTime()) ? shortDay(d) : null;
  const base = name || 'New lead';
  return when ? `${base} · ${when}` : base;
}

function groupByIdentity(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = row.identity_id;
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function latestByDate(rows: Row[], keys = ['updated_at', 'created_at']) {
  return [...rows].sort((a, b) => {
    const aDate = keys.map((key) => a[key]).find(Boolean);
    const bDate = keys.map((key) => b[key]).find(Boolean);
    return new Date(bDate ?? 0).getTime() - new Date(aDate ?? 0).getTime();
  })[0];
}

function newestDate(values: Array<string | null | undefined>) {
  return values
    .filter(Boolean)
    .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] as string | undefined;
}

/**
 * Same "who owns this person" rule OS uses: the most recent lead that carries an
 * ambassador decides. Anyone else's person is dropped before anything else happens.
 */
export function ownedByAmbassador(leadRows: Row[], ambassadorId: string) {
  const direct = latestByDate(leadRows.filter((row) => row.ambassador_id));
  return Boolean(direct?.ambassador_id) && String(direct.ambassador_id) === String(ambassadorId);
}

function buildActivities(input: {
  webRows: Row[];
  logRows: Row[];
  prizeRows: Row[];
  conversionRows: Row[];
  manualRows: Row[];
  leadRows: Row[];
  ambassadorId: string;
  productName: (id?: string | null) => string | null;
}) {
  const out: FunnelActivity[] = [];

  // Only generic, customer-journey wording. Staff notes, WhatsApp outcomes, prize
  // values, page URLs and search text are deliberately never copied across.
  for (const row of input.leadRows) {
    if (String(row.ambassador_id ?? '') === String(input.ambassadorId) && row.created_at) {
      out.push({ title: 'Joined through you', detail: 'Added as one of your leads', atIso: row.created_at, tone: 'blue' });
    }
  }
  for (const row of input.logRows.slice(0, 20)) {
    out.push({ title: 'Spun the wheel', detail: 'Took part in the Spin Wheel', atIso: row.created_at, tone: 'blue' });
  }
  for (const row of input.prizeRows.slice(0, 10)) {
    if (row.claimed_at) out.push({ title: 'Claimed a voucher', detail: 'Voucher attached to their profile', atIso: row.claimed_at, tone: 'green' });
  }
  for (const row of input.webRows) {
    const type = normalize(row.event_type);
    const product = input.productName(row.product_id);
    if (/(whatsapp|send.?to.?emmy|handoff)/.test(type)) {
      out.push({ title: 'Sent to EmmyTech on WhatsApp', detail: 'Now in a conversation with the sales team', atIso: row.created_at, tone: 'amber' });
    } else if (/(add.?to.?cart|cart.?add|cart_item_added)/.test(type)) {
      out.push({ title: 'Added a product to cart', detail: product || 'Showed strong buying interest', atIso: row.created_at, tone: 'green' });
    } else if (/search/.test(type)) {
      out.push({ title: 'Searched the shop', detail: 'Looking for a product', atIso: row.created_at, tone: 'blue' });
    } else if (/(product|view|browse)/.test(type)) {
      out.push({ title: 'Viewed a product', detail: product || 'Browsing products', atIso: row.created_at, tone: 'blue' });
    }
  }
  for (const row of input.conversionRows.filter((c) => Boolean(c.approved_at)).slice(0, 10)) {
    const repeat = row.is_repeat_conversion === true || Number(row.conversion_sequence ?? 0) >= 2;
    out.push({
      title: repeat ? 'Repeat purchase confirmed' : 'Purchase confirmed',
      detail: 'EmmyTech confirmed this sale',
      atIso: row.approved_at,
      tone: 'green',
    });
  }
  for (const row of input.manualRows.slice(0, 25)) {
    if (normalize(row.update_type) === 'funnel_stage') {
      const moved = Number(row.value);
      const name = STAGE_NAMES.get(moved);
      if (name) out.push({ title: `Moved to ${name}`, detail: 'Updated by the EmmyTech team', atIso: row.created_at, tone: 'slate' });
    }
  }

  const seen = new Set<string>();
  return out
    .filter((item) => Boolean(item.atIso))
    .sort((a, b) => new Date(b.atIso).getTime() - new Date(a.atIso).getTime())
    .filter((item) => {
      const key = `${item.title}|${item.atIso}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 25);
}

export function buildFunnel(raw: FunnelRawData): FunnelPerson[] {
  const leadsByIdentity = groupByIdentity(raw.leads);
  const eventsByIdentity = groupByIdentity(raw.identityEvents);
  const playersByIdentity = groupByIdentity(raw.spinPlayers);
  const logsByIdentity = groupByIdentity(raw.spinLogs);
  const prizesByIdentity = groupByIdentity(raw.spinPrizes);
  const interestsByIdentity = groupByIdentity(raw.productInterests);
  const webByIdentity = groupByIdentity(raw.websiteEvents);
  const manualByIdentity = groupByIdentity(raw.manualUpdates);
  const productMap = new Map(raw.products.map((row) => [row.id, row]));
  const productName = (id?: string | null) => (id ? (productMap.get(id)?.name as string | undefined) ?? null : null);

  const leadIdentityById = new Map(
    raw.leads.filter((row) => row.id && row.identity_id).map((row) => [String(row.id), String(row.identity_id)])
  );
  const conversionsByIdentity = groupByIdentity(
    raw.conversions
      .map((row) => ({ ...row, identity_id: row.lead_id ? leadIdentityById.get(String(row.lead_id)) ?? null : null }))
      .filter((row) => Boolean(row.identity_id))
  );
  const convertedReferred = new Set(raw.referredIdentityIdsWithApprovedConversion.map(String));

  const people: FunnelPerson[] = [];

  for (const identity of raw.identities) {
    const id = String(identity.id);
    const leadRows = leadsByIdentity.get(id) ?? [];

    // Ownership gate: never build anything for a person this ambassador doesn't own.
    if (!ownedByAmbassador(leadRows, raw.ambassadorId)) continue;

    const playerRows = playersByIdentity.get(id) ?? [];
    const player = latestByDate(playerRows);
    const logRows = logsByIdentity.get(id) ?? [];
    const prizeRows = prizesByIdentity.get(id) ?? [];
    const lead = latestByDate(leadRows);
    const interestRows = interestsByIdentity.get(id) ?? [];
    const webRows = webByIdentity.get(id) ?? [];
    const manualRows = manualByIdentity.get(id) ?? [];
    const conversionRows = conversionsByIdentity.get(id) ?? [];
    const approvedConversions = conversionRows.filter((row) => Boolean(row.approved_at));

    const hasApprovedConversion = approvedConversions.length > 0;
    const hasRepeatConversion =
      approvedConversions.some((row) => row.is_repeat_conversion === true || Number(row.conversion_sequence ?? 0) >= 2) ||
      approvedConversions.length >= 2;
    const hasConvertedReferral = raw.referrals.some(
      (row) =>
        String(row.referrer_identity_id ?? '') === id &&
        Boolean(row.referred_identity_id) &&
        convertedReferred.has(String(row.referred_identity_id))
    );

    const conversionStage = hasRepeatConversion ? 8 : hasApprovedConversion ? 6 : 0;
    const advocacyStage = hasApprovedConversion && hasConvertedReferral ? 10 : 0;

    const leadStage = Math.min(9, Math.max(0, ...leadRows.map((row) => stageFromText(row.funnel_stage))));
    const eventStage = Math.max(0, ...webRows.map((row) => websiteStage(row.event_type)));
    const prizeStage = prizeRows.some((row) => row.claimed_at || normalize(row.status).includes('claim')) ? 2 : 0;
    const spinStage = playerRows.length || logRows.length ? 1 : 0;
    const identityEventStage = Math.min(
      9,
      Math.max(0, ...(eventsByIdentity.get(id) ?? []).map((row) => stageFromText(`${row.event_type} ${row.title}`)))
    );

    const computedStage = Math.max(1, leadStage, eventStage, prizeStage, spinStage, identityEventStage, conversionStage, advocacyStage);

    const manualStageRow = latestByDate(manualRows.filter((row) => normalize(row.update_type) === 'funnel_stage'));
    const manualStage = Number(manualStageRow?.value);
    // A staff correction can override behaviour, but confirmed purchases never move backwards.
    const stage =
      Number.isInteger(manualStage) && manualStage >= 1 && manualStage <= 10
        ? Math.max(manualStage, conversionStage, advocacyStage)
        : computedStage;

    const productRow = latestByDate(interestRows, ['created_at', 'viewed_at']);
    const webProductRow = latestByDate(webRows.filter((row) => row.product_id), ['created_at', 'viewed_at']);
    const product =
      productName(productRow?.product_id) ?? productName(webProductRow?.product_id) ?? productName(lead?.product_id) ?? 'No product identified yet';

    const activities = buildActivities({
      webRows, logRows, prizeRows, conversionRows, manualRows, leadRows, ambassadorId: raw.ambassadorId, productName,
    });

    const lastActivityIso =
      newestDate([
        identity.updated_at, identity.created_at,
        ...logRows.map((r) => r.created_at),
        ...webRows.map((r) => r.created_at),
        ...leadRows.flatMap((r) => [r.updated_at, r.created_at]),
        ...prizeRows.flatMap((r) => [r.claimed_at, r.created_at]),
      ]) ?? identity.created_at;

    people.push({
      id,
      name: displayName(identity.primary_name || player?.full_name || lead?.customer_name, identity.created_at),
      maskedPhone: maskPhone(identity.primary_phone || player?.phone_number || lead?.customer_phone),
      stage,
      stageName: STAGE_NAMES.get(stage) ?? `Stage ${stage}`,
      tracking: manualStageRow ? 'Manual' : trackingForStage(stage),
      product,
      firstSeenIso: identity.created_at,
      lastActivityIso,
      lastAction: activities[0]?.title ?? humanize(lead?.status ?? 'New lead'),
      isCustomer: stage >= 6,
      activities,
    });
  }

  return people.sort((a, b) => new Date(b.lastActivityIso).getTime() - new Date(a.lastActivityIso).getTime());
}
