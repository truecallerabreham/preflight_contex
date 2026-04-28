export const BLOCK_COLORS = {
  "System Prompt": "#6B3FA0",
  "User Task": "#2D8653",
  "Tool Result": "#1A6B8A",
  "File Context": "#8A5A1A",
  "Assistant Turn": "#1A3A8A",
  "User Turn": "#3A3A3A",
  Unknown: "#888888"
};

export function getBlockColor(type) {
  return BLOCK_COLORS[type] ?? BLOCK_COLORS.Unknown;
}
