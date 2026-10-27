import { FileSearch, Loader2, Play, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Card, CardContent, CardHeader, ConfirmDialog, EmptyState, ScoreRing, useToast } from "@/components/ui";
import { useRunScreening } from "@/hooks/queries/screening";
import { isDocumentProcessing } from "@/hooks/queries/shared";
import { getErrorMessage } from "@/services/api-client";
import type { DocumentInfo, ScreeningResult } from "@/types/api";
import { formatDateTime } from "@/utils/format";
import { MATCH_DISCLAIMER } from "@/utils/score";
import { matchCategory } from "../candidate-list-utils";

export interface ScreeningSummaryCardProps {
  applicationId: number;
  jobTitle: string;
  screening: ScreeningResult | null;
  document: DocumentInfo | null;
}

function useRun(applicationId: number, onDone?: () => void) {
  const toast = useToast();
  const runScreening = useRunScreening(applicationId);
  const run = (force: boolean) =>
    runScreening.mutate(force, {
      onSuccess: (result) => {
        onDone?.();
        if (result.status === "pending_document") {
          toast.toast({ title: "CV still processing", description: "Screening runs automatically when processing finishes." });
        } else {
          toast.success("Screening updated");
        }
      },
      onError: (error) => toast.error("Screening failed", getErrorMessage(error)),
    });
  return { run, running: runScreening.isPending };
}

/** Overall CV-screening result: score ring, match category and the plain-language summary. */
export function ScreeningSummaryCard({ applicationId, jobTitle, screening, document }: ScreeningSummaryCardProps) {
  const [confirmRerun, setConfirmRerun] = useState(false);
  const { run, running } = useRun(applicationId, () => setConfirmRerun(false));

  if (!screening) {
    const processing = document ? isDocumentProcessing(document.status) : false;
    return (
      <Card>
        <CardHeader title="Screening summary" icon={<Sparkles />} />
        <EmptyState
          compact
          icon={processing ? Loader2 : FileSearch}
          title={processing ? "Screening runs when the CV is processed" : document ? "Not screened yet" : "No CV to screen"}
          description={
            processing
              ? "The CV is being read. The result appears here automatically when it's done."
              : document?.status === "failed"
                ? "The CV couldn't be read, so there's nothing to compare with the job. Upload a new CV to try again."
                : document
                  ? "Run the screening to compare this CV with the job requirements."
                  : "Upload a CV for this application to compare it with the job requirements."
          }
          action={
            document?.status === "completed" ? (
              <Button onClick={() => run(false)} loading={running} leftIcon={<Play />}>
                Run screening
              </Button>
            ) : null
          }
        />
      </Card>
    );
  }

  const category = matchCategory(screening.overall_score);
  return (
    <Card>
      <CardHeader
        title="Screening summary"
        description={`Compared with the requirements of ${jobTitle}`}
        icon={<Sparkles />}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setConfirmRerun(true)} loading={running} leftIcon={<RefreshCw />}>
            Re-run
          </Button>
        }
      />
      <CardContent className="flex flex-col gap-5 py-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <ScoreRing score={screening.overall_score} size={104} />
          <p className="text-sm font-semibold text-slate-800">{category ?? "Score not available"}</p>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {screening.status === "failed" ? (
            <Alert tone="danger" title="Screening didn't complete">
              Re-run it to try again.
            </Alert>
          ) : null}
          {screening.experience_summary ? (
            <p className="text-sm leading-relaxed text-slate-700">{screening.experience_summary}</p>
          ) : (
            <p className="text-sm italic text-slate-400">No summary available.</p>
          )}
          <div className="flex items-start gap-2 rounded-lg bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden />
            <p>{MATCH_DISCLAIMER}</p>
          </div>
          <p className="text-xs text-slate-500">Screened {formatDateTime(screening.created_at)}</p>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmRerun}
        onClose={() => setConfirmRerun(false)}
        onConfirm={() => run(true)}
        loading={running}
        title="Re-run screening?"
        description="The CV is compared with the job's current requirements. Previous results and HR reviews are kept."
        confirmLabel="Re-run screening"
      />
    </Card>
  );
}
