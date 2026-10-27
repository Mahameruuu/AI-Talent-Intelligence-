import { useCallback, useEffect, useState } from "react";
import { messageAnchorId } from "./interview-utils";

export interface TranscriptHighlight {
  id: number;
  /** Bumped on every request so the flash animation replays for the same message. */
  nonce: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Scroll to + highlight a transcript message (`#message-<id>`). */
export function useTranscriptHighlight() {
  const [highlight, setHighlight] = useState<TranscriptHighlight | null>(null);

  const focusMessage = useCallback((id: number) => {
    setHighlight((previous) => ({ id, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!highlight) return;
    const element = document.getElementById(messageAnchorId(highlight.id));
    if (!element) return;
    element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    element.focus({ preventScroll: true });
  }, [highlight]);

  return { highlight, focusMessage };
}
