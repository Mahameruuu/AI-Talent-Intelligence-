import { cn } from "@/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "success" | "danger" | "danger-outline" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-indigo-700 text-white shadow-xs hover:bg-indigo-800 active:bg-indigo-900",
  secondary: "border border-slate-300 bg-white text-slate-800 shadow-xs hover:bg-slate-50 hover:text-slate-900",
  outline: "border border-indigo-200 bg-indigo-50/40 text-indigo-800 hover:bg-indigo-50",
  ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
  success: "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:bg-emerald-800",
  danger: "bg-rose-600 text-white shadow-xs hover:bg-rose-700",
  "danger-outline": "border border-rose-200 bg-white text-rose-700 shadow-xs hover:bg-rose-50",
  link: "h-auto px-0 text-indigo-700 underline-offset-4 hover:underline",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
  md: "h-9 px-4",
  lg: "h-10 px-5",
  icon: "size-9 p-0",
  "icon-sm": "size-8 p-0",
};

export function buttonClasses(options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  const { variant = "primary", size = "md", className } = options;
  return cn(base, variants[variant], variant === "link" ? "" : sizes[size], className);
}
