import { createFileRoute } from "@tanstack/react-router";
import { SignInPage } from "@/modules/auth/SignInPage";
export const Route = createFileRoute("/signin")({ component: SignInPage });
