import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFunnel, maskPhone, ownedByAmbassador, stageFromText, websiteStage, type FunnelRawData } from './funnel.ts';

const ME = 'amb-me';
const OTHER = 'amb-other';

function raw(overrides: Partial<FunnelRawData> = {}): FunnelRawData {
  return {
    ambassadorId: ME,
    identities: [{ id: 'p1', primary_name: 'Ada Obi', primary_phone: '08031234567', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-02T10:00:00Z' }],
    leads: [{ id: 'l1', identity_id: 'p1', ambassador_id: ME, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z', funnel_stage: null }],
    identityEvents: [], spinPlayers: [], spinLogs: [], spinPrizes: [], productInterests: [],
    websiteEvents: [], products: [], conversions: [], manualUpdates: [], referrals: [],
    referredIdentityIdsWithApprovedConversion: [],
    ...overrides,
  };
}

test('ownership: only the most recent ambassador lead decides whose person it is', () => {
  const mine = [{ ambassador_id: ME, created_at: '2026-09-02T00:00:00Z' }];
  assert.equal(ownedByAmbassador(mine, ME), true);
  assert.equal(ownedByAmbassador(mine, OTHER), false);
  const reassigned = [
    { ambassador_id: ME, created_at: '2026-09-01T00:00:00Z' },
    { ambassador_id: OTHER, created_at: '2026-09-05T00:00:00Z' },
  ];
  assert.equal(ownedByAmbassador(reassigned, ME), false, 'later lead from another ambassador takes ownership');
  assert.equal(ownedByAmbassador([{ ambassador_id: null, created_at: '2026-09-01T00:00:00Z' }], ME), false);
  assert.equal(ownedByAmbassador([], ME), false);
});

test('a person owned by another ambassador is never returned, even if loaded by mistake', () => {
  const data = raw({
    identities: [
      { id: 'p1', primary_name: 'Mine', created_at: '2026-09-01T00:00:00Z' },
      { id: 'p2', primary_name: 'Someone Else', created_at: '2026-09-01T00:00:00Z' },
      { id: 'p3', primary_name: 'Nobody Owns', created_at: '2026-09-01T00:00:00Z' },
    ],
    leads: [
      { id: 'l1', identity_id: 'p1', ambassador_id: ME, created_at: '2026-09-01T00:00:00Z' },
      { id: 'l2', identity_id: 'p2', ambassador_id: OTHER, created_at: '2026-09-01T00:00:00Z' },
      { id: 'l3', identity_id: 'p3', ambassador_id: null, created_at: '2026-09-01T00:00:00Z' },
    ],
  });
  const people = buildFunnel(data);
  assert.deepEqual(people.map((p) => p.name), ['Mine']);
});

test('stage text rules match the OS CRM', () => {
  assert.equal(stageFromText('added_to_cart'), 4);
  assert.equal(stageFromText('voucher_claimed'), 2);
  assert.equal(stageFromText('whatsapp_handoff'), 5);
  assert.equal(stageFromText('repeat_buyer'), 8);
  assert.equal(stageFromText('qualified referral'), 10);
  assert.equal(stageFromText('nothing relevant'), 0);
  assert.equal(websiteStage('cart_item_added'), 4);
  assert.equal(websiteStage('product_view'), 3);
  assert.equal(websiteStage('send_to_emmy_click'), 5);
});

test('stage is the highest evidence: spin=1, claimed voucher=2, cart=4, approved sale=6, repeat=8', () => {
  assert.equal(buildFunnel(raw())[0].stage, 1, 'floor is Awareness');
  assert.equal(buildFunnel(raw({ spinPrizes: [{ identity_id: 'p1', claimed_at: '2026-09-02T00:00:00Z' }] }))[0].stage, 2);
  assert.equal(buildFunnel(raw({ websiteEvents: [{ identity_id: 'p1', event_type: 'add_to_cart', created_at: '2026-09-02T00:00:00Z' }] }))[0].stage, 4);
  const sale = { id: 'c1', lead_id: 'l1', approved_at: '2026-09-03T00:00:00Z', is_repeat_conversion: false };
  assert.equal(buildFunnel(raw({ conversions: [sale] }))[0].stage, 6);
  assert.equal(buildFunnel(raw({ conversions: [sale, { ...sale, id: 'c2' }] }))[0].stage, 8);
  assert.equal(buildFunnel(raw({ conversions: [sale] }))[0].isCustomer, true);
});

test('advocacy needs a confirmed customer AND a converted referral', () => {
  const sale = { id: 'c1', lead_id: 'l1', approved_at: '2026-09-03T00:00:00Z' };
  const referral = { referrer_identity_id: 'p1', referred_identity_id: 'friend' };
  assert.equal(buildFunnel(raw({ conversions: [sale], referrals: [referral], referredIdentityIdsWithApprovedConversion: ['friend'] }))[0].stage, 10);
  assert.equal(buildFunnel(raw({ referrals: [referral], referredIdentityIdsWithApprovedConversion: ['friend'] }))[0].stage, 1, 'not a customer yet');
  assert.equal(buildFunnel(raw({ conversions: [sale], referrals: [referral] }))[0].stage, 6, 'referral has not converted');
});

test('staff manual corrections apply, but never pull a confirmed sale backwards', () => {
  const manual = (value: string) => ({ identity_id: 'p1', update_type: 'funnel_stage', value, created_at: '2026-09-04T00:00:00Z' });
  assert.equal(buildFunnel(raw({ manualUpdates: [manual('5')] }))[0].stage, 5);
  const sale = { id: 'c1', lead_id: 'l1', approved_at: '2026-09-03T00:00:00Z' };
  assert.equal(buildFunnel(raw({ manualUpdates: [manual('3')], conversions: [sale] }))[0].stage, 6);
});

test('phone numbers are masked', () => {
  assert.equal(maskPhone('08031234567'), '0803••••567');
  assert.equal(maskPhone('+234 803 123 4567'), '2348••••567');
  assert.equal(maskPhone('12345'), '•••••');
  assert.equal(maskPhone(null), '—');
});

test('output never contains staff-internal text, full phone, email, or page URLs', () => {
  const secret = 'INTERNAL-STAFF-NOTE-XYZ';
  const data = raw({
    identities: [{ id: 'p1', primary_name: 'Ada Obi', primary_phone: '08031234567', primary_email: 'ada@secret.test', created_at: '2026-09-01T10:00:00Z' }],
    identityEvents: [{ identity_id: 'p1', event_type: 'cash_off_adjusted', title: secret, description: secret, created_at: '2026-09-02T00:00:00Z' }],
    manualUpdates: [
      { identity_id: 'p1', update_type: 'whatsapp_status', value: 'Lost', note: secret, updated_by: 'staff@emmy', created_at: '2026-09-03T00:00:00Z' },
      { identity_id: 'p1', update_type: 'funnel_stage', value: '5', note: secret, updated_by: 'staff@emmy', created_at: '2026-09-04T00:00:00Z' },
    ],
    websiteEvents: [{ identity_id: 'p1', event_type: 'search', search_query: secret, page_url: 'https://internal.example/secret', created_at: '2026-09-02T00:00:00Z' }],
    spinLogs: [{ identity_id: 'p1', result_label: 'N50,000 JACKPOT', created_at: '2026-09-01T12:00:00Z' }],
    leads: [{ id: 'l1', identity_id: 'p1', ambassador_id: ME, notes: secret, assigned_admin: 'admin-1', created_at: '2026-09-01T10:00:00Z' }],
    conversions: [{ id: 'c1', lead_id: 'l1', approved_at: '2026-09-05T00:00:00Z', amount: 987654, internal_note: secret }],
  });
  const json = JSON.stringify(buildFunnel(data));
  for (const forbidden of [secret, '08031234567', 'ada@secret.test', 'internal.example', 'JACKPOT', '987654', 'staff@emmy', 'admin-1', 'Lost']) {
    assert.equal(json.includes(forbidden), false, `leaked: ${forbidden}`);
  }
  assert.ok(json.includes('0803••••567'));
});

test('anonymous WhatsApp visitors get a first-seen date so identical placeholders are tellable apart', () => {
  const anon = raw({
    identities: [{ id: 'p1', primary_name: null, created_at: '2026-09-12T10:00:00Z' }],
    leads: [{ id: 'l1', identity_id: 'p1', ambassador_id: ME, customer_name: 'WhatsApp Lead', created_at: '2026-09-12T10:00:00Z' }],
  });
  assert.equal(buildFunnel(anon)[0].name, 'WhatsApp Lead · 12 Sep');
  assert.equal(buildFunnel(raw())[0].name, 'Ada Obi', 'real names are left alone');
});
