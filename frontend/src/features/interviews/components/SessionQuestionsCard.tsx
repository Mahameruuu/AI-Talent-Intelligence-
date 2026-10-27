import { FileText, ListOrdered } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, Chip, EmptyState } from "@/components/ui";
import type { InterviewMode, SessionQuestion } from "@/types/api";
import { pluralize } from "@/utils/format";

/**
 * The questions planned for this session: CV-based ones (asked first) and template questions. In conversational
 * mode these are the planned turns; the wording actually used is in the transcript.
 */
export function SessionQuestionsCard({ questions, mode }: { questions: SessionQuestion[]; mode?: InterviewMode }) {
  const cvCount = questions.filter((question) => question.source === "cv").length;
  const conversational = mode === "conversational";
  return (
    <Card>
      <CardHeader
        icon={<ListOrdered />}
        title={conversational ? "Planned conversation" : "Interview questions"}
        description={
          questions.length > 0
            ? conversational
              ? `${pluralize(questions.length, "turn")} · the AI words each one naturally; see the transcript for what was asked`
              : `${pluralize(questions.length, "question")}${cvCount > 0 ? ` · ${cvCount} personalised from the CV` : ""}`
            : undefined
        }
      />
      {questions.length === 0 ? (
        <EmptyState compact title="No questions recorded" description="Questions are prepared when the invitation is created." />
      ) : (
        <CardContent>
          <ol className="space-y-3" aria-label="Session questions">
            {questions.map((question, index) => (
              <li key={question.id} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {question.source === "cv" ? (
                      <Badge tone="info" size="sm">
                        <FileText aria-hidden />
                        From CV
                      </Badge>
                    ) : null}
                    {question.competency ? <Chip className="py-0 text-[11px]">{question.competency}</Chip> : null}
                  </div>
                  <p className="text-sm leading-relaxed text-slate-800">{question.text}</p>
                  {question.source === "cv" && question.cv_basis ? (
                    <blockquote className="border-l-2 border-sky-200 pl-2.5 text-xs italic text-slate-500">
                      <span className="not-italic font-medium text-slate-600">
                        Based on CV{question.cv_basis_line !== null ? ` line ${question.cv_basis_line}` : ""}:
                      </span>{" "}
                      “{question.cv_basis}”
                    </blockquote>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
