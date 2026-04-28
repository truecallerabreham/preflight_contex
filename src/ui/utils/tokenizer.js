import { getEncoding } from "js-tiktoken";
import { calculateBlockCost } from "./costCalc.js";

const encodingCache = new Map();

function resolveEncoding(modelName = "") {
  if (/claude/i.test(modelName)) {
    return "o200k_base";
  }

  return "cl100k_base";
}

function getCachedEncoding(encodingName) {
  if (!encodingCache.has(encodingName)) {
    encodingCache.set(encodingName, getEncoding(encodingName));
  }

  return encodingCache.get(encodingName);
}

export function countTokens(text, modelName = "") {
  const normalized = typeof text === "string" ? text : String(text ?? "");
  const encoding = getCachedEncoding(resolveEncoding(modelName));
  return encoding.encode(normalized).length;
}

export function enrichBlockMetrics(block, modelName) {
  const tokens = countTokens(block.content, modelName);
  const cost = calculateBlockCost(tokens, modelName);

  return {
    ...block,
    tokens,
    cost
  };
}

export function calculateTotals(blocks) {
  return blocks.reduce(
    (totals, block) => {
      totals.tokens += Number(block.tokens || 0);
      totals.cost += Number(block.cost || 0);
      return totals;
    },
    { tokens: 0, cost: 0 }
  );
}
