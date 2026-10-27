import { BadgeCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, StatusBadge } from "@/components/ui";
import type { InterviewTemplate } from "@/types/api";
import { formatDateTime, formatRelative } from "@/utils/format";

export const APPROVAL_NOTE =
  "Only approved templates can be used to invite candidates. Editing an approved template moves it back to draft.";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function TemplateStatusCard({
  template,
  isDirty,
}: {
  template: InterviewTemplate | null;
  isDirty: boolean;
}) {
  if (template === null) {
    return (
      <Card>
        <CardHeader icon={<BadgeCheck />} title="Approval workflow" />
        <CardContent>
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                1
              </span>
              Define competencies, a 1–5 rubric for each and the question bank (or start from a suggestion).
            </li>
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                2
              </span>
              Save it as a draft and review it with the hiring team.
            </li>
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                3
              </span>
              Approve it. Only approved templates can be used to invite candidates.
            </li>
          </ol>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader icon={<BadgeCheck />} title="Status" actions={<StatusBadge kind="template" value={template.status} />} />
      <CardContent className="space-y-3">
        <dl className="divide-y divide-slate-100">
          <Row label="Approved by">
            {template.status === "approved" && template.approved_by ? (
              template.approved_by
            ) : (
              <span className="font-normal text-slate-400">Not approved</span>
            )}
          </Row>
          <Row label="Created">
            <span title={formatDateTime(template.created_at)}>{formatRelative(template.created_at)}</span>
          </Row>
          <Row label="Last updated">
            <span title={formatDateTime(template.updated_at)}>{formatRelative(template.updated_at)}</span>
          </Row>
        </dl>
        <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <Info className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden />
          {APPROVAL_NOTE}
        </p>
        {template.status === "draft" && isDirty ? (
          <p className="text-xs font-medium text-amber-700">Save changes first — you can approve once the form is saved.</p>
        ) : null}
        {template.status === "approved" && isDirty ? (
          <p className="text-xs font-medium text-amber-700">
            Saving these changes moves the template back to draft. It must be approved again before new invitations.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
