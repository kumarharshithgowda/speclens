import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="panel">
      <EmptyState
        icon={<Compass />}
        title="This page does not exist"
        description="The link may be outdated, or the item was deleted."
        action={
          <Button asChild variant="primary">
            <Link to="/">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
