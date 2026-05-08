import { createFileRoute } from "@tanstack/react-router";
import { ResearchPage } from "@/modules/research/ResearchPage";
export const Route = createFileRoute("/_app/research")({ component: ResearchPage });
