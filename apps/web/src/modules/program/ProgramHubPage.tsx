import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PortfolioTab } from './tabs/PortfolioTab';
import { EvidenceExplorerTab } from './tabs/EvidenceExplorerTab';
import { LearningHubTab } from './tabs/LearningHubTab';
import { ExecutiveInsightsTab } from './tabs/ExecutiveInsightsTab';
import { useNavigate, useSearch } from '@tanstack/react-router';

const VALID = ['portfolio', 'evidence', 'learning', 'insights'] as const;
type TabKey = (typeof VALID)[number];

export function ProgramHubPage() {
  const search = useSearch({ from: '/_app/programs' }) as { tab?: string };
  const navigate = useNavigate();
  const active: TabKey = (VALID as readonly string[]).includes(search.tab ?? '')
    ? (search.tab as TabKey)
    : 'portfolio';

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Program Hub</h1>
        <p className="text-sm text-muted-foreground">Pipelines, evidence, learning and insights.</p>
      </div>

      <Tabs
        value={active}
        onValueChange={(v) =>
          navigate({ to: '/programs', search: { tab: v as TabKey }, replace: true })
        }
      >
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="evidence">Evidence Explorer</TabsTrigger>
          <TabsTrigger value="learning">Learning Hub</TabsTrigger>
          <TabsTrigger value="insights">Executive Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="portfolio" className="mt-4"><PortfolioTab /></TabsContent>
        <TabsContent value="evidence" className="mt-4"><EvidenceExplorerTab /></TabsContent>
        <TabsContent value="learning" className="mt-4"><LearningHubTab /></TabsContent>
        <TabsContent value="insights" className="mt-4"><ExecutiveInsightsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
