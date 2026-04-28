import BlockBadge from "./BlockBadge.jsx";
import { formatUsd } from "../utils/costCalc.js";

function suggestionLabel(suggestion) {
  if (!suggestion) {
    return null;
  }

  return suggestion.action.toUpperCase();
}

export default function BlockList({ blocks, selectedBlockId, suggestionsById, onSelect, onApplySuggestion }) {
  return (
    <div className="block-list">
      {blocks.map((block) => {
        const suggestion = suggestionsById[block.id];

        return (
          <div
            key={block.id}
            className={`block-list-item${selectedBlockId === block.id ? " is-selected" : ""}${block.deleted ? " is-deleted" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(block.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(block.id);
              }
            }}
          >
            <div className="block-list-head">
              <BlockBadge type={block.type} color={block.color} />
              {suggestion ? (
                <button
                  type="button"
                  className={`suggestion-chip action-${suggestion.action}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplySuggestion(suggestion);
                  }}
                >
                  {suggestionLabel(suggestion)}
                </button>
              ) : null}
            </div>

            <strong className="block-list-title">{block.role}</strong>
            <p className="block-list-preview">{block.deleted ? "Removed from outgoing context." : block.content}</p>

            <div className="block-list-meta">
              <span>{block.tokens.toLocaleString()} tok</span>
              <span>{formatUsd(block.cost)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
