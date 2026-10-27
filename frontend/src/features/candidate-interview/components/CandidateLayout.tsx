import type { ReactNode } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { cn } from "@/utils/cn";

export function PoweredBy({ className }: { className?: string }) {
  return <p className={cn("text-center text-xs text-slate-400", className)}>Powered by XORCA Talent Intelligence</p>;
}

/** Calm, centred single-column shell for the public candidate pages (no HR navigation). */
export function CandidateLayout({
  children,
  companyName,
  subtitle = "Online interview",
  portalLabel = "Candidate portal",
  className,
}: {
  children: ReactNode;
  companyName?: string | null;
  /** What this page is, shown under the company name (e.g. "Job application"). */
  subtitle?: string;
  /** Shown under the subtitle when there's no company name yet. */
  portalLabel?: string;
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-6 sm:px-6 sm:pt-10">
        <LogoMark className="size-9" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-slate-900">{companyName || subtitle}</p>
          <p className="text-xs text-slate-500">{companyName ? subtitle : portalLabel}</p>
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6 sm:py-10", className)}>{children}</main>
      <footer className="px-4 pb-8 pt-2">
        <PoweredBy />
      </footer>
    </div>
  );
}
