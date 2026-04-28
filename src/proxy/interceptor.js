import { classifyPayload } from "./classifier.js";

export function estimatePayloadTokens(payload) {
  const { totals } = classifyPayload(payload);
  return totals.tokens;
}

export function shouldIntercept(payload, threshold) {
  const totalTokens = estimatePayloadTokens(payload);
  const hasTools = Array.isArray(payload?.tools) && payload.tools.length > 0;
  const isFinalCall = !hasTools || totalTokens > threshold;

  return {
    hasTools,
    isFinalCall,
    totalTokens
  };
}
