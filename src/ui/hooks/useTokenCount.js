import { useEffect, useState } from "react";
import { calculateBlockCost } from "../utils/costCalc.js";
import { countTokens } from "../utils/tokenizer.js";

function computeMetrics(blocks, model) {
  const metrics = {};

  for (const block of blocks) {
    if (block.deleted) {
      metrics[block.id] = {
        tokens: 0,
        cost: 0
      };
      continue;
    }

    const tokens = countTokens(block.content, model);
    metrics[block.id] = {
      tokens,
      cost: calculateBlockCost(tokens, model)
    };
  }

  return metrics;
}

export function useTokenCount(blocks, model) {
  const [metrics, setMetrics] = useState(() => computeMetrics(blocks, model));

  useEffect(() => {
    const handle = setTimeout(() => {
      setMetrics(computeMetrics(blocks, model));
    }, 300);

    return () => clearTimeout(handle);
  }, [blocks, model]);

  return metrics;
}
