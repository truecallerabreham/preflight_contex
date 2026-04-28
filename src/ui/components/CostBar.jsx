import { formatUsd } from "../utils/costCalc.js";

export default function CostBar({ totals, model }) {
  return (
    <header className="cost-bar">
      <div>
        <span className="eyebrow">Total Tokens</span>
        <strong>{totals.tokens.toLocaleString()}</strong>
      </div>
      <div>
        <span className="eyebrow">Total Cost</span>
        <strong>{formatUsd(totals.cost)}</strong>
      </div>
      <div>
        <span className="eyebrow">Model</span>
        <strong>{model || "Unknown"}</strong>
      </div>
    </header>
  );
}
