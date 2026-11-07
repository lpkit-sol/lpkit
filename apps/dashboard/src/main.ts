import { Connection, PublicKey } from "@solana/web3.js";
import {
  fetchPoolClassification,
  fetchPosition,
  fetchPositionsByOwner,
  fetchTokenCompatibility,
  type DammV2PoolClassification,
  type DammV2PositionClassification,
  type DammV2TokenCompatibility,
  type FeeSchedule,
  type CollectFeeModeKind,
} from "@lpkit-sol/damm-v2";
import {
  COLLECT_LABEL,
  SCHEDULE_LABEL,
  describeActivation,
  describeBaseFee,
  escapeHtml,
  explorerLink,
  percent,
  share,
  shortAddress,
  tokenAmount,
} from "./format.js";

// api.mainnet-beta.solana.com answers 403 to browser origins; PublicNode allows CORS without a key.
const DEFAULT_RPC = "https://solana-rpc.publicnode.com";
const RPC_KEY = "lpkit.rpc";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- RPC -----------------------------------------------------------------

function loadRpc(): string {
  try {
    return localStorage.getItem(RPC_KEY) || DEFAULT_RPC;
  } catch {
    return DEFAULT_RPC;
  }
}

let rpcUrl = loadRpc();
const connection = () => new Connection(rpcUrl, "confirmed");

$<HTMLInputElement>("rpc-input").value = rpcUrl;
$<HTMLFormElement>("rpc-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = $<HTMLInputElement>("rpc-input").value.trim() || DEFAULT_RPC;
  rpcUrl = value;
  try {
    localStorage.setItem(RPC_KEY, value);
  } catch {
    // Storage unavailable: the setting still applies for this visit.
  }
});

// --- Tabs ----------------------------------------------------------------

const tabs = document.querySelectorAll<HTMLButtonElement>("[data-tab]");
function showTab(name: string) {
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(active));
    $(`tab-${tab.dataset.tab}`).hidden = !active;
  }
  if (name === "presets") void loadPresets();
}
for (const tab of tabs) tab.addEventListener("click", () => showTab(tab.dataset.tab ?? "pool"));

// --- Shared helpers ------------------------------------------------------

const kv = (key: string, value: string) =>
  `<div class="kv"><p class="k">${escapeHtml(key)}</p><p class="v">${value}</p></div>`;

function showError(target: HTMLElement, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  target.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}

async function withBusy(form: HTMLFormElement, run: () => Promise<void>) {
  const button = form.querySelector("button");
  if (button) button.disabled = true;
  try {
    await run();
  } finally {
    if (button) button.disabled = false;
  }
}

// --- Pool ----------------------------------------------------------------

function renderPool(p: DammV2PoolClassification): string {
  const collect =
    p.feeCollection.mode === "compounding"
      ? `Compounding (${percent(p.feeCollection.compoundingFeeBps)} of LP fees reinvested)`
      : COLLECT_LABEL[p.feeCollection.mode];
  const locked =
    p.liquidity.permanentlyLockedPercent === null
      ? "No liquidity"
      : `${p.liquidity.permanentlyLockedPercent}% permanently locked`;
  return `
    <div class="card">
      <h2>${escapeHtml(SCHEDULE_LABEL[p.feeSchedule])}</h2>
      <p class="summary">${escapeHtml(describeBaseFee(p.baseFee, p.activation.type))}</p>
    </div>
    <div class="card"><div class="grid">
      ${kv("Fees collected in", escapeHtml(collect))}
      ${kv("Dynamic fee", p.dynamicFee.enabled ? "On (rises with volatility)" : "Off")}
      ${kv("Max total fee", percent(p.maxFeeBps))}
      ${kv("Protocol share of fees", `${p.protocolFeePercent}%`)}
      ${kv("Token A", `${explorerLink(p.tokenA.mint)} · ${escapeHtml(p.tokenA.tokenProgram)}`)}
      ${kv("Token B", `${explorerLink(p.tokenB.mint)} · ${escapeHtml(p.tokenB.tokenProgram)}`)}
      ${kv("Price range", escapeHtml(p.priceRange))}
      ${kv("Liquidity", escapeHtml(locked))}
      ${kv("Trading opens", escapeHtml(describeActivation(p.activation.type, p.activation.point)))}
      ${kv("Pool type", escapeHtml(p.poolType))}
      ${kv("Alpha vault", p.alphaVault ? explorerLink(p.alphaVault) : "None")}
      ${kv("Creator", explorerLink(p.creator))}
    </div></div>`;
}

const poolForm = $<HTMLFormElement>("pool-form");
poolForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const out = $("pool-out");
  const address = $<HTMLInputElement>("pool-input").value.trim();
  if (!address) return;
  void withBusy(poolForm, async () => {
    out.innerHTML = `<p class="meta">Reading pool…</p>`;
    try {
      out.innerHTML = renderPool(await fetchPoolClassification(connection(), address));
    } catch (error) {
      showError(out, error);
    }
  });
});

// --- Positions -----------------------------------------------------------

const DAMM_V2_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

// Free public RPCs refuse "indexed" calls (getProgramAccounts, getTokenAccountsByOwner).
const isIndexedRefusal = (error: unknown) =>
  /403|forbidden|personal token|not allowed|disabled/i.test(
    error instanceof Error ? error.message : String(error),
  );

function pair(p: DammV2PositionClassification, amounts: { tokenA: string; tokenB: string }) {
  return [
    `${escapeHtml(tokenAmount(amounts.tokenA, p.tokenA.decimals))} ${explorerLink(p.tokenA.mint)}`,
    `${escapeHtml(tokenAmount(amounts.tokenB, p.tokenB.decimals))} ${explorerLink(p.tokenB.mint)}`,
  ].join("<br>");
}

function describeLiquidity(p: DammV2PositionClassification): string {
  const { total, unlocked, vested, permanentlyLocked } = p.liquidity;
  const parts = [
    [unlocked, "unlocked"],
    [vested, "vesting"],
    [permanentlyLocked, "permanently locked"],
  ] as const;
  return (
    parts
      .filter(([part]) => BigInt(part) > 0n)
      .map(([part, label]) => `${share(part, total)} ${label}`)
      .join(", ") || "Empty"
  );
}

function describeVesting(p: DammV2PositionClassification, accountsSkipped: boolean): string {
  if (p.vesting.length === 0) {
    return BigInt(p.liquidity.vested) > 0n && accountsSkipped
      ? "Schedule not loaded (this RPC does not allow the lookup)"
      : "None";
  }
  const available = p.vesting.reduce((sum, v) => sum + BigInt(v.availableToRelease ?? "0"), 0n);
  const done = p.vesting.filter((v) => v.complete).length;
  const count = `${p.vesting.length} schedule${p.vesting.length > 1 ? "s" : ""}, ${done} complete`;
  return `${count} · ${share(available.toString(), p.liquidity.total)} of the position can be released now`;
}

function renderPosition(p: DammV2PositionClassification, accountsSkipped: boolean): string {
  const poolLink = `<a class="mono" href="?pool=${escapeHtml(p.pool)}">${escapeHtml(shortAddress(p.pool))}</a>`;
  // Reward decimals are only known when the reward is one of the pool tokens.
  const rewardDecimals = (mint: string) =>
    mint === p.tokenA.mint ? p.tokenA.decimals : mint === p.tokenB.mint ? p.tokenB.decimals : null;
  const rewards = p.rewards.length
    ? p.rewards
        .map((r) =>
          r.pending === null
            ? `— ${explorerLink(r.mint)}`
            : `${escapeHtml(tokenAmount(r.pending, rewardDecimals(r.mint)))} ${explorerLink(r.mint)}`,
        )
        .join("<br>")
    : "None";
  const poolShare =
    p.liquidity.poolSharePercent === null ? "—" : `${p.liquidity.poolSharePercent}%`;
  const delegates = p.delegatePermissions.length
    ? escapeHtml(p.delegatePermissions.join(", "))
    : "None";
  return `
    <div class="card">
      <h2>Position ${explorerLink(p.address)} <span class="meta">in pool ${poolLink}</span></h2>
      <div class="grid">
        ${kv("Current value", pair(p, p.amounts))}
        ${kv("Unclaimed fees", pair(p, p.unclaimedFees))}
        ${kv("Fees claimed so far", pair(p, p.claimedFees))}
        ${kv("Share of pool", poolShare)}
        ${kv("Liquidity", escapeHtml(describeLiquidity(p)))}
        ${kv("Vesting", escapeHtml(describeVesting(p, accountsSkipped)))}
        ${kv("Pending rewards", rewards)}
        ${kv("Delegates", delegates)}
      </div>
    </div>`;
}

async function readPositions(address: string): Promise<string> {
  const conn = connection();
  const key = new PublicKey(address);
  const info = await conn.getAccountInfo(key);
  const isPosition = info?.owner.toBase58() === DAMM_V2_PROGRAM;

  // Vesting accounts need getProgramAccounts; fall back without them if the RPC refuses.
  const load = async (vestingAccounts: boolean) =>
    isPosition
      ? [await fetchPosition(conn, key, undefined, { vestingAccounts })]
      : await fetchPositionsByOwner(conn, key, undefined, { vestingAccounts });

  let positions: DammV2PositionClassification[];
  let skipped = false;
  try {
    positions = await load(true);
  } catch (error) {
    if (!isIndexedRefusal(error)) throw error;
    try {
      positions = await load(false);
      skipped = true;
    } catch (retryError) {
      if (isIndexedRefusal(retryError) && !isPosition) {
        throw new Error(
          "This RPC does not allow wallet lookups (getTokenAccountsByOwner). Paste a position address instead, or set an RPC with your own key in RPC settings below.",
          { cause: retryError },
        );
      }
      throw retryError;
    }
  }

  if (positions.length === 0) {
    return `<p class="meta">No DAMM v2 positions held by this wallet.</p>`;
  }
  const header = isPosition
    ? ""
    : `<p class="meta">${positions.length} position${positions.length > 1 ? "s" : ""}, largest first.</p>`;
  return (
    header +
    positions.map((p) => renderPosition(p, skipped)).join("") +
    `<p class="meta">Value is what the liquidity is worth at the current pool price. Amounts are rounded down.</p>`
  );
}

const positionsForm = $<HTMLFormElement>("positions-form");
positionsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const out = $("positions-out");
  const address = $<HTMLInputElement>("positions-input").value.trim();
  if (!address) return;
  void withBusy(positionsForm, async () => {
    out.innerHTML = `<p class="meta">Reading positions…</p>`;
    try {
      out.innerHTML = await readPositions(address);
    } catch (error) {
      showError(out, error);
    }
  });
});

// --- Token ---------------------------------------------------------------

const STATUS: Record<DammV2TokenCompatibility["status"], [string, string]> = {
  supported: ["ok", "Supported"],
  "supported-with-token-badge": ["ok", "Supported (token badge exists)"],
  "requires-token-badge": ["warn", "Needs a token badge"],
  unsupported: ["bad", "Not supported"],
};

function renderToken(t: DammV2TokenCompatibility): string {
  const [tone, label] = STATUS[t.status];
  const extensions = t.extensions.length
    ? t.extensions
        .map((e) => `${escapeHtml(e.name)}${e.allowedWithoutBadge ? "" : " (needs badge)"}`)
        .join(", ")
    : "None";
  const fee = t.transferFee
    ? `${percent(t.transferFee.activeBps)} of every transfer is withheld`
    : "None";
  return `
    <div class="card">
      <h2><span class="pill ${tone}">${label}</span></h2>
      <ul class="reasons">${t.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
    </div>
    <div class="card"><div class="grid">
      ${kv("Token program", escapeHtml(t.tokenProgram))}
      ${kv("Extensions", extensions)}
      ${kv("Transfer fee", escapeHtml(fee))}
      ${kv("Freeze authority", t.freezeAuthority ? `${explorerLink(t.freezeAuthority)} (can freeze accounts)` : "None")}
      ${kv("Mint authority", t.mintAuthority ? explorerLink(t.mintAuthority) : "None")}
      ${kv("Token badge", `${explorerLink(t.tokenBadge.address)} · ${t.tokenBadge.exists ? "exists" : "not created"}`)}
    </div></div>`;
}

const tokenForm = $<HTMLFormElement>("token-form");
tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const out = $("token-out");
  const mint = $<HTMLInputElement>("token-input").value.trim();
  if (!mint) return;
  void withBusy(tokenForm, async () => {
    out.innerHTML = `<p class="meta">Checking token…</p>`;
    try {
      out.innerHTML = renderToken(await fetchTokenCompatibility(connection(), mint));
    } catch (error) {
      showError(out, error);
    }
  });
});

// --- Presets -------------------------------------------------------------

interface PresetRow {
  address: string;
  index: string;
  feeSchedule: FeeSchedule;
  startBps: number | null;
  endBps: number | null;
  collectMode: CollectFeeModeKind;
  compoundingFeeBps: number | null;
  dynamicFee: boolean;
}

let presets: PresetRow[] | null = null;

function fillSelect(id: string, values: string[], label: (v: string) => string) {
  const select = $<HTMLSelectElement>(id);
  for (const value of values) select.add(new Option(label(value), value));
  select.addEventListener("change", renderPresets);
}

async function loadPresets() {
  if (presets) return;
  const out = $("presets-out");
  out.innerHTML = `<p class="meta">Loading presets…</p>`;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}presets.json`);
    if (!response.ok) throw new Error(`Could not load presets (${response.status})`);
    const data = (await response.json()) as {
      generatedAt: string;
      count: number;
      presets: PresetRow[];
    };
    presets = data.presets;
    $("presets-meta").textContent =
      `${data.count} public presets, read from mainnet on ${new Date(data.generatedAt).toUTCString()}.`;
    const unique = <T>(pick: (p: PresetRow) => T) => [...new Set(presets!.map(pick))];
    fillSelect(
      "f-schedule",
      unique((p) => p.feeSchedule),
      (v) => SCHEDULE_LABEL[v as FeeSchedule],
    );
    fillSelect(
      "f-collect",
      unique((p) => p.collectMode),
      (v) => COLLECT_LABEL[v as CollectFeeModeKind],
    );
    fillSelect(
      "f-start",
      unique((p) => String(p.startBps)).sort((a, b) => Number(a) - Number(b)),
      (v) => percent(Number(v)),
    );
    renderPresets();
  } catch (error) {
    showError(out, error);
  }
}

function renderPresets() {
  if (!presets) return;
  const schedule = $<HTMLSelectElement>("f-schedule").value;
  const collect = $<HTMLSelectElement>("f-collect").value;
  const start = $<HTMLSelectElement>("f-start").value;
  const rows = presets.filter(
    (p) =>
      (!schedule || p.feeSchedule === schedule) &&
      (!collect || p.collectMode === collect) &&
      (!start || String(p.startBps) === start),
  );
  $("presets-out").innerHTML = `
    <p class="meta">${rows.length} matching</p>
    <div class="table-wrap"><table>
      <tr><th>#</th><th>Config</th><th>Fee schedule</th><th>Start → end</th><th>Fees collected</th><th>Dynamic fee</th></tr>
      ${rows
        .map(
          (p) => `<tr>
            <td>${escapeHtml(p.index)}</td>
            <td>${explorerLink(p.address)}</td>
            <td>${escapeHtml(SCHEDULE_LABEL[p.feeSchedule])}</td>
            <td>${percent(p.startBps)} → ${percent(p.endBps)}</td>
            <td>${escapeHtml(COLLECT_LABEL[p.collectMode])}${p.compoundingFeeBps !== null ? ` (${percent(p.compoundingFeeBps)} reinvested)` : ""}</td>
            <td>${p.dynamicFee ? "On" : "Off"}</td>
          </tr>`,
        )
        .join("")}
    </table></div>`;
}

// Deep link: ?pool=<address>, ?token=<mint> or ?positions=<wallet or position>
const params = new URLSearchParams(location.search);
const poolParam = params.get("pool");
const tokenParam = params.get("token");
const positionsParam = params.get("positions");
if (positionsParam) {
  showTab("positions");
  $<HTMLInputElement>("positions-input").value = positionsParam;
  positionsForm.requestSubmit();
} else if (tokenParam) {
  showTab("token");
  $<HTMLInputElement>("token-input").value = tokenParam;
  tokenForm.requestSubmit();
} else if (poolParam) {
  $<HTMLInputElement>("pool-input").value = poolParam;
  poolForm.requestSubmit();
}
