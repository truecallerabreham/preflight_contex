import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { EditorView } from "@codemirror/view";
import { formatUsd } from "../utils/costCalc.js";
import BlockBadge from "./BlockBadge.jsx";

function getLanguageExtension(text) {
  if (/```(?:ts|tsx|js|jsx|javascript|typescript)/i.test(text) || /\.(ts|tsx|js|jsx)\b/i.test(text)) {
    return javascript({ jsx: true, typescript: true });
  }

  if (/^\s*[\[{]/.test(text)) {
    return json();
  }

  if (/```(?:py|python)/i.test(text) || /\.(py)\b/i.test(text)) {
    return python();
  }

  if (/```|^#\s/m.test(text) || /\.(md)\b/i.test(text)) {
    return markdown();
  }

  return [];
}

function CodeMirrorField({ block, value, onChange }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  useEffect(() => {
    const language = getLanguageExtension(value);
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        syntaxHighlighting(defaultHighlightStyle),
        language,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": {
            backgroundColor: "#fbfcfd",
            color: "#162031",
            fontSize: "13px",
            border: "1px solid #d5dde6",
            borderRadius: "8px"
          },
          ".cm-content": {
            fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
            minHeight: "220px"
          },
          ".cm-gutters": {
            backgroundColor: "#f3f6f9",
            color: "#7a8797",
            borderRight: "1px solid #dbe3eb"
          },
          ".cm-activeLine": {
            backgroundColor: "#f3f7fb"
          }
        })
      ]
    });

    const view = new EditorView({
      state,
      parent: hostRef.current
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [block.id]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const current = view.state.doc.toString();
    if (current === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value
      }
    });
  }, [value]);

  return <div className="editor-shell" ref={hostRef} />;
}

export default function BlockEditor({
  blocks,
  selectedBlockId,
  onChangeBlock,
  onDeleteBlock,
  onResetBlock,
  onRestoreBlock
}) {
  const blockRefs = useRef({});

  useEffect(() => {
    const node = blockRefs.current[selectedBlockId];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedBlockId]);

  return (
    <div className="editor-stack">
      {blocks.map((block) => (
        <section
          key={block.id}
          ref={(node) => {
            blockRefs.current[block.id] = node;
          }}
          className={`editor-block${selectedBlockId === block.id ? " is-selected" : ""}${block.deleted ? " is-deleted" : ""}`}
        >
          <div className="editor-block-head">
            <div className="editor-block-title">
              <BlockBadge type={block.type} color={block.color} />
              <strong>{block.role}</strong>
            </div>

            <div className="editor-block-metrics">
              <span>{block.tokens.toLocaleString()} tok</span>
              <span>{formatUsd(block.cost)}</span>
            </div>
          </div>

          {block.deleted ? (
            <div className="deleted-state">
              <p>This block will not be sent upstream.</p>
              <button type="button" className="ghost-button" onClick={() => onRestoreBlock(block.id)}>
                Restore Block
              </button>
            </div>
          ) : (
            <>
              <CodeMirrorField block={block} value={block.content} onChange={(next) => onChangeBlock(block.id, next)} />

              <div className="editor-actions">
                <button type="button" className="ghost-button" onClick={() => onDeleteBlock(block.id)}>
                  Delete Block
                </button>
                <button type="button" className="ghost-button" onClick={() => onResetBlock(block.id)}>
                  Reset Block
                </button>
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
