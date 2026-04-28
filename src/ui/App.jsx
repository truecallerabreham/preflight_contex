import { useEffect, useRef, useState } from "react";
import ActionPanel from "./components/ActionPanel.jsx";
import BlockEditor from "./components/BlockEditor.jsx";
import BlockList from "./components/BlockList.jsx";
import CostBar from "./components/CostBar.jsx";
import { useSSE } from "./hooks/useSSE.js";
import { useTokenCount } from "./hooks/useTokenCount.js";
import { calculateTotals } from "./utils/tokenizer.js";

function normalizeBlocks(blocks) {
  return blocks.map((block) => ({
    ...block,
    deleted: false
  }));
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

export default function App() {
  const [requestMeta, setRequestMeta] = useState(null);
  const [originalBlocks, setOriginalBlocks] = useState([]);
  const [draftBlocks, setDraftBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("Waiting for a final LLM call.");
  const [busy, setBusy] = useState({
    discard: false,
    load: false,
    send: false,
    suggest: false
  });
  const currentRequestIdRef = useRef(null);

  const metrics = useTokenCount(draftBlocks, requestMeta?.model || "");

  const displayBlocks = draftBlocks.map((block) => ({
    ...block,
    ...(metrics[block.id] || {
      tokens: block.tokens,
      cost: block.cost
    })
  }));

  const activeBlocks = displayBlocks.filter((block) => !block.deleted);
  const totals = calculateTotals(activeBlocks);
  const suggestionsById = suggestions.reduce((accumulator, suggestion) => {
    accumulator[suggestion.blockId] = suggestion;
    return accumulator;
  }, {});

  async function loadRequest(id) {
    if (!id || currentRequestIdRef.current === id) {
      return;
    }

    setBusy((current) => ({ ...current, load: true }));

    try {
      const data = await readJson(await fetch(`/classify/${id}`));
      const normalized = normalizeBlocks(data.blocks);

      currentRequestIdRef.current = id;
      setRequestMeta(data);
      setOriginalBlocks(normalized);
      setDraftBlocks(normalized);
      setSelectedBlockId(normalized[0]?.id ?? null);
      setSuggestions([]);
      setStatus("Intercepted context ready for review.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy((current) => ({ ...current, load: false }));
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const data = await readJson(await fetch("/api/pending/latest"));
        if (data.id) {
          await loadRequest(data.id);
        }
      } catch (error) {
        setStatus(error.message);
      }
    })();
  }, []);

  useSSE((event) => {
    if (event?.type === "context-ready" && event.id) {
      void loadRequest(event.id);
    }
  });

  function updateBlock(blockId, nextContent) {
    setDraftBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, content: nextContent, deleted: false } : block))
    );
  }

  function deleteBlock(blockId) {
    setDraftBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, deleted: true } : block))
    );
  }

  function restoreBlock(blockId) {
    setDraftBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, deleted: false } : block))
    );
  }

  function resetBlock(blockId) {
    const original = originalBlocks.find((block) => block.id === blockId);
    if (!original) {
      return;
    }

    setDraftBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              content: original.originalContent,
              deleted: false
            }
          : block
      )
    );
  }

  function clearSession(nextStatus) {
    currentRequestIdRef.current = null;
    setRequestMeta(null);
    setOriginalBlocks([]);
    setDraftBlocks([]);
    setSelectedBlockId(null);
    setSuggestions([]);
    setStatus(nextStatus);
  }

  function applySuggestion(suggestion) {
    setDraftBlocks((current) =>
      current.map((block) => {
        if (block.id !== suggestion.blockId) {
          return block;
        }

        if (suggestion.action === "remove") {
          return {
            ...block,
            deleted: true
          };
        }

        if (suggestion.action === "trim" && suggestion.trimTo) {
          return {
            ...block,
            content: suggestion.trimTo,
            deleted: false
          };
        }

        return {
          ...block,
          deleted: false
        };
      })
    );
  }

  async function sendContext() {
    if (!requestMeta?.id) {
      return;
    }

    setBusy((current) => ({ ...current, send: true }));

    try {
      await readJson(
        await fetch(`/send/${requestMeta.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            blocks: draftBlocks
          })
        })
      );

      clearSession("Edited context sent to the upstream LLM.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy((current) => ({ ...current, send: false }));
    }
  }

  async function discardContext() {
    if (!requestMeta?.id) {
      return;
    }

    setBusy((current) => ({ ...current, discard: true }));

    try {
      await readJson(
        await fetch(`/discard/${requestMeta.id}`, {
          method: "POST"
        })
      );

      clearSession("Pending call discarded.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy((current) => ({ ...current, discard: false }));
    }
  }

  async function requestSuggestions() {
    if (!requestMeta?.id) {
      return;
    }

    setBusy((current) => ({ ...current, suggest: true }));
    setStatus("Requesting optimization suggestions.");

    try {
      const data = await readJson(
        await fetch(`/suggest/${requestMeta.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            blocks: activeBlocks
          })
        })
      );

      setSuggestions(data.suggestions || []);
      setStatus("Suggestions ready.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy((current) => ({ ...current, suggest: false }));
    }
  }

  return (
    <div className="app-shell">
      <div className="top-strip">
        <div>
          <span className="eyebrow">Context Visualizer</span>
          <h1>Final-call review dashboard</h1>
        </div>
        {busy.load ? <span className="loading-pill">Loading context...</span> : null}
      </div>

      <CostBar totals={totals} model={requestMeta?.model} />

      <main className="workspace-grid">
        <section className="panel panel-list">
          <div className="panel-head">
            <span className="eyebrow">Panel A</span>
            <h2>Context Breakdown</h2>
          </div>
          <BlockList
            blocks={displayBlocks}
            selectedBlockId={selectedBlockId}
            suggestionsById={suggestionsById}
            onSelect={setSelectedBlockId}
            onApplySuggestion={applySuggestion}
          />
        </section>

        <section className="panel panel-editor">
          <div className="panel-head">
            <span className="eyebrow">Panel B</span>
            <h2>Context Editor</h2>
          </div>
          <BlockEditor
            blocks={displayBlocks}
            selectedBlockId={selectedBlockId}
            onChangeBlock={updateBlock}
            onDeleteBlock={deleteBlock}
            onResetBlock={resetBlock}
            onRestoreBlock={restoreBlock}
          />
        </section>

        <section className="panel panel-actions">
          <div className="panel-head">
            <span className="eyebrow">Panel C</span>
            <h2>Actions & Suggestions</h2>
          </div>
          <ActionPanel
            hasRequest={Boolean(requestMeta?.id)}
            busy={busy}
            status={status}
            suggestions={suggestions}
            onSend={sendContext}
            onDiscard={discardContext}
            onSuggest={requestSuggestions}
            onApplySuggestion={applySuggestion}
          />
        </section>
      </main>
    </div>
  );
}
