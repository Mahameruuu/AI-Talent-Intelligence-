import { Badge } from "./badge";
import { getStatusConfig, type StatusKind, type StatusValues } from "./status-config";

type StatusBadgeProps = {
  [K in StatusKind]: { kind: K; value: StatusValues[K]; className?: string; size?: "sm" | "md"; hideIcon?: boolean };
}[StatusKind];

export function StatusBadge({ kind, value, className, size, hideIcon }: StatusBadgeProps) {
  const config = getStatusConfig(kind, value);
  const Icon = config.icon;
  return (
    <Badge tone={config.tone} size={size} className={className} data-status={value}>
      {Icon && !hideIcon ? <Icon className={config.spin ? "animate-spin" : undefined} aria-hidden /> : null}
      {config.label}
    </Badge>
  );
}
