import { SearchX } from "lucide-react";
import { Link } from "react-router";
import { Card, EmptyState, buttonClasses } from "@/components/ui";

export function NotFoundCard({
  title,
  description,
  backTo,
  backLabel,
}: {
  title: string;
  description: string;
  backTo: string;
  backLabel: string;
}) {
  return (
    <Card>
      <EmptyState
        icon={SearchX}
        title={title}
        description={description}
        action={
          <Link to={backTo} className={buttonClasses({ variant: "secondary" })}>
            {backLabel}
          </Link>
        }
      />
    </Card>
  );
}
