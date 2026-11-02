import { Connection } from "@solana/web3.js";
import {
  fetchPoolClassification,
  fetchTokenCompatibility,
  type DammV2PoolClassification,
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

// Deep link: ?pool=<address> or ?token=<mint>
const params = new URLSearchParams(location.search);
const poolParam = params.get("pool");
const tokenParam = params.get("token");
if (tokenParam) {
  showTab("token");
  $<HTMLInputElement>("token-input").value = tokenParam;
  tokenForm.requestSubmit();
} else if (poolParam) {
  $<HTMLInputElement>("pool-input").value = poolParam;
  poolForm.requestSubmit();
}
