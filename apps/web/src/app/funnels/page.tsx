'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, Button, Card, Empty, Input, Modal } from '@/components/ui';
import { api } from '@/lib/api';

export default function FunnelsPage() {
  const qc = useQueryClient();
  const [stageOpen, setStageOpen] = useState<{ funnelId: string; name: string; isFinal: boolean } | null>(null);
  const [transOpen, setTransOpen] = useState<{ funnelId: string; json: string } | null>(null);
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
        body: JSON.stringify({ transitions: JSON.parse(transOpen!.json || '{}') }),
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
                <Button variant="ghost" onClick={() => setTransOpen({ funnelId: f.id, json: JSON.stringify(f.transitions || { allowedRoles: ['RECRUITER', 'ADMIN'], note: 'Переходы по умолчанию' }, null, 2) })}>
                  Переходы
                </Button>
                <Button variant="ghost" onClick={() => setStageOpen({ funnelId: f.id, name: '', isFinal: false })}>Добавить этап</Button>
              </div>
            </div>
            <ol className="space-y-2">
              {(f.stages || []).map((s: any, i: number) => (
                <li key={s.id} className="flex items-center gap-3 text-sm border-b border-[var(--line)] pb-2">
                  <span className="text-[var(--muted)] w-6">{s.order ?? i + 1}</span>
                  <span className="font-medium flex-1">{s.name}{s.isFinal ? ' · финал' : ''}</span>
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
            {f.transitions ? (
              <pre className="text-xs mt-3 bg-[var(--surface-2)] p-2 rounded overflow-auto">{JSON.stringify(f.transitions, null, 2)}</pre>
            ) : null}
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
      <Modal open={!!transOpen} title="Переходы / роли (JSON)" onClose={() => setTransOpen(null)}>
        <div className="space-y-3">
          <textarea
            className="sk-input"
            style={{ height: 180, fontFamily: 'monospace', fontSize: 12 }}
            value={transOpen?.json || ''}
            onChange={(e) => setTransOpen((t) => t ? { ...t, json: e.target.value } : t)}
          />
          <Button disabled={saveTrans.isPending} onClick={() => saveTrans.mutate()}>Сохранить</Button>
          {saveTrans.isError ? <div className="text-sm text-[var(--sk-danger)]">Невалидный JSON</div> : null}
        </div>
      </Modal>
    </AppShell>
  );
}
