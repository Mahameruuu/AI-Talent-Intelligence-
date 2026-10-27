import { AlertOctagon } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { EmptyState, buttonClasses } from "@/components/ui";

export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unexpected application error.";
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        icon={AlertOctagon}
        title="This page crashed"
        description={message}
        action={
          <a href="/" className={buttonClasses({ variant: "secondary" })}>
            Reload the app
          </a>
        }
      />
    </div>
  );
}
