import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/modules/auth/ResetPasswordPage";
export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });
