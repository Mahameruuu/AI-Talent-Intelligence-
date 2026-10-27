import { ConfirmDialog } from "@/components/ui";
import type { ApplicationForm } from "@/types/api";
import type { ConfirmableAction } from "../use-form-actions";

export interface FormActionDialogsProps {
  confirm: { form: ApplicationForm; action: ConfirmableAction } | null;
  onCancel: () => void;
  onConfirm: (form: ApplicationForm, action: ConfirmableAction) => void;
  loading: boolean;
}

/** Confirmations for closing a form and regenerating its public link. */
export function FormActionDialogs({ confirm, onCancel, onConfirm, loading }: FormActionDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={confirm?.action === "close"}
        onClose={onCancel}
        onConfirm={() => confirm && onConfirm(confirm.form, "close")}
        loading={loading}
        tone="danger"
        title="Stop accepting applications?"
        description={`Visitors to the link for “${confirm?.form.job_title ?? ""}” will see that applications are closed. Existing applications are kept, and you can publish the form again at any time.`}
        confirmLabel="Close applications"
      />
      <ConfirmDialog
        open={confirm?.action === "regenerate"}
        onClose={onCancel}
        onConfirm={() => confirm && onConfirm(confirm.form, "regenerate")}
        loading={loading}
        tone="danger"
        title="Create a new public link?"
        description="The current link stops working immediately — anyone who opens it will see “link not valid”. Share the new link wherever you posted the old one."
        confirmLabel="Create new link"
      />
    </>
  );
}
