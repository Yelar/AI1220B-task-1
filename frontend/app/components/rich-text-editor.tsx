"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent,
} from "react";

type SelectionPayload = {
  selectedText: string;
  plainText: string;
};

export type RichTextEditorHandle = {
  focus: () => void;
  replaceSelection: (text: string) => void;
  getPlainText: () => string;
};

type RichTextEditorProps = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  onSelectionChange?: (payload: SelectionPayload) => void;
};

type Command =
  | { type: "format"; command: string; value?: string }
  | { type: "insert"; command: string };

const toolbarCommands: Array<{ label: string; action: Command }> = [
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
  { value, disabled = false, placeholder, onChange, onSelectionChange },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const rangeRef = useRef<Range | null>(null);

  function syncSelection() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onSelectionChange?.({
        selectedText: "",
        plainText: htmlToPlainText(editor.innerHTML),
      });
      return;
    }

    const range = selection.getRangeAt(0);
    if (range.commonAncestorContainer && editor.contains(range.commonAncestorContainer)) {
      rangeRef.current = range.cloneRange();
      onSelectionChange?.({
        selectedText: selection.toString(),
        plainText: htmlToPlainText(editor.innerHTML),
      });
      return;
    }

    onSelectionChange?.({
      selectedText: "",
      plainText: htmlToPlainText(editor.innerHTML),
    });
  }

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

  function runCommand(action: Command) {
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

  function handleToolbarMouseDown(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <div className="space-y-4">
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
  );
});

export default RichTextEditor;
