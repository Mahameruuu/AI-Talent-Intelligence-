import { SubNav } from "@/components/layout/PageHeader";

export function InterviewsSubNav({ active }: { active: "sessions" | "templates" | "emails" }) {
  const items = [
    { label: "Sessions", to: "/interviews", active: active === "sessions" },
    { label: "Templates", to: "/interviews/templates", active: active === "templates" },
    { label: "Email log", to: "/interviews/emails", active: active === "emails" },
  ];
  return <SubNav items={items} />;
}
