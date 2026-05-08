import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPrograms, updateProgramStatus } from '@/api/program';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApiErrorBanner } from '@/components/common/ApiErrorBanner';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { useAuthStore } from '@/store/authStore';
import { can } from '@/lib/rbac';
import { formatDate } from '@/lib/format';
import type { Program, ProgramStatus } from '@/types';
import { toast } from 'sonner';

const LANES: { status: ProgramStatus; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'in_review', label: 'In Review' },
  { status: 'approved', label: 'Approved' },
  { status: 'archived', label: 'Archived' },
];

export function PortfolioTab() {
  const { roles } = useAuthStore();
  const canEdit = can(roles, 'program.write');
  const qc = useQueryClient();
  const programsQ = useQuery({ queryKey: ['programs'], queryFn: fetchPrograms });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProgramStatus }) => updateProgramStatus(id, status),
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['programs'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const byStatus = (s: ProgramStatus) => (programsQ.data ?? []).filter((p) => p.status === s);

  return (
    <div className="space-y-3">
      {programsQ.isError && <ApiErrorBanner error={programsQ.error} title="Program load failed" />}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {LANES.map(({ status, label }) => (
          <div key={status} className="rounded-lg border bg-muted/30 p-3 min-h-[200px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{label}</h3>
              <Badge variant="secondary">{byStatus(status).length}</Badge>
            </div>
            <div className="space-y-2">
              {byStatus(status).map((p) => (
                <ProgramCard key={p.id} program={p} canEdit={canEdit} onMove={(s) => move.mutate({ id: p.id, status: s })} />
              ))}
              {!byStatus(status).length && !programsQ.isLoading && !programsQ.isError && (
                <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">No programs in this lane.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgramCard({ program, canEdit, onMove }: { program: Program; canEdit: boolean; onMove: (s: ProgramStatus) => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer">
          <div className="font-medium text-sm">{program.name}</div>
          <div className="text-xs text-muted-foreground mt-1">{program.diseaseArea}</div>
          {program.description && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{program.description}</div>}
          <div className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wide">Updated {formatDate(program.updatedAt)}</div>
        </Card>
      </ContextMenuTrigger>
      {canEdit && (
        <ContextMenuContent>
          {LANES.filter((l) => l.status !== program.status).map((l) => (
            <ContextMenuItem key={l.status} onClick={() => onMove(l.status)}>Move to {l.label}</ContextMenuItem>
          ))}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
