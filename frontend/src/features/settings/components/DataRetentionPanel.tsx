import { Clock, Play, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Input,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { useDataRetention, useRunDataRetention, useUpdateDataRetention } from "@/hooks/queries/system";
import { getErrorMessage } from "@/services/api-client";
import type { DataRetentionRules, DataRetentionSettings } from "@/types/api";
import { formatDateTime } from "@/utils/format";
import { MAX_RETENTION_MONTHS as MAX_MONTHS, MIN_RETENTION_MONTHS as MIN_MONTHS, monthsError } from "../utils/retention";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Settings → Data retention: view and change the rules or run them now. Access to this app is controlled by
 * the central system, so there are no roles here.
 */
export function DataRetentionPanel() {
  const query = useDataRetention();
  if (query.isPending) {
    return (
      <Card>
        <CardHeader title="Data retention" />
        <CardContent className="space-y-3 py-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-1/3" />
        </CardContent>
      </Card>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <RetentionForm settings={query.data} />;
}

function RetentionForm({ settings }: { settings: DataRetentionSettings }) {
  const toast = useToast();
  const update = useUpdateDataRetention();
  const runNow = useRunDataRetention();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [months, setMonths] = useState(String(settings.months_after_close));
  const [keepHired, setKeepHired] = useState(settings.keep_hired);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setEnabled(settings.enabled);
    setMonths(String(settings.months_after_close));
    setKeepHired(settings.keep_hired);
  }, [settings]);

  const error = monthsError(months);
  const dirty =
    enabled !== settings.enabled || Number(months) !== settings.months_after_close || keepHired !== settings.keep_hired;
  const busy = update.isPending || runNow.isPending;
  const { eligible_applications: apps, eligible_candidates: people, next_run_at: nextRun } = settings.preview;

  const save = async () => {
    const input: DataRetentionRules = { enabled, months_after_close: Number(months), keep_hired: keepHired };
    try {
      await update.mutateAsync(input);
      toast.success("Data retention saved", enabled ? "Old applicant data will be deleted automatically." : undefined);
    } catch (err) {
      toast.error("Could not save data retention", getErrorMessage(err));
    }
  };

  const run = async () => {
    try {
      const result = await runNow.mutateAsync();
      toast.success(
        "Old applicant data deleted",
        `${plural(result.applications, "application")} and ${plural(result.candidates, "candidate")} removed.`,
      );
    } catch (err) {
      toast.error("Could not delete data", getErrorMessage(err));
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Trash2 />}
        title="Data retention"
        description="Delete applicant data automatically once it is no longer needed. Deleted data cannot be recovered."
      />
      <CardContent className="space-y-5 py-5">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={busy}
          label={<span className="font-medium text-slate-900">Automatically delete applicant data</span>}
        />

        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <label htmlFor="retention-months">Delete data</label>
          <Input
            id="retention-months"
            type="number"
            inputMode="numeric"
            min={MIN_MONTHS}
            max={MAX_MONTHS}
            step={1}
            value={months}
            disabled={busy}
            onChange={(event) => setMonths(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "retention-months-error" : undefined}
            className="w-20 text-right tabular-nums"
          />
          <span>months after the job closes</span>
        </div>
        {error ? (
          <p id="retention-months-error" className="-mt-3 text-xs text-rose-600">
            {error}
          </p>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="size-4 rounded border-slate-300 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            checked={keepHired}
            disabled={busy}
            onChange={(event) => setKeepHired(event.target.checked)}
          />
          Keep data of hired candidates
        </label>

        <p className="text-xs text-slate-500">
          Applicants with an AI interview in progress are never deleted. Deleting removes the CV files, scores, reviews,
          interview transcripts and emails. A candidate is removed once no applications remain.
        </p>

        <Alert tone={apps > 0 ? "warning" : "info"} icon={Clock}>
          <p>
            Currently {plural(apps, "application")} ({plural(people, "candidate")}) would be deleted
            {dirty ? " with the saved rules" : ""}.
          </p>
          <p className="mt-1 text-xs">
            {settings.enabled
              ? nextRun
                ? `Next automatic run: ${formatDateTime(nextRun)}.`
                : "Runs daily at 02:00 when the scheduler is on."
              : "Automatic deletion is off — nothing is deleted."}
            {settings.last_run_at && settings.last_run_result
              ? ` Last run ${formatDateTime(settings.last_run_at)}: ${plural(settings.last_run_result.applications, "application")} deleted.`
              : ""}
          </p>
        </Alert>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {settings.is_default
              ? "Using the default rules (off)."
              : `Last changed ${settings.updated_at ? formatDateTime(settings.updated_at) : ""}${settings.updated_by ? ` by ${settings.updated_by}` : ""}.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<Play />}
              disabled={!settings.enabled || dirty || busy}
              title={!settings.enabled ? "Turn on and save automatic deletion first" : undefined}
              onClick={() => setConfirmOpen(true)}
            >
              Run now
            </Button>
            <Button
              leftIcon={<Save />}
              disabled={!dirty || Boolean(error) || busy}
              loading={update.isPending}
              onClick={() => void save()}
            >
              Save
            </Button>
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void run()}
        title="Delete old applicant data now?"
        description={`${plural(apps, "application")} (${plural(people, "candidate")}) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete now"
        tone="danger"
        loading={runNow.isPending}
      />
    </Card>
  );
}
