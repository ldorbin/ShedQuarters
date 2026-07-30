import { STATUS_LABELS } from "../../shared/types";

const TONE: Record<string, string> = {
  paid: "is-success",
  accepted: "is-success",
  completed: "is-success",
  overdue: "is-danger",
  declined: "is-danger",
  cancelled: "is-danger",
  expired: "is-warning",
  part_paid: "is-warning",
  in_progress: "is-info",
  sent: "is-info",
  open: "is-info",
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const effective = overdue ? "overdue" : status;
  return (
    <span className={`badge ${TONE[effective] ?? ""}`}>
      {STATUS_LABELS[effective] ?? effective}
    </span>
  );
}
