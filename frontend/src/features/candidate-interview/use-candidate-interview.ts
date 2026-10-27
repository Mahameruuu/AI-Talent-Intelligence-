import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { candidateInterviewApi } from "@/services/candidate-interview-api";
import type { CandidateInterviewMessageInput, CandidateInterviewState } from "@/types/api";
import { closingMessage, readTokenFromHash } from "./candidate-interview-utils";

interface HashToken {
  token: string | null;
  /** Incremented whenever a different token arrives via `hashchange` (e.g. the candidate pastes the full link). */
  version: number;
}

/** Token from `window.location.hash`. It is only ever sent in the X-Interview-Token header. */
export function useHashToken(): HashToken {
  const [state, setState] = useState<HashToken>(() => ({
    token: typeof window === "undefined" ? null : readTokenFromHash(window.location.hash),
    version: 0,
  }));

  useEffect(() => {
    const onHashChange = () => {
      const next = readTokenFromHash(window.location.hash);
      setState((previous) => (previous.token === next ? previous : { token: next, version: previous.version + 1 }));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return state;
}

// The token is deliberately NOT part of the query key; `version` distinguishes links.
const stateKey = (version: number) => ["candidate-interview", "state", version] as const;

function requireToken(token: string | null): string {
  if (!token) throw new Error("The interview link is missing its access code.");
  return token;
}

export function useCandidateInterview(token: string | null, version: number, onMutationError: (error: unknown) => void) {
  const queryClient = useQueryClient();
  const key = stateKey(version);

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => candidateInterviewApi.state(requireToken(token), signal),
    enabled: token !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const applyState = (state: CandidateInterviewState) => {
    queryClient.setQueryData(key, state);
  };

  const start = useMutation({
    mutationFn: () => candidateInterviewApi.start(requireToken(token)),
    onSuccess: applyState,
    onError: onMutationError,
  });

  const send = useMutation({
    mutationFn: (input: CandidateInterviewMessageInput) => candidateInterviewApi.sendMessage(requireToken(token), input),
    // A conversational interview ends with a spoken closing: the room applies the completed state
    // (via `applyState`) once the closing has been read, so the thank-you screen doesn't cut it off.
    onSuccess: (state) => {
      if (!closingMessage(state)) applyState(state);
    },
    onError: onMutationError,
  });

  const complete = useMutation({
    mutationFn: () => candidateInterviewApi.complete(requireToken(token)),
    onSuccess: applyState,
    onError: onMutationError,
  });

  const fetchAudio = useCallback(
    (messageId: number, signal: AbortSignal) => candidateInterviewApi.messageAudio(requireToken(token), messageId, signal),
    [token],
  );

  const fetchAckAudio = useCallback(
    (index: number, signal: AbortSignal) => candidateInterviewApi.acknowledgementAudio(requireToken(token), index, signal),
    [token],
  );

  return { query, start, send, complete, fetchAudio, fetchAckAudio, applyState };
}

export type CandidateInterviewController = ReturnType<typeof useCandidateInterview>;
