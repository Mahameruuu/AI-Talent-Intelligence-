import { Activity, Lock, Scale, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { DataRetentionPanel } from "./components/DataRetentionPanel";
import { ScoringWeightsPanel } from "./components/ScoringWeightsPanel";
import { SecurityPrivacyPanel } from "./components/SecurityPrivacyPanel";
import { SystemStatusPanel } from "./components/SystemStatusPanel";

const TABS = ["weights", "retention", "security", "system"] as const;
type SettingsTab = (typeof TABS)[number];
const DEFAULT_TAB: SettingsTab = "weights";

function isTab(value: string): value is SettingsTab {
  return (TABS as readonly string[]).includes(value);
}

export function SettingsPage() {
  useDocumentTitle("Settings");
  const { getString, setFilters } = useUrlFilters();
  const rawTab = getString("tab");
  const tab: SettingsTab = isTab(rawTab) ? rawTab : DEFAULT_TAB;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="CV scoring weights used for every job, data retention, security and pipeline health."
      />
      <Tabs value={tab} onValueChange={(next) => setFilters({ tab: next === DEFAULT_TAB ? undefined : next })}>
        <TabsList label="Settings sections">
          <TabsTrigger value="weights" icon={<Scale />}>
            Scoring weights
          </TabsTrigger>
          <TabsTrigger value="retention" icon={<Trash2 />}>
            Data retention
          </TabsTrigger>
          <TabsTrigger value="security" icon={<Lock />}>
            Security &amp; privacy
          </TabsTrigger>
          <TabsTrigger value="system" icon={<Activity />}>
            System status
          </TabsTrigger>
        </TabsList>
        <TabsContent value="weights">
          <ScoringWeightsPanel />
        </TabsContent>
        <TabsContent value="retention">
          <DataRetentionPanel />
        </TabsContent>
        <TabsContent value="security">
          <SecurityPrivacyPanel />
        </TabsContent>
        <TabsContent value="system">
          <SystemStatusPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
