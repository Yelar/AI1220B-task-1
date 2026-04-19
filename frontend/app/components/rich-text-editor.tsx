"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
} from "react";
import type { CSSProperties } from "react";

type SelectionPayload = {
  selectedText: string;
  plainText: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

type RemoteSelection = {
  clientId: string;
  userName: string;
  color: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectedText?: string;
};

export type RichTextEditorHandle = {
  focus: () => void;
  replaceSelection: (text: string) => void;
  getPlainText: () => string;
  getSelectedText: () => string;
  runCommand: (command: ToolbarCommand) => void;
};

type RichTextEditorProps = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  showToolbar?: boolean;
  remoteSelections?: RemoteSelection[];
  onChange: (value: string) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
};

export type ToolbarCommand =
  | { type: "format"; command: string; value?: string }
  | { type: "insert"; command: string };

export const toolbarCommands: Array<{ label: string; action: ToolbarCommand }> = [
  { label: "P", action: { type: "format", command: "formatBlock", value: "p" } },
  { label: "H1", action: { type: "format", command: "formatBlock", value: "h1" } },
  { label: "H2", action: { type: "format", command: "formatBlock", value: "h2" } },
  { label: "B", action: { type: "format", command: "bold" } },
  { label: "I", action: { type: "format", command: "italic" } },
  { label: "UL", action: { type: "format", command: "insertUnorderedList" } },
  { label: "OL", action: { type: "format", command: "insertOrderedList" } },
  { label: "</>", action: { type: "format", command: "formatBlock", value: "pre" } },
];

function htmlToPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ");
}

function normalizeHtml(value: string) {
  const trimmed = value.trim();
  return trimmed === "<br>" ? "" : trimmed;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { value, disabled = false, placeholder, showToolbar = true, remoteSelections = [], onChange, onSelectionChange },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const rangeRef = useRef<Range | null>(null);

  const syncSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onSelectionChange?.({
        selectedText: "",
        plainText: htmlToPlainText(editor.innerHTML),
        selectionStart: null,
        selectionEnd: null,
      });
      return;
    }

    const range = selection.getRangeAt(0);
    if (range.commonAncestorContainer && editor.contains(range.commonAncestorContainer)) {
      const editorRange = document.createRange();
      editorRange.selectNodeContents(editor);
      editorRange.setEnd(range.startContainer, range.startOffset);
      const selectionStart = editorRange.toString().length;
      const selectionEnd = selectionStart + selection.toString().length;

      rangeRef.current = range.cloneRange();
      onSelectionChange?.({
        selectedText: selection.toString(),
        plainText: htmlToPlainText(editor.innerHTML),
        selectionStart,
        selectionEnd,
      });
      return;
    }

    onSelectionChange?.({
      selectedText: "",
      plainText: htmlToPlainText(editor.innerHTML),
      selectionStart: null,
      selectionEnd: null,
    });
  }, [onSelectionChange]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    onChange(normalizeHtml(editor.innerHTML));
    syncSelection();
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function runCommand(action: ToolbarCommand) {
    if (disabled) {
      return;
    }

    focusEditor();

    if (action.type === "format") {
      document.execCommand(action.command, false, action.value);
    }

    if (action.type === "insert") {
      document.execCommand(action.command, false);
    }

    emitChange();
  }

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        focusEditor();
      },
      replaceSelection(text: string) {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }

        focusEditor();
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          if (rangeRef.current) {
            selection.addRange(rangeRef.current);
          }
        }

        const escapedText = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");

        document.execCommand("insertHTML", false, escapedText);
        emitChange();
      },
      getPlainText() {
        return htmlToPlainText(editorRef.current?.innerHTML ?? "");
      },
      getSelectedText() {
        return window.getSelection?.()?.toString() ?? "";
      },
      runCommand(action: ToolbarCommand) {
        runCommand(action);
      },
    }),
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const normalized = normalizeHtml(value);
    if (normalizeHtml(editor.innerHTML) !== normalized) {
      editor.innerHTML = normalized || "";
    }
  }, [value]);

  useEffect(() => {
    function handleSelectionChange() {
      const editor = editorRef.current;
      if (!editor || !editor.contains(document.activeElement)) {
        return;
      }

      syncSelection();
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [syncSelection]);

  function handleToolbarMouseDown(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  const plainTextLength = Math.max(htmlToPlainText(value).trimEnd().length, 1);

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="editor-toolbar">
          {toolbarCommands.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={disabled}
              className="editor-tool"
              onMouseDown={handleToolbarMouseDown}
              onClick={() => runCommand(item.action)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="rich-editor-shell">
        <div className="rich-editor-remote-layer" aria-hidden="true">
          {remoteSelections.map((entry) => {
            const start = Math.max(entry.selectionStart ?? 0, 0);
            const end = Math.max(entry.selectionEnd ?? start, start);
            const rangeLength = Math.max(end - start, 0);
            const topPercent = Math.min((start / plainTextLength) * 100, 96);
            const heightPercent = Math.max((rangeLength / plainTextLength) * 100, 2.2);

            return (
              <div
                key={entry.clientId}
                className="remote-selection-marker"
                style={
                  {
                    top: `${topPercent}%`,
                    height: `${Math.min(heightPercent, 26)}%`,
                    "--remote-selection-color": entry.color,
                  } as CSSProperties
                }
              >
                <span className="remote-selection-label">
                  {entry.userName}
                  {entry.selectedText ? `: ${entry.selectedText.slice(0, 18)}` : " cursor"}
                </span>
              </div>
            );
          })}
        </div>
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          className={`rich-editor ${disabled ? "rich-editor-disabled" : ""}`}
          data-placeholder={placeholder}
          onInput={emitChange}
          onKeyUp={syncSelection}
          onMouseUp={syncSelection}
        />
      </div>
    </div>
  );
});

export default RichTextEditor;
