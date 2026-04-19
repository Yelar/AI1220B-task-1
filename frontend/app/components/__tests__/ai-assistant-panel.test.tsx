import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AiAssistantPanel from "@/app/components/ai-assistant-panel";

describe("AiAssistantPanel", () => {
  it("renders the AI review flow and triggers actions", () => {
    const onFeatureChange = vi.fn();
    const onTargetLanguageChange = vi.fn();
    const onDraftChange = vi.fn();
    const onGenerate = vi.fn();
    const onCancel = vi.fn();
    const onApply = vi.fn();
    const onApplySelected = vi.fn();
    const onReject = vi.fn();
    const onUndo = vi.fn();
    const onClose = vi.fn();

    render(
      <AiAssistantPanel
        open
        canUseAi
        aiFeature="translate"
        aiState="revealing"
        targetLanguage="Arabic"
        selectedText="Original sentence"
        aiError={null}
        aiSourceText="Original sentence"
        aiDraft="Translated sentence"
        aiHistory={[
          {
            id: 1,
            document_id: 1,
            feature: "translate",
            prompt_excerpt: "Translate this",
            response_text: "Translated sentence",
            model_name: "mock-model",
            status: "completed",
            created_at: "2026-04-18T10:00:00Z",
          },
        ]}
        aiHistoryLoading={false}
        hasUndoSnapshot
        onFeatureChange={onFeatureChange}
        onTargetLanguageChange={onTargetLanguageChange}
        onDraftChange={onDraftChange}
        onGenerate={onGenerate}
        onCancel={onCancel}
        onApply={onApply}
        onApplySelected={onApplySelected}
        onReject={onReject}
        onUndo={onUndo}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("AI assistant")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Arabic")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Translated sentence")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rewrite" }));
    expect(onFeatureChange).toHaveBeenCalledWith("rewrite");

    fireEvent.change(screen.getByDisplayValue("Arabic"), {
      target: { value: "French" },
    });
    expect(onTargetLanguageChange).toHaveBeenCalledWith("French");

    fireEvent.change(screen.getByDisplayValue("Translated sentence"), {
      target: { value: "Edited suggestion" },
    });
    expect(onDraftChange).toHaveBeenCalledWith("Edited suggestion");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Undo apply" }));
    expect(onUndo).toHaveBeenCalled();
  });
});
