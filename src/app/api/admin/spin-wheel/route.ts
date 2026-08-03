import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const db: any = new Proxy(
  {},
  {
    get(_target, property) {
      const client: any = getSupabaseAdmin();
      const value = client[property];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
);

const MAX_ROWS = 5000;

type Row = Record<string, any>;
type SafeRowsResult = { rows: Row[]; warning: string | null };

async function authorized(_req?: NextRequest) {
  const supabase = await createServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return false;

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return !profileError && profile?.role === "admin";
}

function deny() {
  return NextResponse.json(
    { ok: false, error: "Administrator access is required." },
    { status: 401 }
  );
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function timestampOf(row: Row) {
  const value =
    row.created_at ??
    row.createdAt ??
    row.updated_at ??
    row.updatedAt ??
    null;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function newestFirst(rows: Row[]) {
  return [...rows].sort((a, b) => timestampOf(b) - timestampOf(a));
}

function within(rows: Row[], fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  return rows.filter((row) => {
    const time = timestampOf(row);
    return time >= from && time <= to;
  });
}

async function safeRows(
  table: string,
  limit = MAX_ROWS
): Promise<SafeRowsResult> {
  try {
    const { data, error } = await db.from(table).select("*").limit(limit);

    if (error) {
      return {
        rows: [],
        warning: `${table}: ${error.message}`,
      };
    }

    return {
      rows: Array.isArray(data) ? data : [],
      warning: null,
    };
  } catch (error) {
    return {
      rows: [],
      warning: `${table}: ${
        error instanceof Error ? error.message : "Unable to read table"
      }`,
    };
  }
}

function tableIsAvailable(result: SafeRowsResult) {
  return !result.warning;
}

function hasColumn(rows: Row[], column: string) {
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, column));
}

function rowPlayerId(row: Row) {
  return row.spin_player_id ?? row.player_id ?? null;
}

function collectWarnings(
  results: Array<{ warning: string | null }>
) {
  return results
    .map((result) => result.warning)
    .filter(Boolean) as string[];
}

function playerName(player: Row | undefined, identity: Row | undefined) {
  return (
    identity?.primary_name ??
    identity?.full_name ??
    player?.full_name ??
    player?.name ??
    "Unnamed player"
  );
}

function playerPhone(player: Row | undefined, identity: Row | undefined) {
  return (
    identity?.primary_phone ??
    identity?.phone_number ??
    player?.phone_number ??
    player?.phone ??
    ""
  );
}

async function identityMapFor(identityIds: string[]) {
  const identitiesResult = await safeRows("identities");
  const wanted = new Set(identityIds.filter(Boolean));

  return {
    map: new Map(
      identitiesResult.rows
        .filter((row) => wanted.has(row.id))
        .map((row) => [row.id, row])
    ),
    warning: identitiesResult.warning,
  };
}

async function overview(fromIso: string, toIso: string) {
  const [
    spinsResult,
    playersResult,
    referralsResult,
    accountsResult,
    transactionsResult,
    prizesResult,
    challengesResult,
    cashoutsResult,
    referralAwardsResult,
    shareBonusResult,
  ] = await Promise.all([
    safeRows("spin_logs"),
    safeRows("spin_players"),
    safeRows("spin_referrals"),
    safeRows("cash_off_accounts"),
    safeRows("cash_off_transactions"),
    safeRows("spin_user_prizes"),
    safeRows("spin_cash_challenges"),
    safeRows("spin_cashout_requests"),
    safeRows("spin_referral_awards"),
    safeRows("spin_share_bonus_claims"),
  ]);

  const spins = newestFirst(within(spinsResult.rows, fromIso, toIso));
  const players = within(playersResult.rows, fromIso, toIso);
  const referrals = within(referralsResult.rows, fromIso, toIso);
  const accounts = accountsResult.rows;
  const transactions = within(
    transactionsResult.rows,
    fromIso,
    toIso
  );
  const userPrizes = prizesResult.rows;
  const challenges = challengesResult.rows;
  const cashouts = cashoutsResult.rows;
  const referralAwards = within(
    referralAwardsResult.rows,
    fromIso,
    toIso
  );
  const shareBonusClaims = within(
    shareBonusResult.rows,
    fromIso,
    toIso
  );

  const activePlayers = new Set(
    spins
      .map((row) => row.spin_player_id ?? row.player_id)
      .filter(Boolean)
  ).size;

  const cashOffCredited = transactions
    .filter(
      (row) =>
        textValue(row.direction).toLowerCase() === "credit"
    )
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const cashOffDebited = transactions
    .filter(
      (row) =>
        textValue(row.direction).toLowerCase() === "debit"
    )
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const currentCashOff = accounts.reduce(
    (sum, row) => sum + numberValue(row.balance),
    0
  );

  const pendingClaims = userPrizes.filter((row) => {
    const status = textValue(row.status).toLowerCase();
    const type = textValue(
      row.result_type ?? row.prize_type
    ).toLowerCase();

    return (
      ["available", "pending", "unclaimed"].includes(status) &&
      !["cash", "cash_off", "wallet_credit", "retry"].includes(type)
    );
  }).length;

  const activeChallenges = challenges.filter(
    (row) => textValue(row.status).toLowerCase() === "active"
  ).length;
  const cashEligibleChallenges = challenges.filter(
    (row) => textValue(row.status).toLowerCase() === "cash_eligible"
  );
  const cashPayoutDue = cashEligibleChallenges.reduce(
    (sum, row) => sum + numberValue(row.cash_balance),
    0
  );
  const pendingCashouts = cashouts.filter(
    (row) => textValue(row.status).toLowerCase() === "pending"
  ).length;
  const dailySpinReady = hasColumn(playersResult.rows, "daily_spin_available")
    ? playersResult.rows.filter((row) => Boolean(row.daily_spin_available)).length
    : 0;
  const referralBonusSpins = referralAwards.reduce(
    (sum, row) => sum + numberValue(row.spins_awarded),
    0
  );

  const distributionMap = new Map<string, number>();
  for (const spin of spins) {
    const label =
      textValue(spin.result_label ?? spin.prize_label) || "Unknown";
    distributionMap.set(
      label,
      (distributionMap.get(label) || 0) + 1
    );
  }

  const endDate = new Date(toIso);
  const daily: Array<{ day: string; count: number }> = [];
  const dailyMap = new Map<string, number>();

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    daily.push({ day: key, count: 0 });
    dailyMap.set(key, 0);
  }

  for (const spin of spins) {
    const time = timestampOf(spin);
    if (!time) continue;
    const key = new Date(time).toISOString().slice(0, 10);
    if (dailyMap.has(key)) {
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    }
  }

  for (const item of daily) {
    item.count = dailyMap.get(item.day) || 0;
  }

  const referrerIds = new Set(
    referrals
      .map(
        (row) =>
          row.referrer_spin_player_id ??
          row.referrer_player_id ??
          row.referrer_id
      )
      .filter(Boolean)
  );

  const referralRate =
    activePlayers > 0
      ? (referrerIds.size / activePlayers) * 100
      : 0;

  const averageReferrals =
    referrerIds.size > 0
      ? referrals.length / referrerIds.size
      : 0;

  const viralScore = (referralRate / 100) * averageReferrals;

  let loopStatus = "No loop";
  if (viralScore >= 1) loopStatus = "Viral loop";
  else if (viralScore >= 0.5) loopStatus = "Referral loop";
  else if (viralScore > 0) loopStatus = "Building loop";

  return {
    metrics: {
      spins: spins.length,
      activePlayers,
      newPlayers: players.length,
      referrals: referrals.length,
      cashOffCredited,
      cashOffDebited,
      currentCashOff,
      pendingClaims,
      referralRate,
      averageReferrals,
      viralScore,
      loopStatus,
      activeChallenges,
      cashEligible: cashEligibleChallenges.length,
      cashPayoutDue,
      pendingCashouts,
      dailySpinReady,
      referralBonusSpins,
      shareBonusSpins: shareBonusClaims.length,
    },
    daily,
    distribution: Array.from(distributionMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count })),
    recentActivity: spins.slice(0, 12),
    _warnings: collectWarnings([
      spinsResult,
      playersResult,
      referralsResult,
      accountsResult,
      transactionsResult,
      prizesResult,
      challengesResult,
      cashoutsResult,
      referralAwardsResult,
      shareBonusResult,
    ]),
    deployment: {
      dailyEntitlement: hasColumn(
        playersResult.rows,
        "daily_spin_available"
      ),
      shareBonus: tableIsAvailable(shareBonusResult),
    },
  };
}

async function rewardOperations(
  requestedStatus: string,
  requestedPage: number
) {
  const [
    challengesResult,
    creditsResult,
    cashoutsResult,
    playersResult,
    identitiesResult,
    referralsResult,
    referralAwardsResult,
    shareBonusResult,
    routeLogsResult,
    identityEventsResult,
  ] = await Promise.all([
    safeRows("spin_cash_challenges"),
    safeRows("spin_cash_challenge_credits"),
    safeRows("spin_cashout_requests"),
    safeRows("spin_players"),
    safeRows("identities"),
    safeRows("spin_referrals"),
    safeRows("spin_referral_awards"),
    safeRows("spin_share_bonus_claims"),
    safeRows("referral_route_logs"),
    safeRows("identity_events"),
  ]);

  const players = playersResult.rows;
  const playerMap = new Map(players.map((row) => [row.id, row]));
  const identityMap = new Map(
    identitiesResult.rows.map((row) => [row.id, row])
  );

  const withPlayer = (row: Row): Row => {
    const player = playerMap.get(rowPlayerId(row));
    const identity = identityMap.get(
      row.identity_id ?? player?.identity_id
    );

    return {
      ...row,
      player: player || null,
      identity: identity || null,
      player_name: playerName(player, identity),
      player_phone: playerPhone(player, identity),
    };
  };

  const allChallenges = newestFirst(challengesResult.rows).map(withPlayer);
  const normalizedStatus = requestedStatus.toLowerCase();
  const matchingChallenges = allChallenges.filter(
    (row) =>
      normalizedStatus === "all" ||
      textValue(row.status).toLowerCase() === normalizedStatus
  );
  const pageSize = 24;
  const pageCount = Math.max(
    1,
    Math.ceil(matchingChallenges.length / pageSize)
  );
  const page = Math.min(
    Math.max(1, Math.trunc(requestedPage || 1)),
    pageCount
  );
  const challengeRows = matchingChallenges.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const cashouts = newestFirst(cashoutsResult.rows)
    .slice(0, 100)
    .map(withPlayer);
  const activeChallenges = allChallenges.filter(
    (row) => textValue(row.status).toLowerCase() === "active"
  );
  const eligibleChallenges = allChallenges.filter(
    (row) => textValue(row.status).toLowerCase() === "cash_eligible"
  );
  const convertedChallenges = allChallenges.filter(
    (row) =>
      textValue(row.status).toLowerCase() === "converted_to_cash_off"
  );
  const pendingCashouts = cashoutsResult.rows.filter(
    (row) => textValue(row.status).toLowerCase() === "pending"
  );

  type ReferrerSummary = {
    player_id: string;
    name: string;
    referral_code: string;
    link_opens: number;
    registrations: number;
    rewarded_referrals: number;
    bonus_spins: number;
  };

  const referrerMap = new Map<string, ReferrerSummary>();
  const referrerFor = (playerId: string) => {
    if (!referrerMap.has(playerId)) {
      const player = playerMap.get(playerId);
      const identity = identityMap.get(player?.identity_id);
      referrerMap.set(playerId, {
        player_id: playerId,
        name: playerName(player, identity),
        referral_code: textValue(player?.referral_code),
        link_opens: 0,
        registrations: 0,
        rewarded_referrals: 0,
        bonus_spins: 0,
      });
    }

    return referrerMap.get(playerId)!;
  };

  for (const referral of referralsResult.rows) {
    const playerId = textValue(
      referral.referrer_spin_player_id ??
        referral.referrer_player_id ??
        referral.referrer_id
    );
    if (playerId) referrerFor(playerId).registrations += 1;
  }

  for (const award of referralAwardsResult.rows) {
    const playerId = textValue(
      award.referrer_spin_player_id ?? award.referrer_player_id
    );
    if (!playerId) continue;
    const summary = referrerFor(playerId);
    summary.rewarded_referrals += 1;
    summary.bonus_spins += numberValue(award.spins_awarded);
  }

  const playerIdByCode = new Map(
    players
      .filter((row) => textValue(row.referral_code))
      .map((row) => [textValue(row.referral_code).toLowerCase(), row.id])
  );
  const referralLinkOpens = routeLogsResult.rows.filter(
    (row) => textValue(row.step) === "spin_referral_opened"
  );

  for (const open of referralLinkOpens) {
    const playerId = playerIdByCode.get(
      textValue(open.code).toLowerCase()
    );
    if (playerId) referrerFor(playerId).link_opens += 1;
  }

  const topReferrers = Array.from(referrerMap.values())
    .sort(
      (a, b) =>
        b.registrations - a.registrations ||
        b.link_opens - a.link_opens ||
        b.bonus_spins - a.bonus_spins
    )
    .slice(0, 20);

  const shareClaims = newestFirst(shareBonusResult.rows).map(withPlayer);
  const referralAwards = newestFirst(referralAwardsResult.rows).map((row) =>
    withPlayer({
      ...row,
      spin_player_id:
        row.referrer_spin_player_id ?? row.referrer_player_id,
      identity_id:
        row.referrer_identity_id ?? row.identity_id,
    })
  );
  const recentBonuses = [
    ...shareClaims.slice(0, 60).map((row) => ({
      ...row,
      bonus_type: "share",
      spins_awarded: 1,
    })),
    ...referralAwards.slice(0, 60).map((row) => ({
      ...row,
      bonus_type: "referral",
      spins_awarded: numberValue(row.spins_awarded),
    })),
  ]
    .sort((a, b) => timestampOf(b) - timestampOf(a))
    .slice(0, 60);

  const guideEventTypes = new Set([
    "spin_reward_guide_started",
    "spin_reward_guide_completed",
    "spin_reward_guide_skipped",
  ]);
  const guideEvents = identityEventsResult.rows.filter((row) =>
    guideEventTypes.has(textValue(row.event_type))
  );
  const guideStarted = guideEvents.filter(
    (row) => row.event_type === "spin_reward_guide_started"
  ).length;
  const guideCompleted = guideEvents.filter(
    (row) => row.event_type === "spin_reward_guide_completed"
  ).length;
  const guideSkipped = guideEvents.filter(
    (row) => row.event_type === "spin_reward_guide_skipped"
  ).length;

  const firstTrackedOpenAt = referralLinkOpens.reduce(
    (earliest, row) => {
      const time = timestampOf(row);
      return time && (!earliest || time < earliest) ? time : earliest;
    },
    0
  );
  const referralRegistrations = firstTrackedOpenAt
    ? referralsResult.rows.filter(
        (row) => timestampOf(row) >= firstTrackedOpenAt
      ).length
    : 0;
  const referralConversionRate = referralLinkOpens.length
    ? (referralRegistrations / referralLinkOpens.length) * 100
    : 0;

  return {
    metrics: {
      activeChallenges: activeChallenges.length,
      activeChallengeCash: activeChallenges.reduce(
        (sum, row) => sum + numberValue(row.cash_balance),
        0
      ),
      cashEligible: eligibleChallenges.length,
      cashPayoutDue: eligibleChallenges.reduce(
        (sum, row) => sum + numberValue(row.cash_balance),
        0
      ),
      convertedChallenges: convertedChallenges.length,
      convertedCashOff: convertedChallenges.reduce(
        (sum, row) => sum + numberValue(row.converted_cash_off_amount),
        0
      ),
      challengeCashCredited: creditsResult.rows.reduce(
        (sum, row) => sum + numberValue(row.amount_credited),
        0
      ),
      pendingCashouts: pendingCashouts.length,
      pendingCashoutAmount: pendingCashouts.reduce(
        (sum, row) => sum + numberValue(row.amount),
        0
      ),
      dailySpinReady: hasColumn(players, "daily_spin_available")
        ? players.filter((row) => Boolean(row.daily_spin_available)).length
        : 0,
      referralLinkOpens: referralLinkOpens.length,
      referralRegistrations,
      referralConversionRate,
      referralBonusSpins: referralAwardsResult.rows.reduce(
        (sum, row) => sum + numberValue(row.spins_awarded),
        0
      ),
      shareBonusSpins: shareBonusResult.rows.length,
      guideStarted,
      guideCompleted,
      guideSkipped,
      guideCompletionRate: guideStarted
        ? (guideCompleted / guideStarted) * 100
        : 0,
    },
    challenges: challengeRows,
    challengePagination: {
      page,
      pageSize,
      pageCount,
      total: matchingChallenges.length,
      status: normalizedStatus,
    },
    cashouts,
    topReferrers,
    recentBonuses,
    recentGuideEvents: newestFirst(guideEvents).slice(0, 40),
    deployment: {
      dailyEntitlement: hasColumn(players, "daily_spin_available"),
      shareBonus: tableIsAvailable(shareBonusResult),
      referralOpenTracking: referralLinkOpens.length > 0,
      guideTracking: guideEvents.length > 0,
    },
    _warnings: collectWarnings([
      challengesResult,
      creditsResult,
      cashoutsResult,
      playersResult,
      identitiesResult,
      referralsResult,
      referralAwardsResult,
      shareBonusResult,
      routeLogsResult,
      identityEventsResult,
    ]),
  };
}

async function users(search: string) {
  const [playersResult, accountsResult, identitiesResult] =
    await Promise.all([
      safeRows("spin_players"),
      safeRows("cash_off_accounts"),
      safeRows("identities"),
    ]);

  const identityMap = new Map(
    identitiesResult.rows.map((row) => [row.id, row])
  );
  const accountMap = new Map(
    accountsResult.rows.map((row) => [row.identity_id, row])
  );

  const query = search.trim().toLowerCase();

  const rows = newestFirst(playersResult.rows)
    .filter((player) => {
      if (!query) return true;
      const identity = identityMap.get(player.identity_id);
      const haystack = [
        playerName(player, identity),
        playerPhone(player, identity),
        identity?.primary_email,
        player.email,
        player.referral_code,
        identity?.identity_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .slice(0, 250)
    .map((player) => ({
      ...player,
      identity: identityMap.get(player.identity_id) || null,
      cashOffAccount:
        accountMap.get(player.identity_id) || null,
    }));

  return {
    rows,
    _warnings: collectWarnings([
      playersResult,
      accountsResult,
      identitiesResult,
    ]),
  };
}

async function userDetail(playerId: string) {
  const [
    playersResult,
    identitiesResult,
    accountsResult,
    transactionsResult,
    spinsResult,
    prizesResult,
    referralsResult,
    challengesResult,
    challengeCreditsResult,
    cashoutsResult,
    referralAwardsResult,
    shareBonusResult,
    identityEventsResult,
  ] = await Promise.all([
    safeRows("spin_players"),
    safeRows("identities"),
    safeRows("cash_off_accounts"),
    safeRows("cash_off_transactions"),
    safeRows("spin_logs"),
    safeRows("spin_user_prizes"),
    safeRows("spin_referrals"),
    safeRows("spin_cash_challenges"),
    safeRows("spin_cash_challenge_credits"),
    safeRows("spin_cashout_requests"),
    safeRows("spin_referral_awards"),
    safeRows("spin_share_bonus_claims"),
    safeRows("identity_events"),
  ]);

  const player = playersResult.rows.find(
    (row) => row.id === playerId
  );

  if (!player) throw new Error("Spin player not found.");

  const identity = identitiesResult.rows.find(
    (row) => row.id === player.identity_id
  );

  const account = accountsResult.rows.find(
    (row) => row.identity_id === player.identity_id
  );

  return {
    player,
    identity: identity || null,
    cashOffAccount: account || null,
    transactions: newestFirst(
      transactionsResult.rows.filter(
        (row) => row.identity_id === player.identity_id
      )
    ).slice(0, 50),
    spins: newestFirst(
      spinsResult.rows.filter(
        (row) =>
          (row.spin_player_id ?? row.player_id) === player.id
      )
    ).slice(0, 50),
    prizes: newestFirst(
      prizesResult.rows.filter(
        (row) =>
          (row.spin_player_id ?? row.player_id) === player.id
      )
    ).slice(0, 50),
    referrals: newestFirst(
      referralsResult.rows.filter(
        (row) =>
          row.referrer_spin_player_id === player.id ||
          row.referred_spin_player_id === player.id ||
          row.referrer_player_id === player.id ||
          row.referred_player_id === player.id
      )
    ).slice(0, 50),
    challenges: newestFirst(
      challengesResult.rows.filter(
        (row) =>
          rowPlayerId(row) === player.id ||
          row.identity_id === player.identity_id
      )
    ).slice(0, 20),
    challengeCredits: newestFirst(
      challengeCreditsResult.rows.filter(
        (row) =>
          rowPlayerId(row) === player.id ||
          row.identity_id === player.identity_id
      )
    ).slice(0, 50),
    cashouts: newestFirst(
      cashoutsResult.rows.filter(
        (row) =>
          rowPlayerId(row) === player.id ||
          row.identity_id === player.identity_id
      )
    ).slice(0, 20),
    referralAwards: newestFirst(
      referralAwardsResult.rows.filter(
        (row) =>
          row.referrer_spin_player_id === player.id ||
          row.referred_spin_player_id === player.id ||
          row.referrer_identity_id === player.identity_id ||
          row.referred_identity_id === player.identity_id
      )
    ).slice(0, 50),
    shareBonusClaims: newestFirst(
      shareBonusResult.rows.filter(
        (row) => rowPlayerId(row) === player.id
      )
    ).slice(0, 50),
    guideEvents: newestFirst(
      identityEventsResult.rows.filter(
        (row) =>
          row.identity_id === player.identity_id &&
          textValue(row.event_type).startsWith("spin_reward_guide_")
      )
    ).slice(0, 30),
    deployment: {
      dailyEntitlement: Object.prototype.hasOwnProperty.call(
        player,
        "daily_spin_available"
      ),
      shareBonus: tableIsAvailable(shareBonusResult),
    },
    _warnings: collectWarnings([
      playersResult,
      identitiesResult,
      accountsResult,
      transactionsResult,
      spinsResult,
      prizesResult,
      referralsResult,
      challengesResult,
      challengeCreditsResult,
      cashoutsResult,
      referralAwardsResult,
      shareBonusResult,
      identityEventsResult,
    ]),
  };
}

function normalizeSettings(rows: Row[]) {
  return rows.map((row) => ({
    ...row,
    setting_key:
      row.setting_key ?? row.key ?? row.name ?? row.id,
    setting_value:
      row.setting_value ??
      row.value ??
      row.config_value ??
      row.settings_value ??
      null,
  }));
}

async function tableSample(table: string) {
  const result = await safeRows(table, 1);
  return result.rows[0] || null;
}

async function sanitizeRecord(table: string, record: Row) {
  const sample = await tableSample(table);

  if (!sample) {
    return Object.fromEntries(
      Object.entries(record).filter(
        ([key, value]) =>
          key !== "id" && value !== undefined
      )
    );
  }

  const keys = new Set(Object.keys(sample));

  return Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) =>
        key !== "id" && keys.has(key) && value !== undefined
    )
  );
}

async function saveRecord(table: string, rawRecord: Row) {
  const id = rawRecord.id;
  const record = await sanitizeRecord(table, rawRecord);

  if (!Object.keys(record).length) {
    throw new Error(`No editable fields were found for ${table}.`);
  }

  const query = id
    ? db.from(table).update(record).eq("id", id)
    : db.from(table).insert(record);

  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function deleteRecord(table: string, id: string) {
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return deny();

  try {
    const section =
      req.nextUrl.searchParams.get("section") || "overview";

    if (section === "overview") {
      const now = new Date();
      const from =
        req.nextUrl.searchParams.get("from") ||
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        ).toISOString();
      const to =
        req.nextUrl.searchParams.get("to") ||
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999
        ).toISOString();

      return NextResponse.json({
        ok: true,
        data: await overview(from, to),
      });
    }

    if (section === "operations") {
      const status =
        req.nextUrl.searchParams.get("status") || "all";
      const page = Number(
        req.nextUrl.searchParams.get("page") || "1"
      );

      return NextResponse.json({
        ok: true,
        data: await rewardOperations(status, page),
      });
    }

    if (section === "prizes") {
      const result = await safeRows("spin_prizes");
      return NextResponse.json({
        ok: true,
        data: newestFirst(result.rows),
        warnings: result.warning ? [result.warning] : [],
      });
    }

    if (section === "rules") {
      const [
        groupsResult,
        itemsResult,
        settingsResult,
        lettersResult,
      ] = await Promise.all([
        safeRows("spin_rule_groups"),
        safeRows("spin_rule_items"),
        safeRows("spin_game_settings"),
        safeRows("spin_letter_segments"),
      ]);

      const groups = [...groupsResult.rows].sort(
        (a, b) =>
          numberValue(a.priority) - numberValue(b.priority) ||
          numberValue(a.start_spin) - numberValue(b.start_spin)
      );

      const items = [...itemsResult.rows].sort(
        (a, b) =>
          textValue(a.group_id).localeCompare(
            textValue(b.group_id)
          ) ||
          numberValue(a.item_order) - numberValue(b.item_order)
      );

      return NextResponse.json({
        ok: true,
        data: {
          groups,
          items,
          settings: normalizeSettings(settingsResult.rows),
          letters: [...lettersResult.rows].sort(
            (a, b) =>
              numberValue(a.segment_order) -
              numberValue(b.segment_order)
          ),
          _warnings: collectWarnings([
            groupsResult,
            itemsResult,
            settingsResult,
            lettersResult,
          ]),
        },
      });
    }

    if (section === "claims") {
      const status =
        req.nextUrl.searchParams.get("status") || "all";

      const [claimsResult, playersResult] = await Promise.all([
        safeRows("spin_user_prizes"),
        safeRows("spin_players"),
      ]);

      const playerMap = new Map(
        playersResult.rows.map((row) => [row.id, row])
      );

      const rows = newestFirst(claimsResult.rows)
        .filter(
          (row) =>
            status === "all" ||
            textValue(row.status).toLowerCase() ===
              status.toLowerCase()
        )
        .slice(0, 400)
        .map((row) => ({
          ...row,
          player:
            playerMap.get(
              row.spin_player_id ?? row.player_id
            ) || null,
        }));

      return NextResponse.json({
        ok: true,
        data: rows,
        warnings: collectWarnings([
          claimsResult,
          playersResult,
        ]),
      });
    }

    if (section === "cashoff") {
      const [accountsResult, transactionsResult] =
        await Promise.all([
          safeRows("cash_off_accounts"),
          safeRows("cash_off_transactions"),
        ]);

      const { map: identityMap, warning } =
        await identityMapFor(
          accountsResult.rows
            .map((row) => row.identity_id)
            .filter(Boolean)
        );

      return NextResponse.json({
        ok: true,
        data: {
          accounts: [...accountsResult.rows]
            .sort(
              (a, b) =>
                numberValue(b.balance) -
                numberValue(a.balance)
            )
            .slice(0, 400)
            .map((row) => ({
              ...row,
              identity:
                identityMap.get(row.identity_id) || null,
            })),
          transactions: newestFirst(
            transactionsResult.rows
          ).slice(0, 400),
          _warnings: [
            ...collectWarnings([
              accountsResult,
              transactionsResult,
            ]),
            ...(warning ? [warning] : []),
          ],
        },
      });
    }

    if (section === "users") {
      const search =
        req.nextUrl.searchParams.get("q") || "";
      const result = await users(search);

      return NextResponse.json({
        ok: true,
        data: result.rows,
        warnings: result._warnings,
      });
    }

    if (section === "user") {
      const playerId =
        req.nextUrl.searchParams.get("playerId") || "";

      return NextResponse.json({
        ok: true,
        data: await userDetail(playerId),
      });
    }

    if (section === "logs") {
      const resultType =
        req.nextUrl.searchParams.get("resultType") || "all";
      const result = await safeRows("spin_logs");

      const rows = newestFirst(result.rows)
        .filter(
          (row) =>
            resultType === "all" ||
            textValue(row.result_type).toLowerCase() ===
              resultType.toLowerCase()
        )
        .slice(0, 500);

      return NextResponse.json({
        ok: true,
        data: rows,
        warnings: result.warning ? [result.warning] : [],
      });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown admin section." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The admin request failed.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return deny();

  try {
    const body = await req.json();
    const action = textValue(body.action);

    if (action === "login") {
      return NextResponse.json({ ok: true });
    }

    if (action === "save_prize") {
      const record = {
        ...body.record,
        label: textValue(body.record?.label),
        prize_type:
          textValue(body.record?.prize_type) || "cash",
        gravity: numberValue(body.record?.gravity || 1),
        stock: numberValue(body.record?.stock),
        monetary_value: numberValue(
          body.record?.monetary_value
        ),
        is_active: Boolean(body.record?.is_active),
        on_wheel: Boolean(body.record?.on_wheel),
        near_miss: Boolean(body.record?.near_miss),
      };

      if (!record.label) {
        throw new Error("Prize label is required.");
      }

      return NextResponse.json({
        ok: true,
        data: await saveRecord("spin_prizes", record),
      });
    }

    if (action === "delete_prize") {
      await deleteRecord("spin_prizes", body.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "save_group") {
      const record = {
        ...body.record,
        group_key: textValue(body.record?.group_key),
        group_name: textValue(body.record?.group_name),
        group_type:
          textValue(body.record?.group_type) || "weighted",
        start_spin: Math.max(
          1,
          numberValue(body.record?.start_spin)
        ),
        end_spin:
          body.record?.end_spin === "" ||
          body.record?.end_spin === null ||
          body.record?.end_spin === undefined
            ? null
            : numberValue(body.record.end_spin),
        priority: numberValue(body.record?.priority || 100),
        is_active: Boolean(body.record?.is_active),
        description:
          textValue(body.record?.description) || null,
        updated_at: new Date().toISOString(),
      };

      if (!record.group_key || !record.group_name) {
        throw new Error(
          "Group key and group name are required."
        );
      }

      return NextResponse.json({
        ok: true,
        data: await saveRecord(
          "spin_rule_groups",
          record
        ),
      });
    }

    if (action === "delete_group") {
      const { error: itemError } = await db
        .from("spin_rule_items")
        .delete()
        .eq("group_id", body.id);

      if (itemError) throw new Error(itemError.message);

      await deleteRecord("spin_rule_groups", body.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "save_item") {
      const record = {
        ...body.record,
        group_id: textValue(body.record?.group_id),
        item_key: textValue(body.record?.item_key),
        result_label: textValue(body.record?.result_label),
        result_type:
          textValue(body.record?.result_type) || "cash",
        cash_amount: numberValue(body.record?.cash_amount),
        letter_code:
          textValue(body.record?.letter_code) || null,
        bonus_spins: numberValue(body.record?.bonus_spins),
        gravity: numberValue(body.record?.gravity || 1),
        item_order: numberValue(
          body.record?.item_order || 1
        ),
        max_uses_per_user: numberValue(
          body.record?.max_uses_per_user || 999
        ),
        is_active: Boolean(body.record?.is_active),
        updated_at: new Date().toISOString(),
      };

      if (
        !record.group_id ||
        !record.item_key ||
        !record.result_label
      ) {
        throw new Error(
          "Group, item key and result label are required."
        );
      }

      return NextResponse.json({
        ok: true,
        data: await saveRecord(
          "spin_rule_items",
          record
        ),
      });
    }

    if (action === "delete_item") {
      await deleteRecord("spin_rule_items", body.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "save_setting") {
      const sample = await tableSample(
        "spin_game_settings"
      );

      const keyColumn =
        sample && "setting_key" in sample
          ? "setting_key"
          : sample && "key" in sample
            ? "key"
            : "setting_key";

      const valueColumn =
        sample && "setting_value" in sample
          ? "setting_value"
          : sample && "value" in sample
            ? "value"
            : "setting_value";

      const { data: existing, error: findError } =
        await db
          .from("spin_game_settings")
          .select("*")
          .eq(keyColumn, body.key)
          .limit(1);

      if (findError) throw new Error(findError.message);

      const record: Row = {
        [keyColumn]: body.key,
        [valueColumn]: body.value,
      };

      if (!sample || "updated_at" in sample) {
        record.updated_at = new Date().toISOString();
      }

      const query =
        existing && existing.length
          ? db
              .from("spin_game_settings")
              .update(record)
              .eq(keyColumn, body.key)
          : db.from("spin_game_settings").insert(record);

      const { data, error } = await query
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, data });
    }

    if (action === "claim_status") {
      const nextStatus = textValue(body.status);
      const rawRecord: Row = {
        id: body.id,
        status: nextStatus,
        claimed_at:
          nextStatus === "claimed"
            ? new Date().toISOString()
            : null,
      };

      return NextResponse.json({
        ok: true,
        data: await saveRecord(
          "spin_user_prizes",
          rawRecord
        ),
      });
    }

    if (action === "cashout_status") {
      const nextStatus = textValue(body.status).toLowerCase();
      const allowedStatuses = new Set(["pending", "paid", "rejected"]);

      if (!allowedStatuses.has(nextStatus)) {
        throw new Error("Cashout status must be pending, paid or rejected.");
      }

      const { data: current, error: currentError } = await db
        .from("spin_cashout_requests")
        .select("*")
        .eq("id", body.id)
        .single();

      if (currentError) throw new Error(currentError.message);

      const changedAt = new Date().toISOString();
      const note = textValue(body.note).slice(0, 500);
      const auditLine = `[${changedAt}] ${textValue(current.status) || "unknown"} -> ${nextStatus}${
        note ? `: ${note}` : ""
      }`;
      const adminNote = [auditLine, textValue(current.admin_note)]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000);

      const { data, error } = await db
        .from("spin_cashout_requests")
        .update({
          status: nextStatus,
          paid_at: nextStatus === "paid" ? changedAt : null,
          admin_note: adminNote,
        })
        .eq("id", body.id)
        .select("*")
        .single();

      if (error) throw new Error(error.message);

      const { error: auditError } = await db.from("identity_events").insert({
        identity_id: current.identity_id || null,
        event_type: "spin_cashout_status_updated",
        title: `Cashout marked ${nextStatus}`,
        description: note || "Updated from the EmmyTech admin panel.",
        metadata: {
          cashout_request_id: current.id,
          previous_status: current.status,
          next_status: nextStatus,
          amount: numberValue(current.amount),
          panel: "emmy40",
        },
      });

      return NextResponse.json({
        ok: true,
        data,
        warnings: auditError
          ? [`Audit timeline: ${auditError.message}`]
          : [],
      });
    }

    if (action === "add_spins") {
      const amount = Number(body.amount || 0);

      if (!Number.isInteger(amount) || amount === 0) {
        throw new Error(
          "Spin adjustment must be a non-zero whole number."
        );
      }

      const { data: player, error: playerError } =
        await db
          .from("spin_players")
          .select("*")
          .eq("id", body.playerId)
          .single();

      if (playerError) {
        throw new Error(playerError.message);
      }

      const next = Math.max(
        0,
        numberValue(player.spins_remaining) + amount
      );

      const update: Row = { spins_remaining: next };

      if ("updated_at" in player) {
        update.updated_at = new Date().toISOString();
      }

      const { data, error } = await db
        .from("spin_players")
        .update(update)
        .eq("id", body.playerId)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, data });
    }

    if (action === "cashoff_adjust") {
      const amount = numberValue(body.amount);

      if (amount === 0) {
        throw new Error(
          "Cash Off adjustment cannot be zero."
        );
      }

      const direction = amount > 0 ? "credit" : "debit";
      const transactionType =
        amount > 0 ? "admin_credit" : "admin_debit";

      const args = {
        p_identity_id: body.identityId,
        p_direction: direction,
        p_amount: Math.abs(amount),
        p_transaction_type: transactionType,
        p_source_system: "emmy40_admin",
        p_source_reference: null,
        p_order_reference: null,
        p_spin_log_id: null,
        p_created_by: null,
        p_reason:
          textValue(body.reason) || "Admin adjustment",
        p_metadata: { panel: "emmy40" },
        p_idempotency_key:
          textValue(body.idempotencyKey) ||
          `emmy40-${body.identityId}-${Date.now()}`,
      };

      const functionNames = [
        "cash_off_apply_transaction",
        "apply_cash_off_transaction",
        "post_cash_off_transaction",
        "adjust_cash_off_balance",
      ];

      const errors: string[] = [];

      for (const functionName of functionNames) {
        const { data, error } = await db.rpc(
          functionName,
          args
        );

        if (!error) {
          return NextResponse.json({
            ok: true,
            data,
            functionName,
          });
        }

        errors.push(`${functionName}: ${error.message}`);
      }

      throw new Error(
        `Cash Off adjustment function was not found. ${errors.join(
          " | "
        )}`
      );
    }

    return NextResponse.json(
      { ok: false, error: "Unknown admin action." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The admin action failed.",
      },
      { status: 500 }
    );
  }
}
