"use client";

import type { AIInteraction, AIFeature } from "@/app/lib/types";
import { formatTimestamp } from "@/app/lib/ui";

type AiState = "idle" | "loading" | "revealing" | "ready" | "cancelled" | "error";

const aiFeatures: Array<{ value: AIFeature; label: string }> = [
  { value: "rewrite", label: "Rewrite" },
  { value: "summarize", label: "Summarize" },
  { value: "translate", label: "Translate" },
  { value: "restructure", label: "Restructure" },
];

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M6 6 18 18M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

type Props = {
  open: boolean;
  canUseAi: boolean;
  aiFeature: AIFeature;
  aiState: AiState;
  targetLanguage: string;
  selectedText: string;
  aiError: string | null;
  aiSourceText: string;
  aiDraft: string;
  aiHistory: AIInteraction[];
  aiHistoryLoading: boolean;
  hasUndoSnapshot: boolean;
  onFeatureChange: (feature: AIFeature) => void;
  onTargetLanguageChange: (value: string) => void;
  onDraftChange: (value: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onApply: () => void;
  onReject: () => void;
  onUndo: () => void;
  onClose: () => void;
};

export default function AiAssistantPanel({
  open,
  canUseAi,
  aiFeature,
  aiState,
  targetLanguage,
  selectedText,
  aiError,
  aiSourceText,
  aiDraft,
  aiHistory,
  aiHistoryLoading,
  hasUndoSnapshot,
  onFeatureChange,
  onTargetLanguageChange,
  onDraftChange,
  onGenerate,
  onCancel,
  onApply,
  onReject,
  onUndo,
  onClose,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-slate-900">AI assistant</p>
          <p className="mt-1 text-sm text-slate-500">Generate and review suggestions.</p>
        </div>
        <div className="flex items-center gap-2">
          {(aiState === "loading" || aiState === "revealing") ? (
            <button
              type="button"
              onClick={onCancel}
              className="button-secondary h-10 rounded-full px-4 text-sm"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="button-secondary h-10 w-10 rounded-full px-0"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {aiFeatures.map((feature) => (
          <button
            key={feature.value}
            type="button"
            onClick={() => onFeatureChange(feature.value)}
            className={`button-secondary h-10 rounded-full px-3 text-sm ${
              aiFeature === feature.value ? "border-[rgba(49,94,138,0.26)] bg-[rgba(49,94,138,0.08)] text-[#315e8a]" : ""
            }`}
          >
            {feature.label}
          </button>
        ))}
      </div>

      {aiFeature === "translate" ? (
        <input
          value={targetLanguage}
          onChange={(event) => onTargetLanguageChange(event.target.value)}
          placeholder="Target language"
          className="field"
        />
      ) : null}

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canUseAi || aiState === "loading" || aiState === "revealing"}
        className="button-primary h-11 w-full rounded-full"
      >
        {aiState === "loading" || aiState === "revealing" ? "Generating..." : "Generate suggestion"}
      </button>

      <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
        <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Selected text</div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {selectedText.trim() || "Select text in the editor to use AI."}
        </p>
      </div>

      {aiError ? <div className="notice notice-error">{aiError}</div> : null}

      <div className="space-y-3">
        <div className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Original</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {aiSourceText || "No source text selected yet."}
          </p>
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-400">Suggestion</div>
          <textarea
            value={aiDraft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="AI suggestions will appear here."
            rows={8}
            className="field-area min-h-[12rem]"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onApply}
          disabled={!aiDraft.trim()}
          className="button-primary h-10 rounded-full px-4"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={!aiDraft.trim() && !aiSourceText}
          className="button-secondary h-10 rounded-full px-4"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={!hasUndoSnapshot}
          className="button-secondary h-10 rounded-full px-4"
        >
          Undo apply
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">Recent suggestions</p>
          {aiHistoryLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
        </div>
        {aiHistory.length === 0 ? (
          <div className="notice notice-info">No AI history for this document yet.</div>
        ) : (
          aiHistory.slice(0, 4).map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-[rgba(27,36,48,0.06)] bg-[rgba(244,241,234,0.6)] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-800">{entry.feature}</div>
                <div className="text-xs text-slate-500">{formatTimestamp(entry.created_at)}</div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {entry.response_text.slice(0, 120)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
