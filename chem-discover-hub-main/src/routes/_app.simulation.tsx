import { createFileRoute } from "@tanstack/react-router";
import { SimulationPage } from "@/modules/simulation/SimulationPage";
export const Route = createFileRoute("/_app/simulation")({ component: SimulationPage });
