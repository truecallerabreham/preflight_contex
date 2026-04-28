import { getBlockColor } from "../ui/utils/blockColors.js";
import { calculateTotals, enrichBlockMetrics } from "../ui/utils/tokenizer.js";

const FILE_CONTEXT_PATTERN = /\.(ts|js|py|go|rs|java|cpp|c|md|json|yaml|toml)\b/i;
const BINARY_PLACEHOLDER = "[Binary content not shown]";

function normalizeBinaryBlock(block) {
  if (block?.type === "image" || block?.type === "image_url" || block?.type === "input_image") {
    return BINARY_PLACEHOLDER;
  }

  return null;
}

function normalizeToolResultContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => extractText(item)).join("\n\n");
  }

  if (content == null) {
    return "";
  }

  return JSON.stringify(content, null, 2);
}

export function extractText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const binaryValue = normalizeBinaryBlock(block);
        if (binaryValue) {
          return binaryValue;
        }

        if (block?.type === "text") {
          return block.text ?? "";
        }

        if (block?.type === "tool_result") {
          return normalizeToolResultContent(block.content ?? "");
        }

        if (block?.type === "tool_use") {
          return `[Tool: ${block.name ?? "unknown"}]\n${JSON.stringify(block.input ?? {}, null, 2)}`;
        }

        if (typeof block?.text === "string") {
          return block.text;
        }

        if (typeof block?.content === "string") {
          return block.content;
        }

        if (block == null) {
          return "";
        }

        return JSON.stringify(block, null, 2);
      })
      .filter(Boolean)
      .join("\n\n");
  }

  if (content == null) {
    return "";
  }

  if (typeof content === "object") {
    return JSON.stringify(content, null, 2);
  }

  return String(content);
}

function hasToolResult(content) {
  return Array.isArray(content) && content.some((item) => item?.type === "tool_result");
}

function hasFileContextShape(role, text) {
  if (!text) {
    return false;
  }

  return (role === "user" || role === "assistant") && (FILE_CONTEXT_PATTERN.test(text) || text.length > 2000);
}

function classifyMessage(message, index, messages) {
  const role = message?.role ?? "unknown";
  const text = extractText(message?.content);
  const isLastMessage = index === messages.length - 1;

  if (role === "system") {
    return "System Prompt";
  }

  if (role === "user" && isLastMessage && !hasToolResult(message?.content)) {
    return "User Task";
  }

  if (role === "user" && hasToolResult(message?.content)) {
    return "Tool Result";
  }

  if (hasFileContextShape(role, text)) {
    return "File Context";
  }

  if (role === "assistant") {
    return "Assistant Turn";
  }

  if (role === "user") {
    return "User Turn";
  }

  return "Unknown";
}

function buildSystemBlocks(payload) {
  if (payload?.system == null || payload.system === "") {
    return [];
  }

  return [
    {
      id: "system-0",
      type: "System Prompt",
      role: "system",
      content: extractText(payload.system),
      originalContent: extractText(payload.system),
      order: 0,
      source: {
        kind: "system"
      }
    }
  ];
}

function buildMessageBlocks(payload, startOrder) {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];

  return messages.map((message, index) => {
    const content = extractText(message?.content);

    return {
      id: `message-${index}`,
      type: classifyMessage(message, index, messages),
      role: message?.role ?? "unknown",
      content,
      originalContent: content,
      order: startOrder + index,
      source: {
        kind: "message",
        index
      }
    };
  });
}

export function classifyPayload(payload) {
  const modelName = payload?.model ?? "";
  const baseBlocks = [...buildSystemBlocks(payload), ...buildMessageBlocks(payload, payload?.system ? 1 : 0)];
  const blocks = baseBlocks.map((block) =>
    enrichBlockMetrics(
      {
        ...block,
        color: getBlockColor(block.type)
      },
      modelName
    )
  );

  return {
    blocks,
    totals: calculateTotals(blocks)
  };
}

export function applyEditedBlocksToPayload(payload, editedBlocks = []) {
  const blockMap = new Map(editedBlocks.map((block) => [block.id, block]));
  const nextPayload = structuredClone(payload);

  if (blockMap.has("system-0")) {
    const systemBlock = blockMap.get("system-0");
    if (systemBlock.deleted) {
      delete nextPayload.system;
    } else {
      nextPayload.system = systemBlock.content;
    }
  }

  const originalMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  nextPayload.messages = originalMessages
    .map((message, index) => {
      const editedBlock = blockMap.get(`message-${index}`);
      if (!editedBlock) {
        return message;
      }

      if (editedBlock.deleted) {
        return null;
      }

      return {
        ...message,
        content: editedBlock.content
      };
    })
    .filter(Boolean);

  return nextPayload;
}
