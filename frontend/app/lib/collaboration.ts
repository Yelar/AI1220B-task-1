export type TextSplice = {
  start: number;
  deleteCount: number;
  insertText: string;
};

export type MergeResult = {
  merged: string;
  strategy: "remote" | "local" | "merged" | "conflict";
};

function clampIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function applyTextSplice(value: string, splice: TextSplice) {
  const start = clampIndex(splice.start, 0, value.length);
  const deleteCount = clampIndex(splice.deleteCount, 0, value.length - start);
  return `${value.slice(0, start)}${splice.insertText}${value.slice(start + deleteCount)}`;
}

export function diffToSplice(base: string, next: string): TextSplice | null {
  if (base === next) {
    return null;
  }

  let prefixLength = 0;
  const maxPrefix = Math.min(base.length, next.length);
  while (prefixLength < maxPrefix && base[prefixLength] === next[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const maxSuffix = Math.min(base.length - prefixLength, next.length - prefixLength);
  while (
    suffixLength < maxSuffix &&
    base[base.length - 1 - suffixLength] === next[next.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    start: prefixLength,
    deleteCount: base.length - prefixLength - suffixLength,
    insertText: next.slice(prefixLength, next.length - suffixLength),
  };
}

function rangesOverlap(left: TextSplice, right: TextSplice) {
  const leftEnd = left.start + left.deleteCount;
  const rightEnd = right.start + right.deleteCount;
  return left.start < rightEnd && right.start < leftEnd;
}

function shiftSplice(splice: TextSplice, delta: number): TextSplice {
  return {
    ...splice,
    start: splice.start + delta,
  };
}

function mergeNonOverlapping(base: string, first: TextSplice, second: TextSplice) {
  if (first.start <= second.start) {
    const firstApplied = applyTextSplice(base, first);
    return applyTextSplice(firstApplied, shiftSplice(second, first.insertText.length - first.deleteCount));
  }

  const secondApplied = applyTextSplice(base, second);
  return applyTextSplice(secondApplied, shiftSplice(first, second.insertText.length - second.deleteCount));
}

export function mergeConcurrentTextChanges(base: string, local: string, remote: string): MergeResult {
  if (local === remote) {
    return {
      merged: local,
      strategy: "merged",
    };
  }

  if (local === base) {
    return {
      merged: remote,
      strategy: "remote",
    };
  }

  if (remote === base) {
    return {
      merged: local,
      strategy: "local",
    };
  }

  const localSplice = diffToSplice(base, local);
  const remoteSplice = diffToSplice(base, remote);

  if (!localSplice || !remoteSplice) {
    return {
      merged: local,
      strategy: "conflict",
    };
  }

  const sameRange =
    localSplice.start === remoteSplice.start &&
    localSplice.deleteCount === remoteSplice.deleteCount;

  if (sameRange) {
    if (localSplice.insertText === remoteSplice.insertText) {
      return {
        merged: local,
        strategy: "merged",
      };
    }

    return {
      merged: local,
      strategy: "conflict",
    };
  }

  if (rangesOverlap(localSplice, remoteSplice)) {
    return {
      merged: local,
      strategy: "conflict",
    };
  }

  return {
    merged: mergeNonOverlapping(base, localSplice, remoteSplice),
    strategy: "merged",
  };
}
