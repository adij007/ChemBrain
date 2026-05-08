import { createFileRoute } from "@tanstack/react-router";
import { ProgramHubPage } from "@/modules/program/ProgramHubPage";

type Search = { tab?: 'portfolio' | 'evidence' | 'learning' | 'insights' };

export const Route = createFileRoute("/_app/programs")({
  component: ProgramHubPage,
  validateSearch: (s: Record<string, unknown>): Search => {
    const tab = s.tab as string | undefined;
    return tab === 'portfolio' || tab === 'evidence' || tab === 'learning' || tab === 'insights'
      ? { tab }
      : {};
  },
});
