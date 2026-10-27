import { Link2, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, DropdownMenu } from "@/components/ui";
import { AcceptingIndicator } from "@/features/application-forms/components/FormStatusIndicator";
import { PublicLinkBar } from "@/features/application-forms/components/PublicLink";
import type { ApplicationForm } from "@/types/api";
import { pluralize } from "@/utils/format";

export interface ShareBarProps {
  form: ApplicationForm;
  /** Ask to confirm a new public link (the old one stops working). */
  onRegenerate: () => void;
  busy: boolean;
}

/** Live: the public link with Copy / Open. Draft or closed: one short line. */
export function ShareBar({ form, onRegenerate, busy }: ShareBarProps) {
  if (form.status !== "published") {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
        <Link2 className="size-4 shrink-0 text-slate-400" aria-hidden />
        {form.status === "draft"
          ? "Publish the form to get a shareable link."
          : "Applications are closed. Publish again to reopen the link."}
      </p>
    );
  }

  return (
    <Card className="border-emerald-200">
      <CardContent className="space-y-2 py-4">
        <PublicLinkBar
          url={form.public_url}
          extra={
            <DropdownMenu
              label="More link actions"
              variant="secondary"
              size="icon"
              items={[{ label: "New link", icon: <RefreshCw />, disabled: busy, onSelect: onRegenerate }]}
            />
          }
        />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <AcceptingIndicator form={form} />
          <span aria-hidden>·</span>
          <Link to={`/candidates?job_id=${form.job_id}`} className="font-medium text-indigo-700 hover:underline">
            {pluralize(form.submission_count, "application")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
