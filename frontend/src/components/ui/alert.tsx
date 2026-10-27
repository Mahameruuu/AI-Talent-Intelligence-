import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const alertTones: Record<AlertTone, { box: string; icon: LucideIcon; iconClass: string }> = {
  info: { box: "border-sky-200 bg-sky-50/70 text-sky-900", icon: Info, iconClass: "text-sky-600" },
  success: { box: "border-emerald-200 bg-emerald-50/70 text-emerald-900", icon: CheckCircle2, iconClass: "text-emerald-600" },
  warning: { box: "border-amber-200 bg-amber-50/80 text-amber-900", icon: AlertTriangle, iconClass: "text-amber-600" },
  danger: { box: "border-rose-200 bg-rose-50/70 text-rose-900", icon: XCircle, iconClass: "text-rose-600" },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: LucideIcon;
}

export function Alert({ tone = "info", title, children, action, className, icon }: AlertProps) {
  const config = alertTones[tone];
  const Icon = icon ?? config.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-start", config.box, className)}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon className={cn("mt-0.5 size-4.5 shrink-0", config.iconClass)} aria-hidden />
        <div className="min-w-0 text-sm">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn("text-sm opacity-90", title && "mt-0.5")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 sm:ml-auto">{action}</div> : null}
    </div>
  );
}
