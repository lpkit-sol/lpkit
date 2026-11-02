import type {
  ActivationKind,
  BaseFeeClassification,
  CollectFeeModeKind,
  FeeSchedule,
} from "@lpkit-sol/damm-v2";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function percent(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function explorerLink(address: string, label = shortAddress(address)): string {
  const safe = escapeHtml(address);
  return `<a class="mono" href="https://solscan.io/account/${safe}" target="_blank" rel="noopener" title="${safe}">${escapeHtml(label)}</a>`;
}

/** Seconds as a short human duration, e.g. "2 h" or "45 min". */
function duration(seconds: number): string {
  if (seconds >= 86_400) return `${+(seconds / 86_400).toFixed(1)} days`;
  if (seconds >= 3_600) return `${+(seconds / 3_600).toFixed(1)} h`;
  if (seconds >= 60) return `${+(seconds / 60).toFixed(1)} min`;
  return `${seconds} s`;
}

function units(count: number, activation: ActivationKind): string {
  return activation === "slot" ? `${count.toLocaleString("en-US")} slots` : duration(count);
}

export const SCHEDULE_LABEL: Record<FeeSchedule, string> = {
  constant: "Constant",
  "decaying-linear": "Decaying (linear)",
  "decaying-exponential": "Decaying (exponential)",
  "market-cap-linear": "Market cap (linear)",
  "market-cap-exponential": "Market cap (exponential)",
  "rate-limiter": "Rate limiter",
  unknown: "Unknown",
};

export const COLLECT_LABEL: Record<CollectFeeModeKind, string> = {
  "both-tokens": "Both tokens",
  "only-token-b": "Token B only",
  compounding: "Compounding",
  unknown: "Unknown",
};

/** One plain-English sentence describing how the base fee behaves. */
export function describeBaseFee(fee: BaseFeeClassification, activation: ActivationKind): string {
  switch (fee.kind) {
    case "time-scheduler": {
      if (fee.constant) return `Constant ${percent(fee.startingFee.bps)} fee.`;
      const total = fee.numberOfPeriods * Number(fee.periodFrequency);
      return `Starts at ${percent(fee.startingFee.bps)} and decays (${fee.curve}) to ${percent(fee.endingFee.bps)} over ${fee.numberOfPeriods} periods of ${units(Number(fee.periodFrequency), activation)} (${units(total, activation)} in total).`;
    }
    case "market-cap-scheduler":
      if (fee.constant) return `Constant ${percent(fee.startingFee.bps)} fee.`;
      return `Starts at ${percent(fee.startingFee.bps)} and decays (${fee.curve}) to ${percent(fee.endingFee.bps)} as the price rises from launch, in ${fee.numberOfPeriods} steps. After ${units(fee.schedulerExpirationDuration, activation)} the ending fee applies.`;
    case "rate-limiter":
      if (fee.constant) return `Constant ${percent(fee.startingFee.bps)} fee.`;
      return `Base fee ${percent(fee.startingFee.bps)}. For ${units(fee.maxLimiterDuration, activation)} after launch, larger buys pay more (+${fee.feeIncrementBps} bps per step, up to ${percent(fee.maxFeeBps)}).`;
    default:
      return `Unrecognised fee mode (${fee.mode}).`;
  }
}

export function describeActivation(type: ActivationKind, point: string): string {
  if (type === "timestamp") {
    const date = new Date(Number(point) * 1000);
    return Number.isNaN(date.getTime()) ? point : date.toUTCString();
  }
  if (type === "slot") return `Slot ${Number(point).toLocaleString("en-US")}`;
  return point;
}
