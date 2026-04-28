import SuggestionOverlay from "./SuggestionOverlay.jsx";

export default function ActionPanel({
  hasRequest,
  busy,
  status,
  suggestions,
  onSend,
  onDiscard,
  onSuggest,
  onApplySuggestion
}) {
  return (
    <aside className="action-panel">
      <div className="action-group">
        <button type="button" className="primary-button" onClick={onSend} disabled={!hasRequest || busy.send}>
          {busy.send ? "Sending..." : "Send to LLM"}
        </button>
        <button type="button" className="danger-button" onClick={onDiscard} disabled={!hasRequest || busy.discard}>
          {busy.discard ? "Discarding..." : "Discard"}
        </button>
        <button type="button" className="secondary-button" onClick={onSuggest} disabled={!hasRequest || busy.suggest}>
          {busy.suggest ? "Thinking..." : "AI Suggest"}
        </button>
      </div>

      <div className="status-panel">
        <span className="eyebrow">Status</span>
        <p>{status}</p>
      </div>

      <div className="suggestion-wrap">
        <span className="eyebrow">Suggestions</span>
        <SuggestionOverlay suggestions={suggestions} onApplySuggestion={onApplySuggestion} />
      </div>
    </aside>
  );
}
