import { apiFetch } from "./http";

export type AccountSettings = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

export async function fetchMySettings() {
  return apiFetch<AccountSettings>("/api/settings/me");
}

export async function updateMySettings(displayName: string) {
  return apiFetch<{ ok: boolean }>("/api/settings/me", {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
}
