import { cn } from "@/utils/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-indigo-700" />
      <path d="M9.5 9.5l13 13M22.5 9.5l-13 13" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.2" className="fill-indigo-300" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className={cn("text-sm font-bold tracking-wide", inverted ? "text-white" : "text-slate-900")}>XORCA</p>
        <p className={cn("text-[11px] font-medium", inverted ? "text-indigo-200" : "text-slate-500")}>Talent Intelligence</p>
      </div>
    </div>
  );
}
