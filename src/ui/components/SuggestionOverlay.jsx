export default function SuggestionOverlay({ suggestions, onApplySuggestion }) {
  if (!suggestions.length) {
    return (
      <div className="suggestion-panel empty">
        <p>No suggestions yet.</p>
      </div>
    );
  }

  return (
    <div className="suggestion-panel">
      {suggestions.map((suggestion) => (
        <button
          type="button"
          key={suggestion.blockId}
          className={`suggestion-row action-${suggestion.action}`}
          onClick={() => onApplySuggestion(suggestion)}
        >
          <strong>{suggestion.action.toUpperCase()}</strong>
          <span>{suggestion.reason}</span>
        </button>
      ))}
    </div>
  );
}
