import { Menu } from "lucide-react";
import { Button } from "@/components/ui";
import { LogoMark } from "./Logo";

/**
 * Mobile top bar (navigation toggle + logo). There is no user menu: sign-in and permissions are handled by the
 * central system, so this app has no session, role badge or logout.
 */
export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:hidden">
      <Button variant="ghost" size="icon" onClick={onOpenNav} aria-label="Open navigation">
        <Menu />
      </Button>
      <div className="flex items-center gap-2">
        <LogoMark className="size-7" />
        <span className="text-sm font-semibold text-slate-900">XORCA</span>
      </div>
    </header>
  );
}
