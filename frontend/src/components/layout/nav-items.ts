import {
  Briefcase,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Only exact match for "/" */
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, end: true },
  { label: "Jobs", to: "/jobs", icon: Briefcase },
  { label: "Candidates", to: "/candidates", icon: Users },
  { label: "AI Interviews", to: "/interviews", icon: MessagesSquare },
  { label: "Settings", to: "/settings", icon: Settings },
];
