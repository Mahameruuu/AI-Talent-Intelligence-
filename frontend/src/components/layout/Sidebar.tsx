import { NavLink } from "react-router";
import { cn } from "@/utils/cn";
import { Logo } from "./Logo";
import { NAV_ITEMS } from "./nav-items";

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200/80 px-5">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
                isActive ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn("size-4.5 shrink-0", isActive ? "text-indigo-700" : "text-slate-400 group-hover:text-slate-600")}
                  aria-hidden
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200/80 px-5 py-4">
        <p className="text-[11px] leading-relaxed text-slate-400">
          Scores show match with job criteria, not a prediction of job success. Final decisions are made by HR.
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
      <SidebarContent />
    </aside>
  );
}
