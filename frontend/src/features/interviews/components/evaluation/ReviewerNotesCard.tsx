import { NotebookPen, Save } from "lucide-react";
import { useId, useState } from "react";
import { Button, Card, CardContent, CardFooter, CardHeader, Label, Textarea, useToast } from "@/components/ui";
import { useSaveReviewerNotes } from "@/hooks/queries/interviews";
import { getErrorMessage } from "@/services/api-client";
import type { InterviewEvaluation } from "@/types/api";
import { formatDateTime, formatRelative } from "@/utils/format";

/** HR reviewer notes on an evaluation. Remount with `key={evaluation.id}`. */
export function ReviewerNotesCard({ evaluation }: { evaluation: InterviewEvaluation }) {
  const toast = useToast();
  const textareaId = useId();
  const mutation = useSaveReviewerNotes(evaluation.session_id);
  const saved = evaluation.reviewer_notes ?? "";
  const [notes, setNotes] = useState(saved);
  const isDirty = notes.trim() !== saved.trim();

  const save = () => {
    mutation.mutate(notes.trim(), {
      onSuccess: () => toast.success("Reviewer notes saved"),
      onError: (error) => toast.error("Couldn't save the notes", getErrorMessage(error)),
    });
  };

  return (
    <Card>
      <CardHeader
        icon={<NotebookPen />}
        title="Reviewer notes"
        description="Your own assessment, context from the transcript or decisions on competencies the AI couldn't score."
      />
      <CardContent className="space-y-2">
        <Label htmlFor={textareaId} className="sr-only">
          Reviewer notes
        </Label>
        <Textarea
          id={textareaId}
          rows={5}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add notes for the hiring team…"
        />
        {evaluation.reviewed_by ? (
          <p className="text-xs text-slate-500">
            Last saved by <span className="font-medium text-slate-700">{evaluation.reviewed_by}</span>
            {evaluation.reviewed_at ? (
              <>
                {" "}
                <time dateTime={evaluation.reviewed_at} title={formatDateTime(evaluation.reviewed_at)}>
                  {formatRelative(evaluation.reviewed_at)}
                </time>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-slate-500">No reviewer notes yet.</p>
        )}
      </CardContent>
      <CardFooter>
        {isDirty ? <span className="mr-auto text-xs text-amber-700">Unsaved changes</span> : null}
        <Button onClick={save} loading={mutation.isPending} disabled={!isDirty} leftIcon={<Save />}>
          Save notes
        </Button>
      </CardFooter>
    </Card>
  );
}
