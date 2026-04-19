import { describe, expect, it } from "vitest";

import {
  applyTextSplice,
  diffToSplice,
  mergeConcurrentTextChanges,
} from "@/app/lib/collaboration";

describe("collaboration helpers", () => {
  it("builds a splice for a text replacement", () => {
    expect(diffToSplice("Hello world", "Hello brave world")).toEqual({
      start: 6,
      deleteCount: 0,
      insertText: "brave ",
    });
  });

  it("applies a splice to a string", () => {
    expect(
      applyTextSplice("Hello world", {
        start: 6,
        deleteCount: 5,
        insertText: "team",
      }),
    ).toBe("Hello team");
  });

  it("merges non-overlapping concurrent edits", () => {
    expect(
      mergeConcurrentTextChanges(
        "alpha beta gamma",
        "alpha better gamma",
        "alpha beta gamma!",
      ),
    ).toEqual({
      merged: "alpha better gamma!",
      strategy: "merged",
    });
  });

  it("keeps the local draft when concurrent edits overlap", () => {
    expect(
      mergeConcurrentTextChanges(
        "alpha beta gamma",
        "alpha bolder gamma",
        "alpha brisk gamma",
      ),
    ).toEqual({
      merged: "alpha bolder gamma",
      strategy: "conflict",
    });
  });
});
