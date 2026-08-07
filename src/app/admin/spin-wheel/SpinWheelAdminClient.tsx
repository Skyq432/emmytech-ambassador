"use client";

import { Fragment, FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AdminHelpProvider, HelpButton, type HelpKey } from "./AdminHelp";

const EMMYTECH_LOGO_URL = "/emmytech-logo.png";

type Tab =
  | "overview"
  | "operations"
  | "prizes"
  | "rules"
  | "claims"
  | "cashoff"
  | "users"
  | "logs";

type ModalState =
  | { type: "prize"; record?: any }
  | { type: "group"; record?: any }
  | { type: "item"; record?: any }
  | { type: "cashoff"; identityId: string; name: string }
  | { type: "user"; playerId: string }
  | null;

const tabs: Array<{ id: Tab; label: string; group: "core" | "setup" | "records" }> = [
  { id: "overview", label: "Overview", group: "core" },
  { id: "operations", label: "Reward Operations", group: "core" },
  { id: "prizes", label: "Wheel Prizes", group: "setup" },
  { id: "rules", label: "Spin Rules", group: "setup" },
  { id: "claims", label: "Prize Claims", group: "records" },
  { id: "cashoff", label: "Cash Off", group: "records" },
  { id: "users", label: "User Database", group: "records" },
  { id: "logs", label: "Audit Logs", group: "records" },
];

const tabTitles: Record<Tab, string> = {
  overview: "Campaign Overview",
  operations: "Reward Operations",
  prizes: "Wheel Prizes",
  rules: "Hybrid Spin Setup",
  claims: "Prize Claims",
  cashoff: "Cash Off Control",
  users: "User Database",
  logs: "Audit Logs",
};

function NavIcon({ tab }: { tab: Tab }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (tab) {
    case "overview":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6" height="6" rx="1.2" />
          <rect x="14" y="4" width="6" height="6" rx="1.2" />
          <rect x="4" y="14" width="6" height="6" rx="1.2" />
          <rect x="14" y="14" width="6" height="6" rx="1.2" />
        </svg>
      );
    case "operations":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "prizes":
      return (
        <svg {...common}>
          <path d="M12 4v16" />
          <path d="M4 12h16" />
          <path d="M6.5 6.5l11 11" />
          <path d="M17.5 6.5l-11 11" />
        </svg>
      );
    case "rules":
      return (
        <svg {...common}>
          <path d="M7 6h10" />
          <path d="M7 12h10" />
          <path d="M7 18h10" />
          <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "claims":
      return (
        <svg {...common}>
          <path d="M7 4h8l4 4v12H7z" />
          <path d="M15 4v4h4" />
          <path d="M10 12h6" />
          <path d="M10 16h4" />
        </svg>
      );
    case "cashoff":
      return (
        <svg {...common}>
          <path d="M8 5h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" />
          <path d="M12 3v18" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 19a4 4 0 0 0-8 0" />
          <circle cx="12" cy="10" r="3" />
          <path d="M6 18a3.5 3.5 0 0 0-2.5-3.4" />
          <path d="M18 18a3.5 3.5 0 0 1 2.5-3.4" />
        </svg>
      );
    case "logs":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </svg>
      );
  }
}

function formatMoney(value: unknown) {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function localInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}

function cleanPhone(value: unknown) {
  let phone = String(value || "").replace(/\D/g, "");
  if (phone.startsWith("0")) phone = `234${phone.slice(1)}`;
  if (phone && !phone.startsWith("234")) phone = `234${phone}`;
  return phone;
}

export default function SpinWheelAdminClient() {
  const [password, setPassword] = useState("");
  const [sessionPassword, setSessionPassword] = useState("");
  const [username, setUsername] = useState("Emmytech");
  const [loginError, setLoginError] = useState("");
  const [loggedIn, setLoggedIn] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  const tabCache = useRef<Record<string, any>>({});
  const [modal, setModal] = useState<ModalState>(null);
  const [userDetail, setUserDetail] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [claimStatus, setClaimStatus] = useState("all");
  const [logType, setLogType] = useState("all");
  const [operationStatus, setOperationStatus] = useState("all");
  const [operationPage, setOperationPage] = useState(1);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return localInput(date);
  });
  const [to, setTo] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 0);
    date.setHours(23, 59, 59, 999);
    return localInput(date);
  });

  async function request(
    section: string,
    options?: {
      method?: "GET" | "POST";
      body?: any;
      params?: Record<string, string>;
      quiet?: boolean;
    }
  ) {
    const params = new URLSearchParams({
      section,
      ...(options?.params || {}),
    });

    if (!options?.quiet) {
      setLoading(true);
      setError("");
      setNotice("");
    }

    try {
      const response = await fetch(`/api/admin/spin-wheel?${params.toString()}`, {
        method: options?.method || "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body:
          options?.method === "POST"
            ? JSON.stringify(options.body || {})
            : undefined,
        cache: "no-store",
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Admin request failed.");
      }

      return payload.data ?? payload;
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError("");

    if (username.trim().toLowerCase() !== "emmytech") {
      setLoginError("Invalid EmmyTech admin credentials.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/admin/spin-wheel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "login" }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Invalid credentials.");
      }

      setSessionPassword(password);
      setLoggedIn(true);
    } catch (loginFailure) {
      setLoginError(
        loginFailure instanceof Error
          ? loginFailure.message
          : "Unable to open admin panel."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadSection(
    nextTab: Tab = tab,
    force = false,
    overrides?: { operationStatus?: string; operationPage?: number }
  ) {
    try {
      let params: Record<string, string> = {};

      if (nextTab === "overview") {
        params = {
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
        };
      }

      if (nextTab === "users" && search.trim()) {
        params.q = search.trim();
      }

      if (nextTab === "operations") {
        params.status = overrides?.operationStatus ?? operationStatus;
        params.page = String(overrides?.operationPage ?? operationPage);
      }

      if (nextTab === "claims") params.status = claimStatus;
      if (nextTab === "logs") params.resultType = logType;

      const cacheKey = `${nextTab}:${new URLSearchParams(params).toString()}`;

      if (
        !force &&
        Object.prototype.hasOwnProperty.call(tabCache.current, cacheKey)
      ) {
        setData(tabCache.current[cacheKey]);
        setLoading(false);
        return;
      }

      const payload = await request(nextTab, { params });
      tabCache.current[cacheKey] = payload;
      setData(payload);

      if (nextTab === "rules" && !selectedGroupId) {
        setSelectedGroupId(payload?.groups?.[0]?.id || "");
      }
    } catch (sectionError) {
      setError(
        sectionError instanceof Error
          ? sectionError.message
          : "Unable to load admin data."
      );
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem("emmy40-sidebar-collapsed");
    setSidebarCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "emmy40-sidebar-collapsed",
      String(sidebarCollapsed)
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (loggedIn) loadSection(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, tab]);

  useEffect(() => {
    if (!loggedIn || !sessionPassword) return;

    const timer = window.setTimeout(() => {
      const sections: Tab[] = ["rules", "prizes", "cashoff"];

      sections.forEach(async (section) => {
        const cacheKey = `${section}:`;

        if (
          Object.prototype.hasOwnProperty.call(
            tabCache.current,
            cacheKey
          )
        ) {
          return;
        }

        try {
          const payload = await request(section, { quiet: true });
          tabCache.current[cacheKey] = payload;
        } catch {
          // The visible tab will show the real error if opened.
        }
      });
    }, 650);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, sessionPassword]);

  async function action(body: any, successMessage: string) {
    try {
      setLoading(true);
      setError("");
      await request("action", {
        method: "POST",
        body,
        quiet: true,
      });
      setModal(null);
      setNotice(successMessage);
      tabCache.current = {};
      await loadSection(tab, true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Admin action failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function openUser(playerId: string) {
    try {
      setLoading(true);
      setUserDetail(null);
      const payload = await request("user", {
        params: { playerId },
        quiet: true,
      });
      setUserDetail(payload);
      setModal({ type: "user", playerId });
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Unable to load user."
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedItems = useMemo(() => {
    if (tab !== "rules") return [];
    return (data?.items || []).filter(
      (item: any) => item.group_id === selectedGroupId
    );
  }, [data, selectedGroupId, tab]);

  function switchTab(nextTab: Tab) {
    setLoading(true);
    setData(null);
    setError("");
    setNotice("");
    setTab(nextTab);
    setMobileNav(false);
  }

  function logout() {
    setLoggedIn(false);
    setSessionPassword("");
    setPassword("");
    setData(null);
    setModal(null);
  }

  if (!loggedIn) {
    return (
      <main className="e40-login-shell">
        <section className="e40-login-card">
          <div className="e40-login-icon">⌾</div>
          <h1>Admin Control Panel</h1>
          <p>Verify EmmyTech credentials</p>

          <form onSubmit={login}>
            <label>
              <span>Admin username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label>
              <span>Master password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <button disabled={loading} type="submit">
              {loading ? "OPENING..." : "OPEN CONTROL PANEL"}
            </button>
          </form>

          {loginError && <div className="e40-error">{loginError}</div>}
        </section>
      </main>
    );
  }

  return (
    <AdminHelpProvider>
      <div
        className={`e40-app e40-embedded ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
      <aside
        className={`e40-sidebar ${mobileNav ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}
      >
        <div className="e40-brand">
          <div className="e40-brand-row">
            <div className="e40-brand-mark" aria-hidden="true">
              <img src={EMMYTECH_LOGO_URL} alt="" />
            </div>
            <div className="e40-brand-copy">
              <strong>
                EMMY<span>TECH</span>
              </strong>
              <span>Spin Admin</span>
            </div>
            <button
              type="button"
              className="e40-sidebar-toggle"
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
          </div>
          <small>Panel Active</small>
        </div>

        <nav className="e40-nav">
          {tabs.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 && tabs[index - 1]?.group !== item.group && (
                <div className="e40-nav-divider" aria-hidden="true" />
              )}
              <button
                className={tab === item.id ? "active" : ""}
                onClick={() => switchTab(item.id)}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <i className="e40-nav-icon"><NavIcon tab={item.id} /></i>
                <span>{item.label}</span>
              </button>
            </Fragment>
          ))}
        </nav>

        <div className="e40-sidebar-footer">
          <div className="e40-sidebar-user" aria-label="Signed in admin">
            <div className="e40-sidebar-avatar" aria-hidden="true">
              <img src={EMMYTECH_LOGO_URL} alt="" />
            </div>
            <div>
              <strong>{username}</strong>
              <span>Admin</span>
            </div>
          </div>

          <button
            className="e40-logout"
            onClick={logout}
            aria-label="Logout"
            title="Logout"
          >
            <i aria-hidden="true">↗</i>
          </button>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="e40-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
      )}

      <main className="e40-main">
        <header className="e40-topbar">
          <div>
            <button
              className="e40-menu"
              onClick={() => setMobileNav(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <button
              className="e40-collapse-trigger"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
            <h1>{tabTitles[tab]}</h1>
          </div>

          <div className="e40-top-actions">
            <button
              onClick={() => {
                tabCache.current = {};
                loadSection(tab, true);
              }}
            >
              ↻
            </button>
            <div>
              <strong>EmmyTech Admin</strong>
              <span>Live Monitoring</span>
            </div>
            <b>⌾</b>
          </div>
        </header>

        <section className="e40-content">
          <div className="e40-embedded-heading">
            <div>
              <span className="e40-embedded-eyebrow">Spin Wheel administration</span>
              <h1>{tabTitles[tab]}</h1>
              <p>
                Manage rewards, wheel rules, claims, Cash Off, players and audit records
                from the main EmmyTech admin workspace.
              </p>
            </div>

            <button
              type="button"
              className="e40-embedded-refresh"
              onClick={() => {
                tabCache.current = {};
                loadSection(tab, true);
              }}
            >
              Refresh data
            </button>
          </div>

          <div className="e40-embedded-tabs" role="tablist" aria-label="Spin Wheel admin sections">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => switchTab(item.id)}
              >
                <span className="e40-embedded-tab-icon">
                  <NavIcon tab={item.id} />
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {(notice || error) && (
            <div className={error ? "e40-alert error" : "e40-alert"}>
              {error || notice}
            </div>
          )}

          {loading && <div className="e40-loading">Loading control panel…</div>}

          {!loading && tab === "overview" && (
            <Overview
              data={data}
              from={from}
              to={to}
              setFrom={setFrom}
              setTo={setTo}
              refresh={() => loadSection("overview", true)}
            />
          )}

          {!loading && tab === "operations" && (
            <RewardOperations
              data={data}
              status={operationStatus}
              setStatus={setOperationStatus}
              refresh={() => {
                setOperationPage(1);
                loadSection("operations", true, {
                  operationStatus,
                  operationPage: 1,
                });
              }}
              changePage={(nextPage: number) => {
                setOperationPage(nextPage);
                loadSection("operations", true, {
                  operationStatus,
                  operationPage: nextPage,
                });
              }}
              updateCashout={(id: string, status: string, note: string) =>
                action(
                  { action: "cashout_status", id, status, note },
                  `Cashout marked ${status}.`
                )
              }
            />
          )}

          {!loading && tab === "prizes" && (
            <Prizes
              rows={Array.isArray(data) ? data : []}
              edit={(record?: any) => setModal({ type: "prize", record })}
              remove={(id: string) => {
                if (confirm("Delete this wheel prize permanently?")) {
                  action(
                    { action: "delete_prize", id },
                    "Prize deleted."
                  );
                }
              }}
            />
          )}

          {!loading && tab === "rules" && (
            <Rules
              data={data}
              selectedGroupId={selectedGroupId}
              setSelectedGroupId={setSelectedGroupId}
              selectedItems={selectedItems}
              editGroup={(record?: any) =>
                setModal({ type: "group", record })
              }
              editItem={(record?: any) =>
                setModal({
                  type: "item",
                  record: record || { group_id: selectedGroupId },
                })
              }
              removeGroup={(id: string) => {
                if (
                  confirm(
                    "Delete this rule group and every rule item inside it?"
                  )
                ) {
                  action(
                    { action: "delete_group", id },
                    "Rule group deleted."
                  );
                }
              }}
              removeItem={(id: string) => {
                if (confirm("Delete this rule item?")) {
                  action(
                    { action: "delete_item", id },
                    "Rule item deleted."
                  );
                }
              }}
              saveSetting={(key: string, value: any) =>
                action(
                  { action: "save_setting", key, value },
                  "Game setting updated."
                )
              }
            />
          )}

          {!loading && tab === "claims" && (
            <Claims
              rows={Array.isArray(data) ? data : []}
              status={claimStatus}
              setStatus={setClaimStatus}
              refresh={() => loadSection("claims", true)}
              update={(id: string, status: string) =>
                action(
                  { action: "claim_status", id, status },
                  `Prize marked ${status}.`
                )
              }
            />
          )}

          {!loading && tab === "cashoff" && (
            <CashOff
              data={
                data && !Array.isArray(data)
                  ? data
                  : { accounts: [], transactions: [] }
              }
              adjust={(identityId: string, name: string) =>
                setModal({ type: "cashoff", identityId, name })
              }
            />
          )}

          {!loading && tab === "users" && (
            <Users
              rows={Array.isArray(data) ? data : []}
              search={search}
              setSearch={setSearch}
              refresh={() => loadSection("users", true)}
              openUser={openUser}
            />
          )}

          {!loading && tab === "logs" && (
            <Logs
              rows={Array.isArray(data) ? data : []}
              resultType={logType}
              setResultType={setLogType}
              refresh={() => loadSection("logs", true)}
            />
          )}
        </section>
      </main>

      {modal?.type === "prize" && (
        <PrizeModal
          record={modal.record}
          close={() => setModal(null)}
          save={(record: any) =>
            action({ action: "save_prize", record }, "Prize saved.")
          }
        />
      )}

      {modal?.type === "group" && (
        <GroupModal
          record={modal.record}
          close={() => setModal(null)}
          save={(record: any) =>
            action({ action: "save_group", record }, "Rule group saved.")
          }
        />
      )}

      {modal?.type === "item" && (
        <ItemModal
          record={modal.record}
          groups={data?.groups || []}
          close={() => setModal(null)}
          save={(record: any) =>
            action({ action: "save_item", record }, "Rule item saved.")
          }
        />
      )}

      {modal?.type === "cashoff" && (
        <CashOffModal
          name={modal.name}
          close={() => setModal(null)}
          save={(amount: number, reason: string) =>
            action(
              {
                action: "cashoff_adjust",
                identityId: modal.identityId,
                amount,
                reason,
                idempotencyKey: crypto.randomUUID(),
              },
              "Cash Off balance adjusted."
            )
          }
        />
      )}

      {modal?.type === "user" && userDetail && (
        <UserModal
          data={userDetail}
          close={() => {
            setModal(null);
            setUserDetail(null);
          }}
          addSpins={(amount: number) =>
            action(
              {
                action: "add_spins",
                playerId: userDetail.player.id,
                amount,
              },
              "Player spins updated."
            )
          }
          adjustCashOff={() =>
            setModal({
              type: "cashoff",
              identityId: userDetail.player.identity_id,
              name:
                userDetail.identity?.primary_name ||
                userDetail.player.full_name ||
                "Player",
            })
          }
        />
      )}
      </div>
    </AdminHelpProvider>
  );
}

function Overview({ data, from, to, setFrom, setTo, refresh }: any) {
  const metrics = data?.metrics || {};
  const daily = data?.daily || [];
  const distribution = data?.distribution || [];
  const recentActivity = data?.recentActivity || [];
  const maxPrize = Math.max(
    1,
    ...distribution.map((item: any) => item.count)
  );

  return (
    <>
      <section className="e40-filter-card e40-filter-compact">
        <div>
          <span className="e40-inline-label">
            <small>Report period</small>
            <HelpButton topic="report-period" />
          </span>
          <div className="e40-title-with-help">
            <h2>Campaign performance</h2>
            <HelpButton topic="campaign-overview" />
          </div>
          <p>Review spins, referrals and Cash Off activity.</p>
        </div>

        <label>
          <span>From</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>

        <label>
          <span>To</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>

        <button onClick={refresh}>Apply period</button>
      </section>

      <div className="e40-stats e40-stats-primary">
        <Stat
          title="Total spins"
          value={metrics.spins || 0}
          icon="↻"
          helpTopic="total-spins"
        />
        <Stat
          title="Active players"
          value={metrics.activePlayers || 0}
          icon="♟"
          helpTopic="active-players"
        />
        <Stat
          title="New referrals"
          value={metrics.referrals || 0}
          icon="＋"
          helpTopic="new-referrals"
        />
        <Stat
          title="Cash Off credited"
          value={formatMoney(metrics.cashOffCredited)}
          icon="₦"
          helpTopic="cash-off-credited"
        />
      </div>

      <details className="e40-disclosure e40-more-insights">
        <summary>
          <span>
            <strong>More insights</strong>
            <small>Open operational metrics that need less frequent attention.</small>
          </span>
          <i aria-hidden="true">⌄</i>
        </summary>
        <div className="e40-disclosure-body">
          <div className="e40-stats e40-stats-operations">
            <Stat
              title="Active Cash Challenges"
              value={metrics.activeChallenges || 0}
              icon="◷"
              helpTopic="active-challenges"
            />
            <Stat
              title="Cash Payout Due"
              value={formatMoney(metrics.cashPayoutDue)}
              icon="₦"
              helpTopic="cash-payout-due"
            />
            <Stat
              title="Daily Spins Ready"
              value={metrics.dailySpinReady || 0}
              icon="↻"
              helpTopic="daily-spins-ready"
            />
            <Stat
              title="Bonus Spins Awarded"
              value={
                Number(metrics.referralBonusSpins || 0) +
                Number(metrics.shareBonusSpins || 0)
              }
              icon="+"
              helpTopic="bonus-spins"
            />
          </div>
        </div>
      </details>

      <div className="e40-overview-grid">
        <section className="e40-card e40-trend-card">
          <div className="e40-card-title">
            <div>
              <small>Last seven days</small>
              <h3>Spin Activity Trend</h3>
            </div>
            <div className="e40-card-actions">
              <HelpButton topic="spin-trend" />
              <span className="e40-chart-total">
              {daily.reduce(
                (sum: number, item: any) => sum + Number(item.count || 0),
                0
              )}{" "}
              spins
              </span>
            </div>
          </div>

          <TrendChart daily={daily} />
        </section>

        <section className="e40-card e40-health-card">
          <div className="e40-card-title">
            <div>
              <small>Campaign health</small>
              <h3>{metrics.loopStatus || "No loop"}</h3>
            </div>
            <div className="e40-card-actions">
              <HelpButton topic="viral-score" />
              <span className="e40-health-score">
                {Number(metrics.viralScore || 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="e40-health-list">
            <div>
              <span>Referral rate</span>
              <strong>
                {Number(metrics.referralRate || 0).toFixed(1)}%
              </strong>
            </div>
            <div>
              <span>Average referrals</span>
              <strong>
                {Number(metrics.averageReferrals || 0).toFixed(2)}
              </strong>
            </div>
            <div>
              <span className="e40-inline-label">
                Current Cash Off liability
                <HelpButton topic="cash-off-liability" />
              </span>
              <strong>{formatMoney(metrics.currentCashOff)}</strong>
            </div>
            <div>
              <span>Cash Off used in period</span>
              <strong>{formatMoney(metrics.cashOffDebited)}</strong>
            </div>
            <div>
              <span>Pending special prizes</span>
              <strong>{metrics.pendingClaims || 0}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="e40-grid-2 e40-overview-bottom">
        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Winning results</small>
              <h3>Prize Distribution</h3>
            </div>
            <HelpButton topic="prize-distribution" />
          </div>

          <div className="e40-distribution">
            {distribution.length ? (
              distribution.map((item: any) => (
                <div key={item.label}>
                  <header>
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </header>
                  <div>
                    <span
                      style={{
                        width: `${Math.max(
                          3,
                          (item.count / maxPrize) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No spin results for this period." />
            )}
          </div>
        </section>

        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Newest events</small>
              <h3>Recent Spin Activity</h3>
            </div>
            <HelpButton topic="recent-spins" />
          </div>

          <div className="e40-activity">
            {recentActivity.slice(0, 8).map((item: any) => (
              <div key={item.id}>
                <i>{item.result_type === "cash" ? "₦" : "✦"}</i>
                <span>
                  <strong>{item.result_label || "Unknown result"}</strong>
                  <small>{formatDate(item.created_at)}</small>
                </span>
                <b>{item.reward_mode || "legacy_cash"}</b>
              </div>
            ))}

            {!recentActivity.length && (
              <Empty text="No recent spin activity." />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function RewardOperations({
  data,
  status,
  setStatus,
  refresh,
  changePage,
  updateCashout,
}: any) {
  const metrics = data?.metrics || {};
  const challenges = data?.challenges || [];
  const cashouts = data?.cashouts || [];
  const topReferrers = data?.topReferrers || [];
  const recentBonuses = data?.recentBonuses || [];
  const pagination = data?.challengePagination || {
    page: 1,
    pageCount: 1,
    total: 0,
  };
  const deployment = data?.deployment || {};

  function changeCashout(item: any, nextStatus: string) {
    if (
      !window.confirm(
        `Mark this ${formatMoney(item.amount)} cashout as ${nextStatus}?`
      )
    ) {
      return;
    }

    const note =
      window.prompt(
        "Add an admin note for the audit trail (recommended):",
        ""
      ) || "";
    updateCashout(item.id, nextStatus, note);
  }

  return (
    <>
      <SectionHeader
        eyebrow="Live reward controls"
        title="Reward Operations"
        description="Track Cash Challenges, payout decisions, daily spins and the referral loop from one place."
        helpTopic="reward-operations"
      />

      <details className="e40-disclosure e40-system-status">
        <summary>
          <span>
            <strong>System status</strong>
            <small>Database readiness and event-tracking checks.</small>
          </span>
          <span className="e40-summary-actions">
            <HelpButton topic="system-status" />
            <i aria-hidden="true">⌄</i>
          </span>
        </summary>
        <div className="e40-disclosure-body">
          <div className="e40-deployment-grid">
            <DeploymentState
              ready={deployment.dailyEntitlement}
              title="Daily-spin entitlement"
              description={
                deployment.dailyEntitlement
                  ? "Tracking is available in this database."
                  : "The daily-spin migration is not deployed here yet."
              }
            />
            <DeploymentState
              ready={deployment.shareBonus}
              title="Share bonus"
              description={
                deployment.shareBonus
                  ? "Share claims are being read from the reward ledger."
                  : "The share-bonus table is not deployed here yet."
              }
            />
            <DeploymentState
              ready={deployment.referralOpenTracking}
              pending={!deployment.referralOpenTracking}
              title="Referral link visits"
              description={
                deployment.referralOpenTracking
                  ? "Unique browser visits are now arriving."
                  : "Ready; waiting for the first tracked referral visit."
              }
            />
            <DeploymentState
              ready={deployment.guideTracking}
              pending={!deployment.guideTracking}
              title="Reward guide funnel"
              description={
                deployment.guideTracking
                  ? "Started, completed and skipped events are available."
                  : "Ready; waiting for the first guided spin."
              }
            />
          </div>
        </div>
      </details>

      <div className="e40-stats e40-operation-stats e40-operation-primary">
        <Stat
          title="Active Challenges"
          value={metrics.activeChallenges || 0}
          icon="◷"
          helpTopic="active-challenges"
        />
        <Stat
          title="Cash Payout Due"
          value={formatMoney(metrics.cashPayoutDue)}
          icon="!"
          helpTopic="cash-payout-due"
        />
        <Stat
          title="Pending Cashouts"
          value={metrics.pendingCashouts || 0}
          icon="▣"
          helpTopic="pending-cashouts"
        />
        <Stat
          title="Daily Spins Ready"
          value={metrics.dailySpinReady || 0}
          icon="↻"
          helpTopic="daily-spins-ready"
        />
      </div>

      <details className="e40-disclosure e40-more-insights">
        <summary>
          <span>
            <strong>More reward insights</strong>
            <small>Challenge balances, conversions and growth performance.</small>
          </span>
          <i aria-hidden="true">⌄</i>
        </summary>
        <div className="e40-disclosure-body">
          <div className="e40-stats e40-stats-operations e40-operation-secondary">
            <Stat
              title="Challenge Cash"
              value={formatMoney(metrics.activeChallengeCash)}
              icon="₦"
              helpTopic="challenge-cash"
            />
            <Stat
              title="Converted to Cash Off"
              value={formatMoney(metrics.convertedCashOff)}
              icon="↔"
              helpTopic="converted-cash-off"
            />
          </div>

          <div className="e40-grid-3 e40-funnel-grid">
            <section className="e40-card e40-funnel-card">
              <div className="e40-funnel-heading">
                <small>Referral funnel</small>
                <HelpButton topic="referral-funnel" />
              </div>
              <h3>{Number(metrics.referralConversionRate || 0).toFixed(1)}%</h3>
              <p>Tracked visits that became registered referrals.</p>
              <div>
                <span>{metrics.referralLinkOpens || 0} visits</span>
                <strong>{metrics.referralRegistrations || 0} registrations</strong>
              </div>
            </section>
            <section className="e40-card e40-funnel-card">
              <div className="e40-funnel-heading">
                <small>Bonus-spin ledger</small>
                <HelpButton topic="bonus-ledger" />
              </div>
              <h3>
                {Number(metrics.referralBonusSpins || 0) +
                  Number(metrics.shareBonusSpins || 0)}
              </h3>
              <p>Spins awarded through growth actions.</p>
              <div>
                <span>{metrics.referralBonusSpins || 0} referral</span>
                <strong>{metrics.shareBonusSpins || 0} share</strong>
              </div>
            </section>
            <section className="e40-card e40-funnel-card">
              <div className="e40-funnel-heading">
                <small>Reward education</small>
                <HelpButton topic="reward-guide" />
              </div>
              <h3>{Number(metrics.guideCompletionRate || 0).toFixed(1)}%</h3>
              <p>New players who completed the reward guide.</p>
              <div>
                <span>{metrics.guideStarted || 0} started</span>
                <strong>{metrics.guideSkipped || 0} skipped</strong>
              </div>
            </section>
          </div>
        </div>
      </details>

      <section className="e40-toolbar e40-operation-toolbar">
        <div>
          <div className="e40-title-with-help">
            <strong>Cash Challenge queue</strong>
            <HelpButton topic="challenge-queue" />
          </div>
          <span>{pagination.total || 0} matching challenges</span>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All challenge statuses</option>
          <option value="active">Active</option>
          <option value="cash_eligible">Cash eligible</option>
          <option value="converted_to_cash_off">Converted to Cash Off</option>
          <option value="closed">Closed</option>
        </select>
        <button onClick={refresh}>Apply Filter</button>
      </section>

      <section className="e40-card">
        <div className="e40-table-wrap">
          <table className="e40-operation-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Target</th>
                <th>Expires / processed</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((item: any) => {
                const balance = Number(item.cash_balance || 0);
                const target = Math.max(1, Number(item.cash_target || 1000));
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.player_name}</strong>
                      <small>{item.player_phone || item.player?.referral_code}</small>
                    </td>
                    <td><Status value={item.status} /></td>
                    <td>
                      <strong>{formatMoney(balance)}</strong>
                      <div className="e40-mini-progress">
                        <span
                          style={{ width: `${Math.min(100, (balance / target) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td>{formatMoney(target)}</td>
                    <td>{formatDate(item.processed_at || item.expires_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!challenges.length && <Empty text="No Cash Challenges match this filter." />}
        </div>

        <div className="e40-pagination">
          <button
            disabled={pagination.page <= 1}
            onClick={() => changePage(pagination.page - 1)}
          >
            Previous
          </button>
          <span>Page {pagination.page} of {pagination.pageCount}</span>
          <button
            disabled={pagination.page >= pagination.pageCount}
            onClick={() => changePage(pagination.page + 1)}
          >
            Next
          </button>
        </div>
      </section>

      <div className="e40-grid-2 e40-operations-split">
        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Payout decisions</small>
              <h3>Cashout Requests</h3>
            </div>
            <div className="e40-card-actions">
              <HelpButton topic="cashout-requests" />
              <span className="e40-chart-total">
                {formatMoney(metrics.pendingCashoutAmount)} pending
              </span>
            </div>
          </div>

          <div className="e40-cashout-list">
            {cashouts.map((item: any) => (
              <article key={item.id}>
                <span>
                  <strong>{item.player_name}</strong>
                  <small>{formatDate(item.requested_at || item.created_at)}</small>
                </span>
                <b>{formatMoney(item.amount)}</b>
                <Status value={item.status} />
                <div>
                  {item.status !== "paid" && (
                    <button onClick={() => changeCashout(item, "paid")}>Mark paid</button>
                  )}
                  {item.status !== "rejected" && (
                    <button
                      className="danger"
                      onClick={() => changeCashout(item, "rejected")}
                    >
                      Reject
                    </button>
                  )}
                  {item.status !== "pending" && (
                    <button onClick={() => changeCashout(item, "pending")}>Reopen</button>
                  )}
                </div>
              </article>
            ))}
            {!cashouts.length && <Empty text="No cashout requests have been recorded." />}
          </div>
        </section>

        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Growth leaders</small>
              <h3>Top Referrers</h3>
            </div>
            <HelpButton topic="top-referrers" />
          </div>

          <div className="e40-referrer-list">
            {topReferrers.map((item: any, index: number) => (
              <article key={item.player_id}>
                <i>{index + 1}</i>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.referral_code || "No referral code"}</small>
                </span>
                <div>
                  <b>{item.registrations}</b>
                  <small>registered</small>
                </div>
                <div>
                  <b>{item.link_opens}</b>
                  <small>visits</small>
                </div>
                <div>
                  <b>+{item.bonus_spins}</b>
                  <small>spins</small>
                </div>
              </article>
            ))}
            {!topReferrers.length && <Empty text="No referral activity yet." />}
          </div>
        </section>
      </div>

      <section className="e40-card">
        <div className="e40-card-title">
          <div>
            <small>Attribution ledger</small>
            <h3>Recent Referral & Share Bonuses</h3>
          </div>
          <HelpButton topic="bonus-activity" />
        </div>

        <div className="e40-bonus-feed">
          {recentBonuses.map((item: any) => (
            <article key={`${item.bonus_type}-${item.id}`}>
              <i>{item.bonus_type === "share" ? "↗" : "+"}</i>
              <span>
                <strong>{item.player_name}</strong>
                <small>
                  {item.bonus_type === "share" ? "Share bonus" : "Valid referral reward"}
                  {" · "}{formatDate(item.created_at)}
                </small>
              </span>
              <b>+{item.spins_awarded || 1} spin{Number(item.spins_awarded || 1) === 1 ? "" : "s"}</b>
            </article>
          ))}
          {!recentBonuses.length && <Empty text="No bonus-spin awards found." />}
        </div>
      </section>
    </>
  );
}

function DeploymentState({ ready, pending, title, description }: any) {
  return (
    <article className={`e40-deployment ${ready ? "ready" : pending ? "pending" : "missing"}`}>
      <i>{ready ? "✓" : pending ? "•" : "!"}</i>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </article>
  );
}

function TrendChart({ daily }: { daily: Array<{ day: string; count: number }> }) {
  const width = 760;
  const height = 250;
  const paddingX = 26;
  const paddingTop = 24;
  const paddingBottom = 42;
  const plotHeight = height - paddingTop - paddingBottom;
  const plotWidth = width - paddingX * 2;
  const max = Math.max(1, ...daily.map((item) => Number(item.count || 0)));

  const points = daily.map((item, index) => {
    const x =
      daily.length <= 1
        ? width / 2
        : paddingX + (index / (daily.length - 1)) * plotWidth;
    const y =
      paddingTop +
      plotHeight -
      (Number(item.count || 0) / max) * plotHeight;

    return { ...item, x, y };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${
        height - paddingBottom
      } L ${points[0].x} ${height - paddingBottom} Z`
    : "";

  return (
    <div className="e40-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Spin activity line chart">
        <defs>
          <linearGradient id="e40TrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1748c7" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1748c7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((step) => {
          const y = paddingTop + (step / 3) * plotHeight;
          return (
            <line
              key={step}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              className="e40-grid-line"
            />
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#e40TrendFill)" />}
        {linePath && <path d={linePath} className="e40-trend-line" />}

        {points.map((point) => (
          <g key={point.day}>
            <circle cx={point.x} cy={point.y} r="5" className="e40-trend-dot" />
            <text x={point.x} y={point.y - 13} textAnchor="middle" className="e40-trend-value">
              {point.count}
            </text>
            <text
              x={point.x}
              y={height - 15}
              textAnchor="middle"
              className="e40-trend-label"
            >
              {new Date(point.day).toLocaleDateString("en-NG", {
                weekday: "short",
              })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Stat({
  title,
  value,
  icon,
  helpTopic,
}: {
  title: string;
  value: ReactNode;
  icon: string;
  helpTopic?: HelpKey;
}) {
  return (
    <article className="e40-stat">
      <div className="e40-stat-top">
        <i>{icon}</i>
        {helpTopic && <HelpButton topic={helpTopic} />}
      </div>
      <small>{title}</small>
      <strong>{value}</strong>
    </article>
  );
}

function Prizes({ rows, edit, remove }: any) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <>
      <SectionHeader
        eyebrow="Wheel setup"
        title="Wheel Prizes"
        description="Change the visible wheel segments and their Cash Off values."
        helpTopic="prizes"
        actionLabel="+ Add Prize"
        action={() => edit()}
      />

      <div className="e40-prize-grid">
        {safeRows.map((prize: any) => (
          <article
            key={prize.id}
            className={`e40-prize-card ${
              prize.on_wheel ? "on-wheel" : ""
            } ${!prize.is_active ? "inactive" : ""}`}
          >
            <header>
              <i>{prize.prize_type === "cash" ? "₦" : "✦"}</i>
              <span>{prize.on_wheel ? "On Wheel" : "Off Wheel"}</span>
            </header>
            <h3>{prize.label}</h3>
            <p>{formatMoney(prize.monetary_value)}</p>

            <div className="e40-mini-grid">
              <div>
                <span>Type</span>
                <strong>{prize.prize_type}</strong>
              </div>
              <div>
                <span>Gravity</span>
                <strong>{prize.gravity}</strong>
              </div>
              <div>
                <span>Stock</span>
                <strong>{prize.stock}</strong>
              </div>
            </div>

            <footer>
              <button onClick={() => edit(prize)}>Edit</button>
              <button className="danger" onClick={() => remove(prize.id)}>
                Delete
              </button>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}

function Rules({
  data,
  selectedGroupId,
  setSelectedGroupId,
  selectedItems,
  editGroup,
  editItem,
  removeGroup,
  removeItem,
  saveSetting,
}: any) {
  const settings = new Map(
    (data?.settings || []).map((item: any) => [
      item.setting_key,
      item.setting_value,
    ])
  );

  return (
    <>
      <SectionHeader
        eyebrow="Game engine"
        title="Spin Rules"
        description="Control fixed spins, weighted bags, checkpoints and probability."
        helpTopic="rules"
        actionLabel="+ New Group"
        action={() => editGroup()}
      />

      <section className="e40-settings-row">
        <label>
          <span>Reward mode</span>
          <select
            value={String(settings.get("reward_mode") || "cash_off")}
            onChange={(event) =>
              saveSetting("reward_mode", event.target.value)
            }
          >
            <option value="cash_off">Cash Off</option>
            <option value="legacy_cash">Legacy Cash</option>
          </select>
        </label>

        <label>
          <span>Cash Off enabled</span>
          <select
            value={String(settings.get("cash_off_enabled") ?? false)}
            onChange={(event) =>
              saveSetting(
                "cash_off_enabled",
                event.target.value === "true"
              )
            }
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>

        <label>
          <span>Reward help & guide</span>
          <select
            value={String(settings.get("reward_help_enabled") ?? false)}
            onChange={(event) =>
              saveSetting(
                "reward_help_enabled",
                event.target.value === "true"
              )
            }
          >
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>

        <div>
          <span>Letter sequence</span>
          <strong>
            {(data?.letters || [])
              .filter((item: any) => item.is_active)
              .map((item: any) => item.segment_code)
              .join(" → ") || "Not configured"}
          </strong>
        </div>
      </section>

      <div className="e40-rules-layout">
        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Lower priority wins</small>
              <h3>Rule Groups</h3>
            </div>
            <HelpButton topic="rule-groups" />
          </div>

          <div className="e40-rule-groups">
            {(data?.groups || []).map((group: any) => (
              <button
                key={group.id}
                className={selectedGroupId === group.id ? "active" : ""}
                onClick={() => setSelectedGroupId(group.id)}
              >
                <span>
                  <strong>{group.group_name}</strong>
                  <small>
                    Spins {group.start_spin}–{group.end_spin || "∞"} ·{" "}
                    {group.group_type}
                  </small>
                </span>
                <b>{group.is_active ? "Active" : "Off"}</b>
                <i onClick={(event) => {
                  event.stopPropagation();
                  editGroup(group);
                }}>Edit</i>
                <i
                  className="danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeGroup(group.id);
                  }}
                >
                  Delete
                </i>
              </button>
            ))}
          </div>
        </section>

        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Selected group</small>
              <h3>Rule Items</h3>
            </div>
            <div className="e40-card-actions">
              <HelpButton topic="rule-items" />
              <button
                disabled={!selectedGroupId}
                onClick={() => editItem()}
              >
                + Add Item
              </button>
            </div>
          </div>

          <div className="e40-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reward</th>
                  <th>Type</th>
                  <th>Cash Off</th>
                  <th>Gravity</th>
                  <th>Max/User</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {selectedItems.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.result_label}</strong>
                      <small>{item.item_key}</small>
                    </td>
                    <td>{item.result_type}</td>
                    <td>{formatMoney(item.cash_amount)}</td>
                    <td>{item.gravity}</td>
                    <td>{item.max_uses_per_user}</td>
                    <td>{item.is_active ? "Active" : "Off"}</td>
                    <td>
                      <button onClick={() => editItem(item)}>Edit</button>
                      <button
                        className="danger-link"
                        onClick={() => removeItem(item.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!selectedItems.length && (
              <Empty text="No rule items inside this group." />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Claims({ rows, status, setStatus, refresh, update }: any) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <>
      <SectionHeader
        eyebrow="Reward fulfilment"
        title="Prize Claims"
        description="Verify and fulfil every non-retry reward."
        helpTopic="claims"
      />

      <section className="e40-toolbar">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="claimed">Claimed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={refresh}>Apply Filter</button>
      </section>

      <section className="e40-card">
        <div className="e40-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Prize</th>
                <th>Type</th>
                <th>Value</th>
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {safeRows.map((claim: any) => (
                <tr key={claim.id}>
                  <td>
                    <strong>
                      {claim.player?.full_name || "Unknown player"}
                    </strong>
                    <small>{claim.player?.phone_number || "—"}</small>
                  </td>
                  <td>{claim.prize_label}</td>
                  <td>{claim.result_type || "prize"}</td>
                  <td>{formatMoney(claim.cash_amount)}</td>
                  <td>
                    <Status value={claim.status} />
                  </td>
                  <td>{formatDate(claim.created_at)}</td>
                  <td>
                    {claim.status !== "claimed" && (
                      <button
                        onClick={() => update(claim.id, "claimed")}
                      >
                        Fulfil
                      </button>
                    )}
                    {claim.status === "claimed" && (
                      <button
                        onClick={() => update(claim.id, "available")}
                      >
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!safeRows.length && <Empty text="No prize claims found." />}
        </div>
      </section>
    </>
  );
}

function CashOff({ data, adjust }: any) {
  const accounts = data?.accounts || [];
  const transactions = data?.transactions || [];

  return (
    <>
      <SectionHeader
        eyebrow="Shopping credit"
        title="Cash Off Control"
        description="See every balance and make fully recorded admin corrections."
        helpTopic="cashoff"
      />

      <div className="e40-stats">
        <Stat
          title="Cash Off Accounts"
          value={accounts.length}
          icon="♟"
        />
        <Stat
          title="Current Liability"
          value={formatMoney(
            accounts.reduce(
              (sum: number, item: any) => sum + Number(item.balance || 0),
              0
            )
          )}
          icon="₦"
        />
        <Stat
          title="Total Credited"
          value={formatMoney(
            accounts.reduce(
              (sum: number, item: any) =>
                sum + Number(item.total_credited || 0),
              0
            )
          )}
          icon="+"
        />
        <Stat
          title="Total Debited"
          value={formatMoney(
            accounts.reduce(
              (sum: number, item: any) =>
                sum + Number(item.total_debited || 0),
              0
            )
          )}
          icon="−"
        />
      </div>

      <div className="e40-grid-2 cashoff">
        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Largest balances first</small>
              <h3>Cash Off Accounts</h3>
            </div>
          </div>

          <div className="e40-account-list">
            {accounts.map((account: any) => (
              <article key={account.identity_id}>
                <span>
                  <strong>
                    {account.identity?.primary_name ||
                      account.identity?.identity_code ||
                      "Customer"}
                  </strong>
                  <small>
                    {account.identity?.primary_phone ||
                      account.identity?.primary_email ||
                      account.identity_id}
                  </small>
                </span>
                <b>{formatMoney(account.balance)}</b>
                <Status value={account.status} />
                <button
                  onClick={() =>
                    adjust(
                      account.identity_id,
                      account.identity?.primary_name || "Customer"
                    )
                  }
                >
                  Adjust
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="e40-card">
          <div className="e40-card-title">
            <div>
              <small>Immutable ledger</small>
              <h3>Recent Transactions</h3>
            </div>
          </div>

          <div className="e40-transaction-list">
            {transactions.slice(0, 100).map((item: any) => (
              <article key={item.id}>
                <i className={item.direction}>
                  {item.direction === "credit" ? "+" : "−"}
                </i>
                <span>
                  <strong>{item.transaction_type}</strong>
                  <small>
                    {item.source_system} · {formatDate(item.created_at)}
                  </small>
                </span>
                <b className={item.direction}>
                  {item.direction === "credit" ? "+" : "−"}
                  {formatMoney(item.amount)}
                </b>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Users({ rows, search, setSearch, refresh, openUser }: any) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <>
      <SectionHeader
        eyebrow="Identity-linked records"
        title="User Database"
        description="Search players, inspect spins, rewards, referrals and Cash Off."
        helpTopic="users"
      />

      <section className="e40-toolbar users">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") refresh();
          }}
          placeholder="Search name, phone, email or referral code"
        />
        <button onClick={refresh}>Search</button>
      </section>

      <section className="e40-card">
        <div className="e40-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Phone</th>
                <th>Spins</th>
                <th>Cash Off</th>
                <th>Referrals</th>
                <th>Last Prize</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {safeRows.map((player: any) => (
                <tr key={player.id}>
                  <td>
                    <strong>
                      {player.identity?.primary_name ||
                        player.full_name ||
                        "Unnamed"}
                    </strong>
                    <small>
                      {player.identity?.primary_email ||
                        player.email ||
                        player.referral_code}
                    </small>
                  </td>
                  <td>
                    {player.identity?.primary_phone ||
                      player.phone_number ||
                      "—"}
                  </td>
                  <td>{player.spins_remaining || 0}</td>
                  <td>
                    {formatMoney(player.cashOffAccount?.balance || 0)}
                  </td>
                  <td>{player.total_referrals_count || 0}</td>
                  <td>{player.last_prize_won || "—"}</td>
                  <td>
                    <button onClick={() => openUser(player.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!safeRows.length && <Empty text="No matching users." />}
        </div>
      </section>
    </>
  );
}

function Logs({ rows, resultType, setResultType, refresh }: any) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <>
      <SectionHeader
        eyebrow="Spin history"
        title="Audit Logs"
        description="Latest spin outcomes, mode, value and balance movement."
        helpTopic="logs"
      />

      <section className="e40-toolbar">
        <select
          value={resultType}
          onChange={(event) => setResultType(event.target.value)}
        >
          <option value="all">All result types</option>
          <option value="cash">Cash / Cash Off</option>
          <option value="retry">Retry</option>
          <option value="letter">Letter</option>
          <option value="bonus_spin">Bonus spin</option>
          <option value="prize">Prize</option>
        </select>
        <button onClick={refresh}>Apply Filter</button>
      </section>

      <section className="e40-card">
        <div className="e40-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Result</th>
                <th>Type</th>
                <th>Value</th>
                <th>Mode</th>
                <th>Rule / source</th>
                <th>Challenge</th>
                <th>Wallet</th>
                <th>Cash Off</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {safeRows.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.result_label}</strong>
                    <small>{item.id}</small>
                  </td>
                  <td>{item.result_type || "unknown"}</td>
                  <td>{formatMoney(item.cash_amount)}</td>
                  <td>
                    <Status value={item.reward_mode || "legacy_cash"} />
                  </td>
                  <td>
                    <strong>{item.spin_rule_group_key || "legacy"}</strong>
                    <small>{item.spin_rule_item_key || "—"}</small>
                  </td>
                  <td>
                    {item.cash_challenge_id ? (
                      <>
                        <strong>+{formatMoney(item.cash_challenge_credit)}</strong>
                        <small>
                          Balance {formatMoney(item.cash_challenge_balance_after)}
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {formatMoney(item.wallet_before)} →{" "}
                    {formatMoney(item.wallet_after)}
                  </td>
                  <td>
                    {item.cash_off_before === null
                      ? "—"
                      : `${formatMoney(item.cash_off_before)} → ${formatMoney(
                          item.cash_off_after
                        )}`}
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!safeRows.length && <Empty text="No spin logs found." />}
        </div>
      </section>
    </>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  helpTopic,
  actionLabel,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  helpTopic?: HelpKey;
  actionLabel?: string;
  action?: () => void;
}) {
  return (
    <header className="e40-section-header">
      <div>
        <small>{eyebrow}</small>
        <div className="e40-title-with-help">
          <h2>{title}</h2>
          {helpTopic && <HelpButton topic={helpTopic} />}
        </div>
        <p>{description}</p>
      </div>
      {actionLabel && <button onClick={action}>{actionLabel}</button>}
    </header>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="e40-empty">{text}</div>;
}

function Status({ value }: { value: unknown }) {
  const textValue = String(value || "unknown");
  return (
    <span className={`e40-status ${textValue.replace(/\s+/g, "-")}`}>
      {textValue}
    </span>
  );
}

function ModalShell({
  title,
  subtitle,
  helpTopic,
  close,
  children,
}: {
  title: string;
  subtitle: string;
  helpTopic: HelpKey;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div className="e40-modal-overlay" onMouseDown={close}>
      <section
        className="e40-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>EmmyTech Admin</small>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="e40-modal-actions">
            <HelpButton topic={helpTopic} />
            <button type="button" aria-label="Close editor" onClick={close}>×</button>
          </div>
        </header>
        <div className="e40-modal-body">{children}</div>
      </section>
    </div>
  );
}

function PrizeModal({ record, close, save }: any) {
  const [form, setForm] = useState({
    id: record?.id || "",
    label: record?.label || "",
    prize_type: record?.prize_type || "cash",
    gravity: record?.gravity ?? 1,
    stock: record?.stock ?? 0,
    monetary_value: record?.monetary_value ?? 0,
    is_active: record?.is_active ?? true,
    on_wheel: record?.on_wheel ?? true,
    near_miss: record?.near_miss ?? false,
  });

  return (
    <ModalShell
      title={record ? "Edit Wheel Prize" : "Add Wheel Prize"}
      subtitle="This controls the visible wheel segment."
      helpTopic="prize-editor"
      close={close}
    >
      <form
        className="e40-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(form);
        }}
      >
        <div className="e40-form-section">
          <div className="e40-form-section-title">
            <strong>Basic settings</strong>
            <small>The information an administrator changes most often.</small>
          </div>
          <Field label="Prize label">
            <input
              required
              value={form.label}
              onChange={(event) =>
                setForm({ ...form, label: event.target.value })
              }
            />
          </Field>

          <div className="e40-form-grid">
            <Field label="Prize type">
              <select
                value={form.prize_type}
                onChange={(event) =>
                  setForm({ ...form, prize_type: event.target.value })
                }
              >
                <option value="cash">Cash Off</option>
                <option value="retry">Try Again</option>
                <option value="bonus_spin">Bonus Spin</option>
                <option value="letter">Letter</option>
                <option value="merchandise">Merchandise</option>
                <option value="prize">Prize</option>
              </select>
            </Field>

            <Field label="Cash Off value">
              <input
                type="number"
                min="0"
                value={form.monetary_value}
                onChange={(event) =>
                  setForm({
                    ...form,
                    monetary_value: Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
        </div>

        <details className="e40-form-advanced">
          <summary>
            <span>
              <strong>Advanced settings</strong>
              <small>Probability, availability and wheel behaviour.</small>
            </span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="e40-form-advanced-body">
            <div className="e40-form-grid">
              <Field label="Gravity">
                <input
                  type="number"
                  min="0"
                  value={form.gravity}
                  onChange={(event) =>
                    setForm({ ...form, gravity: Number(event.target.value) })
                  }
                />
              </Field>

              <Field label="Stock">
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(event) =>
                    setForm({ ...form, stock: Number(event.target.value) })
                  }
                />
              </Field>
            </div>

            <div className="e40-checks">
              <Check
                label="Active"
                checked={form.is_active}
                set={(value: boolean) =>
                  setForm({ ...form, is_active: value })
                }
              />
              <Check
                label="Show on wheel"
                checked={form.on_wheel}
                set={(value: boolean) =>
                  setForm({ ...form, on_wheel: value })
                }
              />
              <Check
                label="Near miss"
                checked={form.near_miss}
                set={(value: boolean) =>
                  setForm({ ...form, near_miss: value })
                }
              />
            </div>
          </div>
        </details>

        <button className="e40-submit">Save Prize</button>
      </form>
    </ModalShell>
  );
}

function GroupModal({ record, close, save }: any) {
  const [form, setForm] = useState({
    id: record?.id || "",
    group_key: record?.group_key || "",
    group_name: record?.group_name || "",
    group_type: record?.group_type || "weighted",
    start_spin: record?.start_spin ?? 1,
    end_spin: record?.end_spin ?? "",
    priority: record?.priority ?? 100,
    is_active: record?.is_active ?? true,
    description: record?.description || "",
  });

  return (
    <ModalShell
      title={record ? "Edit Rule Group" : "Create Rule Group"}
      subtitle="A group decides which formula applies to a spin range."
      helpTopic="group-editor"
      close={close}
    >
      <form
        className="e40-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(form);
        }}
      >
        <div className="e40-form-section">
          <div className="e40-form-section-title">
            <strong>Basic settings</strong>
            <small>Name the group and choose its selection method.</small>
          </div>
          <div className="e40-form-grid">
            <Field label="Group key">
              <input
                required
                value={form.group_key}
                onChange={(event) =>
                  setForm({ ...form, group_key: event.target.value })
                }
              />
            </Field>
            <Field label="Group name">
              <input
                required
                value={form.group_name}
                onChange={(event) =>
                  setForm({ ...form, group_name: event.target.value })
                }
              />
            </Field>
            <Field label="Group type">
              <select
                value={form.group_type}
                onChange={(event) =>
                  setForm({ ...form, group_type: event.target.value })
                }
              >
                <option value="fixed">Fixed</option>
                <option value="weighted">Weighted / Shuffle</option>
                <option value="checkpoint">Checkpoint</option>
              </select>
            </Field>
          </div>
        </div>

        <details className="e40-form-advanced">
          <summary>
            <span>
              <strong>Advanced settings</strong>
              <small>Range, priority and operational notes.</small>
            </span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="e40-form-advanced-body">
            <div className="e40-form-grid">
              <Field label="Priority (lower wins)">
                <input
                  type="number"
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Start spin">
                <input
                  type="number"
                  min="1"
                  value={form.start_spin}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      start_spin: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="End spin (blank = forever)">
                <input
                  type="number"
                  min="1"
                  value={form.end_spin}
                  onChange={(event) =>
                    setForm({ ...form, end_spin: event.target.value })
                  }
                />
              </Field>
            </div>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </Field>

            <Check
              label="Group active"
              checked={form.is_active}
              set={(value: boolean) =>
                setForm({ ...form, is_active: value })
              }
            />
          </div>
        </details>

        <button className="e40-submit">Save Rule Group</button>
      </form>
    </ModalShell>
  );
}

function ItemModal({ record, groups, close, save }: any) {
  const [form, setForm] = useState({
    id: record?.id || "",
    group_id: record?.group_id || groups?.[0]?.id || "",
    item_key: record?.item_key || "",
    result_label: record?.result_label || "",
    result_type: record?.result_type || "cash",
    cash_amount: record?.cash_amount ?? 0,
    letter_code: record?.letter_code || "",
    bonus_spins: record?.bonus_spins ?? 0,
    gravity: record?.gravity ?? 1,
    item_order: record?.item_order ?? 1,
    max_uses_per_user: record?.max_uses_per_user ?? 999,
    is_active: record?.is_active ?? true,
  });

  return (
    <ModalShell
      title={record?.id ? "Edit Rule Item" : "Add Rule Item"}
      subtitle="This is the actual reward inside a rule group."
      helpTopic="item-editor"
      close={close}
    >
      <form
        className="e40-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(form);
        }}
      >
        <div className="e40-form-section">
          <div className="e40-form-section-title">
            <strong>Basic settings</strong>
            <small>Choose the group and define the reward customers will see.</small>
          </div>
          <Field label="Rule group">
            <select
              value={form.group_id}
              onChange={(event) =>
                setForm({ ...form, group_id: event.target.value })
              }
            >
              {groups.map((group: any) => (
                <option key={group.id} value={group.id}>
                  {group.group_name}
                </option>
              ))}
            </select>
          </Field>

          <div className="e40-form-grid">
            <Field label="Item key">
              <input
                required
                value={form.item_key}
                onChange={(event) =>
                  setForm({ ...form, item_key: event.target.value })
                }
              />
            </Field>
            <Field label="Result label">
              <input
                required
                value={form.result_label}
                onChange={(event) =>
                  setForm({ ...form, result_label: event.target.value })
                }
              />
            </Field>
            <Field label="Result type">
              <select
                value={form.result_type}
                onChange={(event) =>
                  setForm({ ...form, result_type: event.target.value })
                }
              >
                <option value="cash">Cash Off</option>
                <option value="retry">Try Again</option>
                <option value="bonus_spin">Bonus Spin</option>
                <option value="letter">Letter</option>
                <option value="prize">Prize</option>
              </select>
            </Field>
            <Field label="Cash Off amount">
              <input
                type="number"
                min="0"
                value={form.cash_amount}
                onChange={(event) =>
                  setForm({
                    ...form,
                    cash_amount: Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
        </div>

        <details className="e40-form-advanced">
          <summary>
            <span>
              <strong>Advanced settings</strong>
              <small>Letter, bonus, probability and per-user limits.</small>
            </span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="e40-form-advanced-body">
            <div className="e40-form-grid">
              <Field label="Letter code">
                <input
                  value={form.letter_code}
                  onChange={(event) =>
                    setForm({ ...form, letter_code: event.target.value })
                  }
                  placeholder="EM, MY, TE..."
                />
              </Field>
              <Field label="Bonus spins">
                <input
                  type="number"
                  min="0"
                  value={form.bonus_spins}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      bonus_spins: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Gravity">
                <input
                  type="number"
                  min="0"
                  value={form.gravity}
                  onChange={(event) =>
                    setForm({ ...form, gravity: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="Item order">
                <input
                  type="number"
                  min="1"
                  value={form.item_order}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      item_order: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Max uses per user">
                <input
                  type="number"
                  min="1"
                  value={form.max_uses_per_user}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      max_uses_per_user: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>

            <Check
              label="Item active"
              checked={form.is_active}
              set={(value: boolean) =>
                setForm({ ...form, is_active: value })
              }
            />
          </div>
        </details>

        <button className="e40-submit">Save Rule Item</button>
      </form>
    </ModalShell>
  );
}

function CashOffModal({ name, close, save }: any) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");

  return (
    <ModalShell
      title="Adjust Cash Off"
      subtitle={`${name} — positive adds credit, negative removes credit.`}
      helpTopic="cashoff-adjustment"
      close={close}
    >
      <form
        className="e40-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(Number(amount), reason);
        }}
      >
        <Field label="Adjustment amount">
          <input
            type="number"
            required
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            placeholder="e.g. 500 or -500"
          />
        </Field>

        <Field label="Reason">
          <textarea
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this balance changing?"
          />
        </Field>

        <div className="e40-warning">
          Every adjustment creates an immutable Cash Off transaction.
        </div>

        <button className="e40-submit">Apply Adjustment</button>
      </form>
    </ModalShell>
  );
}

function UserModal({ data, close, addSpins, adjustCashOff }: any) {
  const player = data.player;
  const identity = data.identity;
  const account = data.cashOffAccount;
  const activeChallenge = (data.challenges || []).find((item: any) =>
    ["active", "cash_eligible"].includes(String(item.status || ""))
  ) || data.challenges?.[0];
  const [spinAmount, setSpinAmount] = useState(1);
  const phone = cleanPhone(
    identity?.primary_phone || player.phone_number
  );
  const whatsappMessage = encodeURIComponent(
    `Hello ${identity?.primary_name || player.full_name || "there"}, this is EmmyTech. We are contacting you about your Spin & Save rewards.`
  );

  return (
    <ModalShell
      title={identity?.primary_name || player.full_name || "Player"}
      subtitle={
        identity?.primary_phone ||
        player.phone_number ||
        identity?.primary_email ||
        player.email
      }
      helpTopic="user-details"
      close={close}
    >
      <div className="e40-user-summary">
        <Stat title="Spins Left" value={player.spins_remaining || 0} icon="↻" />
        <Stat
          title="Cash Off"
          value={formatMoney(account?.balance || 0)}
          icon="₦"
        />
        <Stat
          title="Referrals"
          value={player.total_referrals_count || 0}
          icon="＋"
        />
        <Stat
          title="Prizes"
          value={data.prizes?.length || 0}
          icon="✦"
        />
        <Stat
          title="Daily Spin"
          value={
            data.deployment?.dailyEntitlement
              ? player.daily_spin_available
                ? "Ready"
                : "Used"
              : "Not deployed"
          }
          icon="◷"
        />
      </div>

      <div className="e40-user-actions">
        <input
          type="number"
          value={spinAmount}
          onChange={(event) => setSpinAmount(Number(event.target.value))}
        />
        <button onClick={() => addSpins(spinAmount)}>Adjust Spins</button>
        <button onClick={adjustCashOff}>Adjust Cash Off</button>
        {phone && (
          <a
            href={`https://wa.me/${phone}?text=${whatsappMessage}`}
            target="_blank"
            rel="noreferrer"
          >
            Message on WhatsApp
          </a>
        )}
      </div>

      <h3 className="e40-subheading">Cash Challenge</h3>
      {activeChallenge ? (
        <div className="e40-user-challenge">
          <span>
            <small>Current balance</small>
            <strong>{formatMoney(activeChallenge.cash_balance)}</strong>
          </span>
          <span>
            <small>Target</small>
            <strong>{formatMoney(activeChallenge.cash_target)}</strong>
          </span>
          <span>
            <small>Deadline</small>
            <strong>{formatDate(activeChallenge.expires_at)}</strong>
          </span>
          <Status value={activeChallenge.status} />
        </div>
      ) : (
        <Empty text="This player has not started a Cash Challenge." />
      )}

      {(data.challengeCredits || []).length > 0 && (
        <div className="e40-detail-list e40-user-credit-list">
          {data.challengeCredits.slice(0, 8).map((credit: any) => (
            <article key={credit.id}>
              <span>
                <strong>Challenge credit</strong>
                <small>{formatDate(credit.created_at)}</small>
              </span>
              <b>
                +{formatMoney(credit.amount_credited)} · {formatMoney(credit.balance_after)} total
              </b>
            </article>
          ))}
        </div>
      )}

      <h3 className="e40-subheading">Growth & Guide Activity</h3>
      <div className="e40-detail-list">
        {(data.referralAwards || []).slice(0, 6).map((award: any) => (
          <article key={`referral-${award.id}`}>
            <span>
              <strong>Referral bonus</strong>
              <small>{formatDate(award.created_at)}</small>
            </span>
            <b>+{award.spins_awarded || 0} spins</b>
          </article>
        ))}
        {(data.shareBonusClaims || []).slice(0, 6).map((claim: any) => (
          <article key={`share-${claim.id}`}>
            <span>
              <strong>Share bonus</strong>
              <small>{formatDate(claim.created_at)}</small>
            </span>
            <b>+1 spin</b>
          </article>
        ))}
        {(data.guideEvents || []).slice(0, 6).map((event: any) => (
          <article key={`guide-${event.id}`}>
            <span>
              <strong>{event.title || event.event_type}</strong>
              <small>{formatDate(event.created_at)}</small>
            </span>
            <Status value={String(event.event_type || "").replace("spin_reward_guide_", "")} />
          </article>
        ))}
        {!data.referralAwards?.length &&
          !data.shareBonusClaims?.length &&
          !data.guideEvents?.length && (
            <Empty text="No referral, share or reward-guide events yet." />
          )}
      </div>

      {(data.cashouts || []).length > 0 && (
        <>
          <h3 className="e40-subheading">Cashout History</h3>
          <div className="e40-detail-list">
            {data.cashouts.slice(0, 8).map((cashout: any) => (
              <article key={cashout.id}>
                <span>
                  <strong>{formatMoney(cashout.amount)}</strong>
                  <small>{formatDate(cashout.requested_at || cashout.created_at)}</small>
                </span>
                <Status value={cashout.status} />
              </article>
            ))}
          </div>
        </>
      )}

      <h3 className="e40-subheading">Recent Spins</h3>
      <div className="e40-detail-list">
        {(data.spins || []).slice(0, 12).map((spin: any) => (
          <article key={spin.id}>
            <span>
              <strong>{spin.result_label}</strong>
              <small>{formatDate(spin.created_at)}</small>
            </span>
            <b>{formatMoney(spin.cash_amount)}</b>
          </article>
        ))}
      </div>

      <h3 className="e40-subheading">Prize Inventory</h3>
      <div className="e40-detail-list">
        {(data.prizes || []).slice(0, 12).map((prize: any) => (
          <article key={prize.id}>
            <span>
              <strong>{prize.prize_label}</strong>
              <small>{formatDate(prize.created_at)}</small>
            </span>
            <Status value={prize.status} />
          </article>
        ))}
      </div>
    </ModalShell>
  );
}

function Field({ label, children }: any) {
  return (
    <label className="e40-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, set }: any) {
  return (
    <label className="e40-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => set(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
