import { useParams, useSearchParams } from "react-router";
import { Card, CardContent, ErrorState, Skeleton, SkeletonText } from "@/components/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useTemplate } from "@/hooks/queries/interviews";
import { isNotFoundError } from "@/services/api-client";
import { parseIntParam } from "@/utils/query-string";
import { NotFoundCard } from "./components/NotFoundCard";
import { TemplateEditor } from "./components/template-editor/TemplateEditor";
import { parseIdParam } from "./interview-utils";

function EditorSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading template">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 py-5 sm:grid-cols-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </CardContent>
          </Card>
          {Array.from({ length: 2 }, (_, index) => (
            <Card key={index}>
              <CardContent className="space-y-4 py-5">
                <Skeleton className="h-4 w-40" />
                <SkeletonText lines={4} />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="space-y-4 py-5">
            <Skeleton className="h-4 w-32" />
            <SkeletonText lines={6} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EditExistingTemplate({ templateId }: { templateId: number }) {
  const query = useTemplate(templateId);
  useDocumentTitle(query.data ? query.data.name : "Interview template");

  if (query.isPending) return <EditorSkeleton />;
  if (query.isError) {
    if (isNotFoundError(query.error)) {
      return (
        <NotFoundCard
          title="Template not found"
          description="This interview template doesn't exist or was removed."
          backTo="/interviews/templates"
          backLabel="Back to templates"
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return <TemplateEditor key={query.data.id} template={query.data} />;
}

function CreateTemplate() {
  const [searchParams] = useSearchParams();
  const jobId = parseIntParam(searchParams.get("job_id"));
  useDocumentTitle("New interview template");
  return <TemplateEditor template={null} initialJobId={jobId !== undefined && jobId > 0 ? jobId : undefined} />;
}

/** /interviews/templates/new?job_id= and /interviews/templates/:id */
export function TemplateEditorPage() {
  const params = useParams();
  if (params.id === undefined) return <CreateTemplate />;
  const templateId = parseIdParam(params.id);
  if (templateId === null) {
    return (
      <NotFoundCard
        title="Template not found"
        description="The address doesn't point to a valid interview template."
        backTo="/interviews/templates"
        backLabel="Back to templates"
      />
    );
  }
  return <EditExistingTemplate templateId={templateId} />;
}
