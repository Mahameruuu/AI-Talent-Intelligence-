import type { SystemStatus } from "@/types/api";
import { formatNumber } from "@/utils/format";
import type { HealthTone } from "../components/HealthBadge";

export type HealthComponentId =
  | "database"
  | "llm"
  | "ocr"
  | "embeddings"
  | "ner"
  | "taxonomy"
  | "worker"
  | "pipeline";

export interface HealthItem {
  id: HealthComponentId;
  title: string;
  /** null => informational card without a status badge. */
  tone: HealthTone | null;
  statusLabel: string;
  facts: { label: string; value: string; mono?: boolean }[];
  detail: string | null;
}

const NOT_CONFIGURED = /^(|none|disabled|off|unavailable)$/i;

function backendHealth(backend: string): { tone: HealthTone; statusLabel: string } {
  return NOT_CONFIGURED.test(backend.trim())
    ? { tone: "warning", statusLabel: "Not configured" }
    : { tone: "ok", statusLabel: "Active" };
}

/** One card per pipeline component, in reading order. */
export function systemHealthItems(status: SystemStatus): HealthItem[] {
  const { worker, skill_taxonomy: taxonomy } = status;
  return [
    {
      id: "database",
      title: "Database",
      tone: status.database === "ok" ? "ok" : "error",
      statusLabel: status.database === "ok" ? "Connected" : "Error",
      facts: [],
      detail:
        status.database === "ok"
          ? "Jobs, candidates, screenings and interviews are stored and readable."
          : "The API can't reach the database. Uploads and screenings fail until it is restored.",
    },
    {
      id: "llm",
      title: "LLM",
      tone: status.llm.enabled ? "ok" : "warning",
      statusLabel: status.llm.enabled ? "Enabled" : "Disabled",
      facts: [
        { label: "Provider", value: status.llm.provider ?? "—" },
        { label: "Model", value: status.llm.model ?? "—", mono: Boolean(status.llm.model) },
      ],
      detail: status.llm.detail || null,
    },
    {
      id: "ocr",
      title: "OCR",
      tone: status.ocr.available ? "ok" : "warning",
      statusLabel: status.ocr.available ? "Available" : "Unavailable",
      facts: [],
      detail: status.ocr.detail || null,
    },
    {
      id: "embeddings",
      title: "Embeddings",
      ...backendHealth(status.embeddings.backend),
      facts: [{ label: "Backend", value: status.embeddings.backend || "—", mono: true }],
      detail: status.embeddings.detail || null,
    },
    {
      id: "ner",
      title: "NER",
      ...backendHealth(status.ner.backend),
      facts: [{ label: "Backend", value: status.ner.backend || "—", mono: true }],
      detail: status.ner.detail || null,
    },
    {
      id: "taxonomy",
      title: "Skill taxonomy",
      tone: taxonomy.skills > 0 ? "ok" : "warning",
      statusLabel: taxonomy.skills > 0 ? "Loaded" : "Empty",
      facts: [
        { label: "Version", value: taxonomy.version || "—", mono: true },
        { label: "Skills", value: formatNumber(taxonomy.skills) },
        { label: "Aliases", value: formatNumber(taxonomy.aliases) },
      ],
      detail: null,
    },
    {
      id: "worker",
      title: "Worker",
      tone: worker.max_workers > 0 ? "ok" : "error",
      statusLabel: worker.max_workers === 0 ? "No workers" : worker.running > 0 ? "Processing" : "Ready",
      facts: [
        { label: "Max workers", value: formatNumber(worker.max_workers) },
        { label: "Running", value: formatNumber(worker.running) },
        { label: "Queued", value: formatNumber(worker.queued) },
      ],
      detail: null,
    },
    {
      id: "pipeline",
      title: "Pipeline version",
      tone: null,
      statusLabel: "",
      facts: [{ label: "Version", value: status.pipeline_version || "—", mono: true }],
      detail: "Stored with every processed CV so results stay traceable.",
    },
  ];
}

export interface HealthSummary {
  tone: "success" | "warning" | "danger";
  title: string;
  description: string;
}

export function healthSummary(items: readonly HealthItem[]): HealthSummary {
  const describe = (list: readonly HealthItem[]) => list.map((item) => `${item.title}: ${item.statusLabel.toLowerCase()}`).join(" · ");
  const errors = items.filter((item) => item.tone === "error");
  if (errors.length > 0) {
    return {
      tone: "danger",
      title: errors.length === 1 ? "1 component needs attention" : `${errors.length} components need attention`,
      description: describe(errors),
    };
  }
  const warnings = items.filter((item) => item.tone === "warning");
  if (warnings.length > 0) {
    return {
      tone: "warning",
      title: "Running with reduced capabilities",
      description: `${describe(warnings)}. Screening keeps running; affected steps use their fallback or are skipped.`,
    };
  }
  return { tone: "success", title: "All systems operational", description: "Every pipeline component is available." };
}
