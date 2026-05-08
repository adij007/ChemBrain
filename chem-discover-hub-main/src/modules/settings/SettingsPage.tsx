import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchMySettings, updateMySettings } from "@/api/settings";
import { ApiErrorBanner } from "@/components/common/ApiErrorBanner";
import { toast } from "sonner";

export function SettingsPage() {
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: fetchMySettings });
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (settingsQ.data?.displayName != null) {
      setDisplayName(settingsQ.data.displayName);
    }
  }, [settingsQ.data?.displayName]);

  const save = useMutation({
    mutationFn: () => updateMySettings(displayName),
    onSuccess: () => toast.success("Account settings updated"),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account profile and identity details.</p>
      </div>
      {settingsQ.isError && <ApiErrorBanner error={settingsQ.error} title="Settings load failed" />}
      {save.isError && <ApiErrorBanner error={save.error} title="Settings save failed" />}
      <Card className="p-6 max-w-2xl space-y-4">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={settingsQ.data?.email ?? ""} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Roles</Label>
          <p className="text-sm text-muted-foreground">
            {settingsQ.data?.roles?.join(", ") || "No roles assigned"}
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !displayName.trim()}>
          Save changes
        </Button>
      </Card>
    </div>
  );
}
