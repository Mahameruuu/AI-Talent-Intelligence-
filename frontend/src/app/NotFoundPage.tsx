import { Compass } from "lucide-react";
import { Link } from "react-router";
import { EmptyState, buttonClasses } from "@/components/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
      action={
        <Link to="/" className={buttonClasses({ variant: "secondary" })}>
          Back to overview
        </Link>
      }
    />
  );
}
