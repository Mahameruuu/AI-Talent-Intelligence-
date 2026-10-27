import { useState } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { getErrorMessage, isApiError } from "@/services/api-client";
import { terminalReasonFromError, terminalReasonFromState, type TerminalReason } from "./candidate-interview-utils";
import { LiveInterview } from "./components/LiveInterview";
import { IncompleteLinkScreen, LoadingScreen, RetryScreen, TerminalScreen } from "./components/StatusScreens";
import { detectBrowserLanguage, interviewCopy, InterviewCopyContext } from "./i18n";
import { useCandidateInterview, useHashToken } from "./use-candidate-interview";

function CandidateInterview({ token, version }: { token: string | null; version: number }) {
  // Set when start/messages/complete returns 401/410/409: the candidate can't continue in this tab.
  const [terminal, setTerminal] = useState<TerminalReason | null>(null);
  const [browserLanguage] = useState(() => detectBrowserLanguage());

  const { query, start, send, complete, fetchAudio, fetchAckAudio, applyState } = useCandidateInterview(token, version, (error) => {
    const reason = terminalReasonFromError(error);
    if (reason) {
      setTerminal(reason);
    } else if (isApiError(error) && error.status === 409) {
      // State conflict we don't know about: resync with the server.
      void query.refetch();
    }
  });

  const state = query.data;
  const copy = interviewCopy[state?.language ?? browserLanguage];
  useDocumentTitle(state ? `${copy.onlineInterview} · ${state.company_name}` : copy.onlineInterview);

  const content = (() => {
    if (!token) return <IncompleteLinkScreen />;
    if (terminal) return <TerminalScreen reason={terminal} state={state} />;
    if (query.isPending) return <LoadingScreen />;
    if (query.isError) {
      const reason = terminalReasonFromError(query.error);
      if (reason) return <TerminalScreen reason={reason} />;
      return <RetryScreen onRetry={() => void query.refetch()} retrying={query.isFetching} />;
    }

    const data = query.data;
    const stateReason = terminalReasonFromState(data);
    if (stateReason) return <TerminalScreen reason={stateReason} state={data} />;

    const startError = start.isError && !terminalReasonFromError(start.error) ? getErrorMessage(start.error) : null;
    return (
      <LiveInterview
        state={data}
        start={start}
        send={send}
        complete={complete}
        fetchAudio={fetchAudio}
        fetchAckAudio={fetchAckAudio}
        applyState={applyState}
        startError={startError}
      />
    );
  })();

  return <InterviewCopyContext.Provider value={copy}>{content}</InterviewCopyContext.Provider>;
}

/**
 * Public candidate interview (`/interview#<token>`), rendered outside the HR layout.
 * The token is read from the URL fragment and sent only in the X-Interview-Token header.
 */
export function CandidateInterviewPage() {
  const { token, version } = useHashToken();
  return <CandidateInterview key={version} token={token} version={version} />;
}

