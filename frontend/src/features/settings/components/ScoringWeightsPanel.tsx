import { RotateCcw, Save, Scale } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  ErrorState,
  Input,
  SkeletonTable,
  Table,
  TableContainer,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";
import { useScoringWeights, useUpdateScoringWeights } from "@/hooks/queries/system";
import { getErrorMessage } from "@/services/api-client";
import type { ScoringWeights, ScoringWeightSettings } from "@/types/api";
import { formatDateTime } from "@/utils/format";

type Draft = Record<keyof ScoringWeights, string>;

function toDraft(settings: ScoringWeightSettings): Draft {
  return Object.fromEntries(settings.items.map((row) => [row.key, String(row.weight)])) as Draft;
}

function parseWeight(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

/** Validation message per row, or null when the value is fine. */
function rowError(value: string): string | null {
  const number = parseWeight(value);
  if (number === null) return "Isi angka 0–100.";
  if (number < 0 || number > 100) return "Harus antara 0 dan 100.";
  return null;
}

/**
 * Settings → Scoring weights: one organisation-wide table (No | Keterangan | Nilai Bobot (%)).
 * HR only edits the percentages; they must add up to 100 and apply to every job.
 */
export function ScoringWeightsPanel() {
  const query = useScoringWeights();
  if (query.isPending) {
    return (
      <Card>
        <CardHeader title="Bobot penilaian CV" />
        <CardContent className="py-5">
          <SkeletonTable rows={7} columns={3} />
        </CardContent>
      </Card>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <WeightsForm settings={query.data} />;
}

function WeightsForm({ settings }: { settings: ScoringWeightSettings }) {
  const toast = useToast();
  const update = useUpdateScoringWeights();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));

  // Pick up changes saved elsewhere (or the server-normalised values after saving).
  useEffect(() => setDraft(toDraft(settings)), [settings]);

  const errors = useMemo(
    () => Object.fromEntries(settings.items.map((row) => [row.key, rowError(draft[row.key] ?? "")])),
    [draft, settings.items],
  ) as Record<keyof ScoringWeights, string | null>;
  const total = settings.items.reduce((sum, row) => sum + (parseWeight(draft[row.key] ?? "") ?? 0), 0);
  const totalRounded = Math.round(total * 100) / 100;
  const hasRowErrors = Object.values(errors).some(Boolean);
  const totalOk = totalRounded === 100;
  const dirty = settings.items.some((row) => parseWeight(draft[row.key] ?? "") !== row.weight);
  const canSave = dirty && totalOk && !hasRowErrors && !update.isPending;

  const save = async () => {
    const weights = {} as ScoringWeights;
    for (const row of settings.items) weights[row.key] = parseWeight(draft[row.key] ?? "") ?? 0;
    try {
      const saved = await update.mutateAsync({ weights });
      const queued = saved.rescreen_queued ?? 0;
      toast.success(
        "Bobot penilaian disimpan",
        queued > 0
          ? `Skor ${queued} pelamar di lowongan yang masih buka sedang dihitung ulang.`
          : "Bobot baru berlaku untuk semua lowongan.",
      );
    } catch (error) {
      toast.error("Bobot tidak dapat disimpan", getErrorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Scale />}
        title="Bobot penilaian CV"
        description="Berlaku untuk semua lowongan. Ubah angka di kolom Nilai Bobot; totalnya harus 100%."
      />
      <CardContent className="space-y-4 py-5">
        <TableContainer>
          <Table>
            <caption className="sr-only">Bobot penilaian CV</caption>
            <THead>
              <TR>
                <TH className="w-14">No</TH>
                <TH>Keterangan</TH>
                <TH align="right" className="w-44">
                  Nilai Bobot (%)
                </TH>
              </TR>
            </THead>
            <TBody>
              {settings.items.map((row) => {
                const error = errors[row.key];
                const inputId = `weight-${row.key}`;
                return (
                  <TR key={row.key}>
                    <TD className="tabular-nums text-slate-500">{row.no}</TD>
                    <TD>
                      <label htmlFor={inputId} className="font-medium text-slate-900">
                        {row.label}
                      </label>
                      <p className="text-xs text-slate-500">{row.description}</p>
                    </TD>
                    <TD align="right">
                      <div className="ml-auto flex max-w-36 flex-col items-end">
                        <div className="relative w-full">
                          <Input
                            id={inputId}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step={1}
                            value={draft[row.key] ?? ""}
                            disabled={update.isPending}
                            onChange={(event) => setDraft((current) => ({ ...current, [row.key]: event.target.value }))}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? `${inputId}-error` : undefined}
                            className="pr-8 text-right tabular-nums"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                            %
                          </span>
                        </div>
                        {error ? (
                          <p id={`${inputId}-error`} className="mt-1 text-xs text-rose-600">
                            {error}
                          </p>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                );
              })}
              <TR className="bg-slate-50">
                <TD />
                <TD className="font-semibold text-slate-900">Total</TD>
                <TD align="right">
                  <span
                    className={totalOk ? "font-semibold tabular-nums text-emerald-700" : "font-semibold tabular-nums text-rose-600"}
                    role="status"
                    aria-label={`Total ${totalRounded}%`}
                  >
                    {totalRounded}%
                  </span>
                  {!totalOk ? (
                    <p className="text-xs text-rose-600">
                      {totalRounded < 100 ? `Kurang ${Math.round((100 - totalRounded) * 100) / 100}%` : `Lebih ${Math.round((totalRounded - 100) * 100) / 100}%`}
                      {" "}— total harus 100%.
                    </p>
                  ) : null}
                </TD>
              </TR>
            </TBody>
          </Table>
        </TableContainer>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {settings.is_default
              ? "Masih memakai bobot bawaan sistem."
              : `Terakhir diubah ${settings.updated_at ? formatDateTime(settings.updated_at) : ""}${settings.updated_by ? ` oleh ${settings.updated_by}` : ""}.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<RotateCcw />}
              disabled={!dirty || update.isPending}
              onClick={() => setDraft(toDraft(settings))}
            >
              Batalkan perubahan
            </Button>
            <Button leftIcon={<Save />} disabled={!canSave} loading={update.isPending} onClick={() => void save()}>
              Simpan bobot
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
