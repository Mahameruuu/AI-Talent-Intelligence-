import type { EmailLogEntry } from "@/types/api";
import { api } from "./api-client";

export interface EmailLogParams {
  session_id?: number;
}

export const emailLogsApi = {
  /** Outgoing emails. Bodies are stored server-side with tokens redacted. */
  list: (params: EmailLogParams = {}, signal?: AbortSignal) =>
    api.get<EmailLogEntry[]>("/email-logs", { query: { ...params }, signal }),
};
