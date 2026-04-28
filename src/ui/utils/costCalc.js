import rates from "../../config/rates.js";

export function getModelRate(modelName = "") {
  return rates[modelName] ?? 0;
}

export function calculateBlockCost(tokens, modelName) {
  const rate = getModelRate(modelName);
  return (Number(tokens || 0) / 1_000_000) * rate;
}

export function formatUsd(value) {
  return `$${Number(value || 0).toFixed(6)}`;
}

export function sumCosts(blocks) {
  return blocks.reduce((total, block) => total + Number(block.cost || 0), 0);
}
