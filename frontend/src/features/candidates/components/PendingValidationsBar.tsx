import { Save, Undo2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { useCreateReview } from "@/hooks/queries/screening";
import { getErrorMessage } from "@/services/api-client";
import type { PendingValidations } from "../validation";

/** Sticky bar for requirement confirmations that haven't been saved as an HR review yet. */
export function PendingValidationsBar({
  applicationId,
  pending,
  onClear,
}: {
  applicationId: number;
  pending: PendingValidations;
  onClear: () => void;
}) {
  const toast = useToast();
  const createReview = useCreateReview(applicationId);
  const count = Object.keys(pending).length;
  if (count === 0) return null;
  const save = () =>
    createReview.mutate(
      { evidence_validations: pending },
      {
        onSuccess: () => {
          onClear();
          toast.success("Checks saved", `${count} requirement check${count === 1 ? "" : "s"} recorded as an HR review.`);
        },
        onError: (error) => toast.error("Couldn't save your checks", getErrorMessage(error)),
      },
    );
  return (
    <div className="sticky bottom-4 z-10 mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-indigo-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center">
      <p className="flex-1 text-sm text-slate-700">
        <span className="font-semibold text-indigo-800">{count}</span> unsaved requirement check{count === 1 ? "" : "s"}
        <span className="hidden text-slate-500 md:inline"> — save now, or include them in an HR review below.</span>
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} leftIcon={<Undo2 />} disabled={createReview.isPending}>
          Discard
        </Button>
        <Button size="sm" onClick={save} loading={createReview.isPending} leftIcon={<Save />}>
          Save checks
        </Button>
      </div>
    </div>
  );
}
