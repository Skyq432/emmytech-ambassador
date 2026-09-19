/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FunnelRawData, Row } from './funnel.ts';

// Server-only. Uses the service-role key, so it must only ever be called with an
// ambassador id the CALLER has already been verified to own (see the API route).
// It selects only the columns the funnel view needs — staff notes, assigned admins,
// page URLs, search text and money amounts are never fetched at all.

const CHUNK = 100;
const PAGE = 1000;
const MAX_PAGES = 10;

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Funnel is not configured on the server.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function unique(values: Array<unknown>) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

async function fetchIn(admin: SupabaseClient, table: string, select: string, column: string, ids: string[], filter?: (q: any) => any): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for (let page = 0; page < MAX_PAGES; page += 1) {
      let query = admin.from(table).select(select).in(column, chunk).order('id', { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (filter) query = filter(query);
      const { data, error } = await query;
      if (error) throw new Error(`${table}: ${error.message}`);
      const pageRows = (data ?? []) as unknown as Row[];
      rows.push(...pageRows);
      if (pageRows.length < PAGE) break;
    }
  }
  return rows;
}

async function fetchAll(admin: SupabaseClient, table: string, select: string, filter?: (q: any) => any): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = admin.from(table).select(select).order('id', { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const pageRows = (data ?? []) as unknown as Row[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE) break;
  }
  return rows;
}

export async function loadFunnelData(ambassadorId: string): Promise<{ raw: FunnelRawData; unmatchedLeads: number }> {
  const admin = adminClient();

  const myLeads = await fetchAll(admin, 'leads', 'id,identity_id', (q) => q.eq('ambassador_id', ambassadorId));
  const unmatchedLeads = myLeads.filter((row) => !row.identity_id).length;
  const identityIds = unique(myLeads.map((row) => row.identity_id));

  const empty: FunnelRawData = {
    ambassadorId, identities: [], leads: [], identityEvents: [], spinPlayers: [], spinLogs: [], spinPrizes: [],
    productInterests: [], websiteEvents: [], products: [], conversions: [], manualUpdates: [], referrals: [],
    referredIdentityIdsWithApprovedConversion: [],
  };
  if (!identityIds.length) return { raw: empty, unmatchedLeads };

  // Every lead for these people (from any ambassador) — needed only to apply the ownership rule.
  const leads = await fetchIn(admin, 'leads', 'id,identity_id,ambassador_id,status,funnel_stage,product_id,customer_name,customer_phone,created_at,updated_at', 'identity_id', identityIds);
  const leadIds = unique(leads.map((row) => row.id));

  const [identities, identityEvents, spinPlayers, spinLogs, spinPrizes, productInterests, websiteEvents, products, conversions, manualUpdates, referrals] = await Promise.all([
    fetchIn(admin, 'identities', 'id,primary_name,primary_phone,created_at,updated_at', 'id', identityIds),
    fetchIn(admin, 'identity_events', 'id,identity_id,event_type,title,created_at', 'identity_id', identityIds),
    fetchIn(admin, 'spin_players', 'id,identity_id,full_name,phone_number,created_at,updated_at', 'identity_id', identityIds),
    fetchIn(admin, 'spin_logs', 'id,identity_id,created_at', 'identity_id', identityIds),
    fetchIn(admin, 'spin_user_prizes', 'id,identity_id,status,claimed_at,created_at', 'identity_id', identityIds),
    fetchIn(admin, 'product_interests', 'id,identity_id,product_id,created_at', 'identity_id', identityIds),
    fetchIn(admin, 'website_events', 'id,identity_id,product_id,event_type,created_at', 'identity_id', identityIds),
    fetchAll(admin, 'products', 'id,name'),
    fetchIn(admin, 'conversions', 'id,lead_id,approved_at,is_repeat_conversion,conversion_sequence', 'lead_id', leadIds),
    fetchIn(admin, 'crm_manual_updates', 'id,identity_id,update_type,value,created_at', 'identity_id', identityIds, (q) => q.ilike('update_type', 'funnel_stage')),
    fetchIn(admin, 'spin_referrals', 'id,referrer_identity_id,referred_identity_id,created_at', 'referrer_identity_id', identityIds),
  ]);

  // Advocacy (stage 10) needs to know whether someone THIS person referred has bought.
  // Only a yes/no per referred person is kept — nothing about them is returned.
  const referredIds = unique(referrals.map((row) => row.referred_identity_id));
  let referredIdentityIdsWithApprovedConversion: string[] = [];
  if (referredIds.length) {
    const referredLeads = await fetchIn(admin, 'leads', 'id,identity_id', 'identity_id', referredIds);
    const referredLeadIds = unique(referredLeads.map((row) => row.id));
    const referredConversions = await fetchIn(admin, 'conversions', 'id,lead_id,approved_at', 'lead_id', referredLeadIds, (q) => q.not('approved_at', 'is', null));
    const identityByLead = new Map(referredLeads.map((row) => [String(row.id), String(row.identity_id)]));
    referredIdentityIdsWithApprovedConversion = unique(referredConversions.map((row) => identityByLead.get(String(row.lead_id))));
  }

  return {
    raw: { ambassadorId, identities, leads, identityEvents, spinPlayers, spinLogs, spinPrizes, productInterests, websiteEvents, products, conversions, manualUpdates, referrals, referredIdentityIdsWithApprovedConversion },
    unmatchedLeads,
  };
}
