import type {
  CandidateInterviewMessageInput,
  CandidateInterviewStartInput,
  CandidateInterviewState,
} from "@/types/api";
import { ApiError, apiRequest, buildUrl, parseApiError } from "./api-client";
import { candidateInterviewStateSchema } from "./schemas";

/**
 * Public candidate-facing API. The invitation token travels ONLY in the
 * `X-Interview-Token` header — never in the URL path or query string.
 */
function candidateHeaders(token: string): Record<string, string> {
  return { "X-Interview-Token": token };
}

/** GET a WAV clip; errors become ApiErrors (503 `tts_unavailable` when server speech is unavailable). */
async function fetchAudioClip(token: string, path: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      headers: { Accept: "audio/wav", ...candidateHeaders(token) },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Cannot reach the server.");
  }
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = (await response.json()) as unknown;
    } catch {
      // not JSON
    }
    throw parseApiError(response.status, payload);
  }
  return response.blob();
}

export const candidateInterviewApi = {
  state: (token: string, signal?: AbortSignal) =>
    apiRequest<CandidateInterviewState>("/candidate-interview", {
      headers: candidateHeaders(token),
      schema: candidateInterviewStateSchema,
      signal,
    }),
  start: (token: string) =>
    apiRequest<CandidateInterviewState>("/candidate-interview/start", {
      method: "POST",
      headers: candidateHeaders(token),
      body: { consent: true } satisfies CandidateInterviewStartInput,
      schema: candidateInterviewStateSchema,
    }),
  sendMessage: (token: string, input: CandidateInterviewMessageInput) =>
    apiRequest<CandidateInterviewState>("/candidate-interview/messages", {
      method: "POST",
      headers: candidateHeaders(token),
      body: { content: input.content, input_mode: input.input_mode ?? "text" } satisfies CandidateInterviewMessageInput,
      schema: candidateInterviewStateSchema,
    }),
  /** Interviewer message read aloud (server TTS) as a WAV blob. 503 `tts_unavailable` when unavailable. */
  messageAudio: (token: string, messageId: number, signal?: AbortSignal): Promise<Blob> =>
    fetchAudioClip(token, `/candidate-interview/messages/${messageId}/audio`, signal),
  /** Conversational mode: spoken acknowledgement `index` (0-based into `acknowledgements`) as a WAV blob. */
  acknowledgementAudio: (token: string, index: number, signal?: AbortSignal): Promise<Blob> =>
    fetchAudioClip(token, `/candidate-interview/acknowledgements/${index}/audio`, signal),
  complete: (token: string) =>
    apiRequest<CandidateInterviewState>("/candidate-interview/complete", {
      method: "POST",
      headers: candidateHeaders(token),
      schema: candidateInterviewStateSchema,
    }),
};
