import dotenv from "dotenv";
import express from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyEditedBlocksToPayload, classifyPayload } from "./classifier.js";
import { forwardPending, forwardRequest, postUpstreamJson } from "./forwarder.js";
import { shouldIntercept } from "./interceptor.js";
import { deletePending, getLatestPendingId, getPending, storePending, takePending } from "./store.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const uiDistDir = join(projectRoot, "dist", "ui");
const uiIndexPath = join(uiDistDir, "index.html");

const PORT = Number(process.env.PROXY_PORT || 3131);
const TARGET_API = process.env.TARGET_API || "https://api.anthropic.com";
const FINAL_CALL_TOKEN_THRESHOLD = Number(process.env.FINAL_CALL_TOKEN_THRESHOLD || 8000);
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

const app = express();
const sseClients = new Set();

const SUGGEST_SYSTEM_PROMPT = `You are a context optimization assistant. The user is about to send a large context
to an LLM for a coding task. Your job is to identify blocks that are likely to waste
tokens without adding accuracy.

You will receive a JSON array of context blocks. Each block has:

  - id: string

  - type: string (System Prompt / Tool Result / File Context / etc.)

  - content: string

  - tokens: number

Respond ONLY with a JSON array of suggestions. Each suggestion:

  {

    "blockId": "string",

    "action": "remove" | "trim" | "keep",

    "reason": "one sentence explanation",

    "trimTo": "optional shorter version of the content if action is trim"

  }

Rules:

  - Suggest "remove" for: duplicate info, boilerplate warnings, irrelevant file context

  - Suggest "trim" for: blocks with useful info buried in noise

  - Suggest "keep" for: anything directly relevant to the user task

  - Always include every block in your response

  - Be aggressive. Professionals prefer precision over safety.`;

app.use(express.json({ limit: "25mb" }));

function isOpenAiRoute(routePath) {
  return routePath.includes("/chat/completions");
}

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

function sendAgentError(agentRes, statusCode, message) {
  if (agentRes.headersSent) {
    agentRes.end();
    return;
  }

  agentRes.status(statusCode).json({
    error: message
  });
}

function serializeContextState(pending) {
  const classified = classifyPayload(pending.payload);
  return {
    id: pending.id,
    model: pending.payload?.model ?? "",
    provider: isOpenAiRoute(pending.routePath) ? "openai" : "anthropic",
    routePath: pending.routePath,
    blocks: classified.blocks,
    totals: classified.totals
  };
}

function resolveUiState(id, res) {
  const pending = getPending(id);
  if (!pending) {
    res.status(404).json({ error: "Pending request not found." });
    return null;
  }

  return pending;
}

function buildSuggestionRequest(pending, blocks) {
  const provider = isOpenAiRoute(pending.routePath) ? "openai" : "anthropic";
  const model =
    process.env.SUGGEST_MODEL ||
    pending.payload?.model ||
    (provider === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-5");
  const blockSummary = blocks.map(({ id, type, content, tokens }) => ({
    id,
    type,
    content,
    tokens
  }));

  if (provider === "openai") {
    return {
      routePath: "/v1/chat/completions",
      payload: {
        model,
        stream: false,
        messages: [
          {
            role: "system",
            content: SUGGEST_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: JSON.stringify(blockSummary)
          }
        ]
      }
    };
  }

  return {
    routePath: "/v1/messages",
    payload: {
      model,
      max_tokens: 1200,
      system: SUGGEST_SYSTEM_PROMPT,
      stream: false,
      messages: [
        {
          role: "user",
          content: JSON.stringify(blockSummary)
        }
      ]
    }
  };
}

function parseSuggestionsResponse(pending, upstreamResponse) {
  const provider = isOpenAiRoute(pending.routePath) ? "openai" : "anthropic";
  const rawText =
    provider === "openai"
      ? upstreamResponse?.choices?.[0]?.message?.content ?? "[]"
      : upstreamResponse?.content?.map((item) => item?.text ?? "").join("") ?? "[]";

  const cleanedText = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleanedText || "[]");
}

function sendUiBuildMessage(res) {
  res
    .status(503)
    .type("text/plain")
    .send("UI bundle not found. Run `npm run build` before `npm start`.");
}

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("retry: 1000\n\n");

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

app.get("/api/pending/latest", (_req, res) => {
  res.json({ id: getLatestPendingId() });
});

app.get("/context/:id", (req, res) => {
  const pending = resolveUiState(req.params.id, res);
  if (!pending) {
    return;
  }

  res.json({
    id: pending.id,
    payload: pending.payload
  });
});

app.get("/classify/:id", (req, res) => {
  const pending = resolveUiState(req.params.id, res);
  if (!pending) {
    return;
  }

  res.json(serializeContextState(pending));
});

app.post("/discard/:id", (req, res) => {
  const pending = takePending(req.params.id);
  if (!pending) {
    res.status(404).json({ error: "Pending request not found." });
    return;
  }

  sendAgentError(pending.res, 400, "Request discarded by user.");
  res.json({ ok: true });
});

app.post("/send/:id", (req, res) => {
  const pending = takePending(req.params.id);
  if (!pending) {
    res.status(404).json({ error: "Pending request not found." });
    return;
  }

  const editedBlocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
  const payload =
    editedBlocks.length > 0
      ? applyEditedBlocksToPayload(pending.payload, editedBlocks)
      : {
          ...pending.payload,
          messages: Array.isArray(req.body?.messages) ? req.body.messages : pending.payload.messages
        };

  res.json({ ok: true });

  void forwardPending({
    pending,
    payload,
    targetApi: TARGET_API
  }).catch((error) => {
    console.error("Forwarding failed:", error);
    sendAgentError(pending.res, 502, "Failed to forward request to target API.");
  });
});

app.post("/suggest/:id", async (req, res) => {
  const pending = resolveUiState(req.params.id, res);
  if (!pending) {
    return;
  }

  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : serializeContextState(pending).blocks;
  const request = buildSuggestionRequest(pending, blocks);

  try {
    const upstreamResponse = await postUpstreamJson({
      targetApi: TARGET_API,
      routePath: request.routePath,
      payload: request.payload,
      headers: pending.headers
    });

    res.json({
      suggestions: parseSuggestionsResponse(pending, upstreamResponse)
    });
  } catch (error) {
    console.error("Suggestion request failed:", error);
    res.status(error.status || 502).json({
      error: error.body || "Suggestion request failed."
    });
  }
});

app.post(["/v1/messages", "/v1/chat/completions"], async (req, res) => {
  const payload = structuredClone(req.body ?? {});
  const routePath = req.path;
  const { isFinalCall, totalTokens } = shouldIntercept(payload, FINAL_CALL_TOKEN_THRESHOLD);

  if (isFinalCall) {
    const id = randomUUID();
    res.setTimeout(PENDING_TIMEOUT_MS + 30_000);

    storePending(
      id,
      {
        payload,
        headers: req.headers,
        res,
        routePath,
        totalTokens
      },
      (entry) => {
        sendAgentError(entry.res, 408, "Timed out waiting for review decision.");
      },
      PENDING_TIMEOUT_MS
    );

    res.on("close", () => {
      deletePending(id);
    });

    console.log(`INTERCEPTED ${totalTokens} tokens`);
    console.log(`Open http://localhost:${PORT}/ui`);
    broadcast({ type: "context-ready", id });
    return;
  }

  try {
    await forwardRequest({
      targetApi: TARGET_API,
      routePath,
      payload,
      headers: req.headers,
      res
    });
  } catch (error) {
    console.error("Proxy forwarding failed:", error);
    sendAgentError(res, 502, "Failed to reach target API.");
  }
});

app.use("/assets", express.static(join(uiDistDir, "assets")));

app.get("/ui", (_req, res) => {
  if (!existsSync(uiIndexPath)) {
    sendUiBuildMessage(res);
    return;
  }

  res.sendFile(uiIndexPath);
});

app.get("/ui/*", (_req, res) => {
  if (!existsSync(uiIndexPath)) {
    sendUiBuildMessage(res);
    return;
  }

  res.sendFile(uiIndexPath);
});

app.get("/", (_req, res) => {
  res.redirect("/ui");
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`Context Visualizer proxy listening on http://localhost:${PORT}`);
});

server.requestTimeout = 0;
server.headersTimeout = 0;
