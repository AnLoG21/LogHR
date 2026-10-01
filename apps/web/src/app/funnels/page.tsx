'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, stageAllowedRoles, SystemRole } from '@skillaz/shared';
import { AppShell, Button, Card, Empty, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';

const GATED_ROLES = Object.values(SystemRole).filter((r) => r !== SystemRole.ADMIN);

type TransitionsDraft = { funnelId: string; name: string; stages: any[]; stageRoles: Record<string, string[]> };

export default function FunnelsPage() {
  const qc = useQueryClient();
  const [stageOpen, setStageOpen] = useState<{ funnelId: string; name: string; isFinal: boolean } | null>(null);
  const [transOpen, setTransOpen] = useState<TransitionsDraft | null>(null);
  const funnels = useQuery({ queryKey: ['funnels'], queryFn: () => api<any[]>('/funnels') });
  const addStage = useMutation({
    mutationFn: () =>
      api(`/funnels/${stageOpen!.funnelId}/stages`, {
        method: 'POST',
        body: JSON.stringify({
          name: stageOpen!.name,
          code: stageOpen!.name.toUpperCase().replace(/\s+/g, '_').slice(0, 32),
          isFinal: stageOpen!.isFinal,
        }),
      }),
    onSuccess: () => { setStageOpen(null); qc.invalidateQueries({ queryKey: ['funnels'] }); },
  });
  const saveTrans = useMutation({
    mutationFn: () =>
      api(`/funnels/${transOpen!.funnelId}/transitions`, {
        method: 'PATCH',
        body: JSON.stringify({ transitions: { stageRoles: transOpen!.stageRoles } }),
      }),
    onSuccess: () => { setTransOpen(null); qc.invalidateQueries({ queryKey: ['funnels'] }); },
  });
  const move = useMutation({
    mutationFn: ({ funnelId, stageIds }: { funnelId: string; stageIds: string[] }) =>
      api(`/funnels/${funnelId}/reorder`, { method: 'POST', body: JSON.stringify({ stageIds }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funnels'] }),
  });

  return (
    <AppShell title="Воронки" subtitle="Этапы, порядок и переходы по ролям">
      <div className="space-y-4">
        {(funnels.data || []).map((f: any) => (
          <Card key={f.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <div className="font-bold text-lg">{f.name}</div>
                <div className="text-xs text-[var(--muted)]">{f.stages?.length || 0} этапов</div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setTransOpen({
                    funnelId: f.id,
                    name: f.name,
                    stages: f.stages || [],
                    stageRoles: Object.fromEntries(
                      (f.stages || []).map((s: any) => [s.code, stageAllowedRoles(f.transitions, s.code) || []]),
                    ),
                  })}
                >
                  Права на этапы
                </Button>
                <Button variant="ghost" onClick={() => setStageOpen({ funnelId: f.id, name: '', isFinal: false })}>Добавить этап</Button>
              </div>
            </div>
            <ol className="space-y-2">
              {(f.stages || []).map((s: any, i: number) => (
                <li key={s.id} className="flex items-center gap-3 text-sm border-b border-[var(--line)] pb-2">
                  <span className="text-[var(--muted)] w-6">{s.order ?? i + 1}</span>
                  <span className="font-medium flex-1">
                    {s.name}{s.isFinal ? ' · финал' : ''}
                    {stageAllowedRoles(f.transitions, s.code) ? (
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        🔒 {stageAllowedRoles(f.transitions, s.code)!.map((r) => ROLE_LABELS[r as SystemRole] || r).join(', ')}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{s.code}</span>
                  <Button
                    variant="ghost"
                    disabled={i === 0 || move.isPending}
                    onClick={() => {
                      const ids = (f.stages || []).map((x: any) => x.id);
                      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                      move.mutate({ funnelId: f.id, stageIds: ids });
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={i === (f.stages || []).length - 1 || move.isPending}
                    onClick={() => {
                      const ids = (f.stages || []).map((x: any) => x.id);
                      [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
                      move.mutate({ funnelId: f.id, stageIds: ids });
                    }}
                  >
                    ↓
                  </Button>
                </li>
              ))}
            </ol>
            {!f.stages?.length ? <Empty text="Нет этапов" /> : null}
          </Card>
        ))}
        {!funnels.isLoading && !(funnels.data || []).length ? <Empty text="Воронок нет" /> : null}
      </div>
      <Modal open={!!stageOpen} title="Новый этап" onClose={() => setStageOpen(null)}>
        <div className="space-y-3">
          <Input placeholder="Название этапа" value={stageOpen?.name || ''} onChange={(e) => setStageOpen((s) => s ? { ...s, name: e.target.value } : s)} />
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={!!stageOpen?.isFinal} onChange={(e) => setStageOpen((s) => s ? { ...s, isFinal: e.target.checked } : s)} />
            Финальный этап
          </label>
          <Button disabled={!stageOpen?.name || addStage.isPending} onClick={() => addStage.mutate()}>Создать</Button>
        </div>
      </Modal>
      <Modal open={!!transOpen} title={`Кто может переводить на этап · ${transOpen?.name || ''}`} onClose={() => setTransOpen(null)}>
        <div className="space-y-3">
          <div className="text-xs text-[var(--muted)]">
            Отметьте роли, которым разрешён перевод кандидата на этап. Без отметок этап доступен всем. Администратор может всегда.
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--muted)]">
                  <th className="text-left py-1 pr-2 font-medium">Этап</th>
                  {GATED_ROLES.map((r) => <th key={r} className="px-1 py-1 font-medium text-center">{ROLE_LABELS[r]}</th>)}
                </tr>
              </thead>
              <tbody>
                {(transOpen?.stages || []).map((s: any) => {
                  const selected = transOpen?.stageRoles[s.code] || [];
                  return (
                    <tr key={s.id} className="border-t border-[var(--line)]">
                      <td className="py-1.5 pr-2">
                        {s.name}
                        {!selected.length ? <span className="ml-1 text-xs text-[var(--muted)]">· все</span> : null}
                      </td>
                      {GATED_ROLES.map((r) => (
                        <td key={r} className="text-center">
                          <input
                            type="checkbox"
                            aria-label={`${s.name}: ${ROLE_LABELS[r]}`}
                            checked={selected.includes(r)}
                            onChange={(e) => setTransOpen((t) => t ? {
                              ...t,
                              stageRoles: {
                                ...t.stageRoles,
                                [s.code]: e.target.checked ? [...selected, r] : selected.filter((x) => x !== r),
                              },
                            } : t)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button disabled={saveTrans.isPending} onClick={() => saveTrans.mutate()}>Сохранить</Button>
          {saveTrans.isError ? <div className="text-sm text-[var(--sk-danger)]">{(saveTrans.error as Error).message}</div> : null}
        </div>
      </Modal>
    </AppShell>
  );
}
