"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

type HelpArticle = {
  title: string;
  summary: string;
  calculation: string;
  data: string;
  action: string;
};

const helpArticles = {
  "campaign-overview": {
    title: "Campaign overview",
    summary:
      "A high-level view of how the Spin & Save campaign is performing during the selected reporting period.",
    calculation:
      "The page combines spin activity, unique active players, referrals, Cash Off movements, challenge balances and recent outcomes.",
    data:
      "Most activity metrics use the selected From and To dates. Current liabilities and open reward records use their latest database state.",
    action:
      "Start here each day. Check unusual changes, then open Reward Operations, Prize Claims or Cash Off for the underlying records.",
  },
  "report-period": {
    title: "Report period",
    summary:
      "Controls the date range used by period-based metrics and activity lists on the overview page.",
    calculation:
      "Records are included when their created or updated timestamp falls between the selected From and To values.",
    data:
      "Spin logs, referrals, players created, Cash Off transactions and bonus awards are filtered by this range.",
    action:
      "Use one day for operational checks, seven days for campaign trends and a full month for management reporting.",
  },
  "total-spins": {
    title: "Total spins",
    summary: "The number of spin-log records created in the selected period.",
    calculation: "Each completed spin contributes one record and counts as one spin.",
    data: "Spin logs inside the selected From and To dates.",
    action:
      "Compare this with active players. A high spin count with few players may mean a small group is using most available spins.",
  },
  "active-players": {
    title: "Active players",
    summary: "Unique players who completed at least one spin in the selected period.",
    calculation:
      "The dashboard collects player IDs from spin logs and counts each player only once.",
    data: "Spin logs inside the selected From and To dates.",
    action:
      "Use this as the main participation measure. Compare it with referrals and total spins to judge campaign reach and repeat use.",
  },
  "new-referrals": {
    title: "New referrals",
    summary: "Referral registrations recorded during the selected period.",
    calculation: "Every referral record created in the period counts once.",
    data: "Spin referral records inside the selected From and To dates.",
    action:
      "Compare this with active players and referral-link visits to see whether users are sharing and whether those visits convert.",
  },
  "cash-off-credited": {
    title: "Cash Off credited",
    summary:
      "The total Cash Off value added to customer accounts during the selected period.",
    calculation:
      "Adds the amount of Cash Off transactions whose direction is credit.",
    data: "Cash Off transactions inside the selected From and To dates.",
    action:
      "Watch for sudden increases and confirm they match campaign rules, spin volumes and approved manual adjustments.",
  },
  "active-challenges": {
    title: "Active Cash Challenges",
    summary: "Players currently progressing toward the cash withdrawal target.",
    calculation:
      "Counts Cash Challenge records whose current status is active.",
    data:
      "Current Cash Challenge records. This is a live status count, not limited to the overview date range.",
    action:
      "Review the challenge queue to identify players nearing the target or deadline.",
  },
  "cash-payout-due": {
    title: "Cash payout due",
    summary:
      "The combined challenge balance currently eligible to be paid as cash.",
    calculation:
      "Adds cash_balance for every Cash Challenge whose status is cash_eligible.",
    data: "Current Cash Challenge records.",
    action:
      "Treat this as an immediate operational liability. Confirm requests, payment details and audit notes before marking anything paid.",
  },
  "daily-spins-ready": {
    title: "Daily spins ready",
    summary: "Players currently holding an unused daily-spin entitlement.",
    calculation:
      "Counts players whose daily_spin_available field is true. It returns zero when that column is not deployed.",
    data: "Current player records.",
    action:
      "Use this to understand how many users can return and spin today. A persistent backlog may require better reminder messaging.",
  },
  "bonus-spins": {
    title: "Bonus spins awarded",
    summary: "Growth spins issued through referrals and approved share claims.",
    calculation:
      "Referral spins are summed from spins_awarded; each recorded share claim contributes one spin.",
    data: "Referral-award and share-bonus records in the selected overview period.",
    action:
      "Check that bonus volume is supported by real referrals and valid share actions.",
  },
  "spin-trend": {
    title: "Spin activity trend",
    summary: "Daily spin volume across the last seven calendar days ending at the report end date.",
    calculation: "Groups spin logs by date and counts the records for each day.",
    data: "Spin logs matching the selected reporting period.",
    action:
      "Look for campaign peaks, drop-offs and the effect of promotions, reminders or referral activity.",
  },
  "viral-score": {
    title: "Campaign health and viral score",
    summary:
      "An indicator of how strongly active players are producing additional referred players.",
    calculation:
      "Referral rate = unique referrers ÷ active players. Average referrals = referral registrations ÷ unique referrers. Viral score = referral rate as a decimal × average referrals. Scores of 1 or more are labelled Viral loop; 0.5–0.99 Referral loop; above 0 Building loop.",
    data: "Active spins and referrals inside the selected reporting period.",
    action:
      "Improve either the percentage of players who refer or the number of successful referrals per referrer.",
  },
  "cash-off-liability": {
    title: "Current Cash Off liability",
    summary:
      "The total unused Cash Off currently held across all customer accounts.",
    calculation: "Adds the current balance from every Cash Off account.",
    data:
      "Current account balances. This is a live liability and is not restricted to the selected date range.",
    action:
      "Use it for fulfilment and sales planning. Investigate unexpected growth or balances that remain unused for a long time.",
  },
  "prize-distribution": {
    title: "Prize distribution",
    summary: "How often each result appeared in the selected period.",
    calculation:
      "Groups spin logs by result label and counts each occurrence, ordered from most common to least common.",
    data: "Spin logs inside the selected reporting period.",
    action:
      "Compare the real distribution with the configured rule weights and stock limits.",
  },
  "recent-spins": {
    title: "Recent spin activity",
    summary: "The newest spin results inside the selected period.",
    calculation: "Spin records are ordered by timestamp, newest first.",
    data: "Spin logs inside the selected reporting period.",
    action:
      "Use this as a quick anomaly check before opening the full Audit Logs page.",
  },
  "reward-operations": {
    title: "Reward operations",
    summary:
      "The operational workspace for Cash Challenges, cashout decisions, daily spins, referrals and reward-guide tracking.",
    calculation:
      "The page combines current challenge and payout states with referral, share-bonus and guide-event ledgers.",
    data: "Current reward-operation tables and tracking events.",
    action:
      "Use it to clear payout work, confirm campaign tracking and investigate growth performance.",
  },
  "system-status": {
    title: "System status",
    summary:
      "Shows whether the database structures needed for each newer reward feature are available and receiving data.",
    calculation:
      "A feature is ready when its expected table or column is present. Some trackers remain in a waiting state until their first event arrives.",
    data:
      "Schema availability and recent records for daily spins, share bonuses, referral opens and reward-guide events.",
    action:
      "A missing state needs deployment work. A waiting state usually needs a real test event rather than a schema change.",
  },
  "challenge-cash": {
    title: "Active challenge cash",
    summary: "Total cash balance currently held inside active Cash Challenges.",
    calculation:
      "Adds cash_balance for every challenge whose status is active.",
    data: "Current Cash Challenge records.",
    action:
      "Use this to understand the value that may later become either a payout or converted Cash Off.",
  },
  "pending-cashouts": {
    title: "Pending cashouts",
    summary: "Cashout requests that still need an admin decision.",
    calculation: "Counts cashout requests whose status is pending.",
    data: "Current cashout-request records.",
    action:
      "Review each request, confirm payment information and leave an audit note before changing its status.",
  },
  "converted-cash-off": {
    title: "Converted to Cash Off",
    summary:
      "Challenge value already converted from cash-challenge balance into Cash Off credit.",
    calculation:
      "Adds converted_cash_off_amount for challenges whose status is converted_to_cash_off.",
    data: "Current Cash Challenge records.",
    action:
      "Confirm conversion totals agree with the Cash Off ledger and campaign expiry rules.",
  },
  "referral-funnel": {
    title: "Referral funnel",
    summary: "The percentage of tracked referral-link visits that became referrals.",
    calculation:
      "Referral conversion rate = registrations recorded after tracking began ÷ tracked referral-link opens × 100.",
    data: "Referral-open route logs and referral registrations.",
    action:
      "Low conversion may mean unclear landing-page messaging, weak trust or registration friction.",
  },
  "bonus-ledger": {
    title: "Bonus-spin ledger",
    summary: "Spins issued through referral and share actions.",
    calculation:
      "Adds referral spins_awarded to the number of share-bonus claim records.",
    data: "Referral-award and share-bonus ledgers.",
    action:
      "Use the recent attribution feed to verify who received each growth reward.",
  },
  "reward-guide": {
    title: "Reward education",
    summary:
      "How many players who started the reward guide completed it rather than skipping it.",
    calculation: "Completion rate = completed guide events ÷ started guide events × 100.",
    data: "Reward-guide started, completed and skipped events.",
    action:
      "A low completion rate suggests the guide is too long, unclear or appearing at the wrong moment.",
  },
  "challenge-queue": {
    title: "Cash Challenge queue",
    summary: "The searchable operational list of player Cash Challenges.",
    calculation:
      "Rows are filtered by the selected status and paginated by the API.",
    data: "Cash Challenge records joined to player identity information.",
    action:
      "Use status filters to focus on active, cash-eligible, converted or closed challenges.",
  },
  "cashout-requests": {
    title: "Cashout requests",
    summary: "Requests awaiting or recording a cash-payment decision.",
    calculation:
      "The pending amount adds request amounts whose status is pending. Status actions are recorded for audit.",
    data: "Cashout request records and player details.",
    action:
      "Verify every payment outside the app before marking it paid. Use Reject or Reopen only with a clear note.",
  },
  "top-referrers": {
    title: "Top referrers",
    summary: "Players ranked by the referrals they generated.",
    calculation:
      "Ranks registrations first, then tracked link opens, then awarded bonus spins.",
    data: "Referral registrations, referral-open logs and referral-award records.",
    action:
      "Recognise strong referrers and investigate high visit counts that do not lead to registrations.",
  },
  "bonus-activity": {
    title: "Referral and share bonuses",
    summary: "The newest growth-reward awards and who received them.",
    calculation:
      "Combines referral awards and share claims, orders them by date and shows the newest records.",
    data: "Referral-award and share-bonus ledgers.",
    action:
      "Use it to verify attribution and investigate duplicated or unexpected bonus awards.",
  },
  prizes: {
    title: "Wheel prizes",
    summary: "The reward segments that may appear on the visible wheel.",
    calculation:
      "Prize type, value, gravity, stock, active state and wheel visibility affect how the reward is presented and selected.",
    data: "Spin prize configuration records.",
    action:
      "Keep labels clear, stock accurate and inactive rewards off the wheel. Test rule behaviour after changing gravity or type.",
  },
  rules: {
    title: "Spin rules",
    summary:
      "The rule engine that decides which reward set and probability logic applies to each spin.",
    calculation:
      "Groups are evaluated by spin range and priority. Items inside the selected group carry result type, value, gravity and usage limits.",
    data: "Game settings, rule groups, rule items and letter segments.",
    action:
      "Change one rule at a time, test with fake users and review Audit Logs before moving the configuration to production.",
  },
  "rule-groups": {
    title: "Rule groups",
    summary: "Containers that apply a reward formula to a range of spin numbers.",
    calculation:
      "The lower priority value wins when more than one active group can apply. Start and end spin define the eligible range.",
    data: "Spin rule-group records.",
    action:
      "Avoid overlapping active groups unless the priority order is intentional and tested.",
  },
  "rule-items": {
    title: "Rule items",
    summary: "The individual outcomes available inside the selected rule group.",
    calculation:
      "Gravity controls relative selection weight; maximum uses limits repeat wins per user; result type controls reward handling.",
    data: "Spin rule-item records for the selected group.",
    action:
      "Check that every active group has valid items and that total weights, values and usage limits match the campaign plan.",
  },
  claims: {
    title: "Prize claims",
    summary: "Non-retry rewards that require fulfilment or status tracking.",
    calculation:
      "Claims are displayed by their current status and can be moved through available, claimed or cancelled states.",
    data: "User prize records joined to player information.",
    action:
      "Confirm fulfilment evidence before marking a reward claimed. Use cancellation only with a documented reason outside the panel.",
  },
  cashoff: {
    title: "Cash Off control",
    summary: "Current customer Cash Off balances and the transaction ledger behind them.",
    calculation:
      "Balances reflect credits minus debits. Manual adjustments create an additional immutable transaction record.",
    data: "Cash Off accounts, identities and Cash Off transactions.",
    action:
      "Never change a balance without a clear reason. Check the ledger before making a corrective adjustment.",
  },
  users: {
    title: "User database",
    summary:
      "A joined operational view of player identity, spins, referrals, rewards and Cash Off.",
    calculation:
      "Search matches available identity and player fields; opening a user loads their related reward history.",
    data: "Player, identity, account, spin, referral, prize, challenge and bonus records.",
    action:
      "Use this page for customer support and investigation. Confirm the correct identity before adjusting spins or Cash Off.",
  },
  logs: {
    title: "Audit logs",
    summary: "Detailed spin outcomes and the balance movement attached to them.",
    calculation:
      "Each row is a spin record enriched with rule source, challenge credit, wallet values and Cash Off values where available.",
    data: "Spin logs and related reward fields.",
    action:
      "Use this page to explain a result, verify rule behaviour and investigate unexpected balance changes.",
  },
  "prize-editor": {
    title: "Prize editor",
    summary: "Creates or changes one visible wheel prize.",
    calculation:
      "The value is the Cash Off amount attached to the prize. Gravity is a relative selection weight; stock limits availability.",
    data: "One spin-prize configuration record.",
    action:
      "Keep advanced settings unchanged unless you understand how the rule engine uses them, then test the wheel before deployment.",
  },
  "group-editor": {
    title: "Rule group editor",
    summary: "Creates or changes the range and type of a rule group.",
    calculation:
      "Start/end spin determine eligibility. Priority resolves overlap. Group type determines fixed, weighted or checkpoint behaviour.",
    data: "One spin rule-group record.",
    action:
      "Check for range overlap and confirm the group contains valid items before activating it.",
  },
  "item-editor": {
    title: "Rule item editor",
    summary: "Creates or changes one possible reward inside a rule group.",
    calculation:
      "Result type controls fulfilment; Cash Off, letter and bonus values provide the reward; gravity controls relative weight.",
    data: "One spin rule-item record.",
    action:
      "Use stable item keys, set realistic per-user limits and test the containing group after saving.",
  },
  "cashoff-adjustment": {
    title: "Cash Off adjustment",
    summary: "Adds or removes Cash Off from one customer account.",
    calculation:
      "A positive amount credits the account; a negative amount debits it. The API writes an idempotent transaction entry.",
    data: "The selected identity's Cash Off account and transaction ledger.",
    action:
      "Confirm the customer and enter a specific reason. Avoid repeating the action if the first request is still processing.",
  },
  "user-details": {
    title: "User details",
    summary: "A complete support view for one player.",
    calculation:
      "Combines current balances and entitlements with recent spins, challenges, rewards, referrals, guide events and cashouts.",
    data: "Records connected to the selected player and identity.",
    action:
      "Verify the identity before changing spins or Cash Off, then use the activity history to explain the account state.",
  },
} satisfies Record<string, HelpArticle>;

export type HelpKey = keyof typeof helpArticles;

type HelpContextValue = (topic: HelpKey) => void;

const HelpContext = createContext<HelpContextValue | null>(null);

export function AdminHelpProvider({ children }: { children: ReactNode }) {
  const [topic, setTopic] = useState<HelpKey | null>(null);

  useEffect(() => {
    if (!topic) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTopic(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [topic]);

  return (
    <HelpContext.Provider value={setTopic}>
      {children}
      {topic && (
        <HelpDrawer topic={topic} close={() => setTopic(null)} />
      )}
    </HelpContext.Provider>
  );
}

export function HelpButton({
  topic,
  label,
}: {
  topic: HelpKey;
  label?: string;
}) {
  const openHelp = useContext(HelpContext);

  return (
    <button
      type="button"
      className="e40-help-button"
      aria-label={label || `Explain ${helpArticles[topic].title}`}
      title={label || `Explain ${helpArticles[topic].title}`}
      onClick={(event) => {
        event.stopPropagation();
        openHelp?.(topic);
      }}
    >
      ?
    </button>
  );
}

function HelpDrawer({ topic, close }: { topic: HelpKey; close: () => void }) {
  const article = helpArticles[topic];

  return (
    <div className="e40-help-overlay" role="presentation" onMouseDown={close}>
      <aside
        className="e40-help-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="e40-help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>Contextual help</small>
            <h2 id="e40-help-title">{article.title}</h2>
          </div>
          <button type="button" aria-label="Close help" onClick={close}>
            ×
          </button>
        </header>

        <div className="e40-help-content">
          <p className="e40-help-summary">{article.summary}</p>

          <HelpBlock title="How it is calculated" text={article.calculation} />
          <HelpBlock title="Data and reporting period" text={article.data} />
          <HelpBlock title="What to do" text={article.action} />
        </div>
      </aside>
    </div>
  );
}

function HelpBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="e40-help-block">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}
