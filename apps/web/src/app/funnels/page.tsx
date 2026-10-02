'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ROLE_LABELS, stageAllowedRoles, SystemRole } from '@skillaz/shared';
import { AppShell, Button, Card, ConfirmDelete, Empty, ErrorText, Field, Icon, Input, Modal, Select } from '@/components/ui';
import { api } from '@/lib/api';

const GATED_ROLES = Object.values(SystemRole).filter((r) => r !== SystemRole.ADMIN);

type TransitionsDraft = { funnelId: string; name: string; stages: any[]; stageRoles: Record<string, string[]> };
type StageDraft = { funnelId: string; id?: string; name: string; isFinal: boolean };
type FunnelDraft = { id?: string; name: string; copyFromId: string };
type RemoveDraft = { stage: any; funnel: any; moveTo: string };

export default function FunnelsPage() {
  const qc = useQueryClient();
  const [stageForm, setStageForm] = useState<StageDraft | null>(null);
  const [funnelForm, setFunnelForm] = useState<FunnelDraft | null>(null);
  const [removing, setRemoving] = useState<RemoveDraft | null>(null);
  const [transOpen, setTransOpen] = useState<TransitionsDraft | null>(null);
  const funnels = useQuery({ queryKey: ['funnels'], queryFn: () => api<any[]>('/funnels') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['funnels'] });

  const saveStage = useMutation({
    mutationFn: (s: StageDraft) =>
      s.id
        ? api(`/funnels/stages/${s.id}`, { method: 'PATCH', body: JSON.stringify({ name: s.name, isFinal: s.isFinal }) })
        : api(`/funnels/${s.funnelId}/stages`, { method: 'POST', body: JSON.stringify({ name: s.name, isFinal: s.isFinal }) }),
    onSuccess: () => { setStageForm(null); refresh(); },
  });
  const saveFunnel = useMutation({
    mutationFn: (f: FunnelDraft) =>
      f.id
        ? api(`/funnels/${f.id}`, { method: 'PATCH', body: JSON.stringify({ name: f.name }) })
        : api('/funnels', { method: 'POST', body: JSON.stringify({ name: f.name, copyFromId: f.copyFromId || undefined }) }),
    onSuccess: () => { setFunnelForm(null); refresh(); },
  });
  const archiveFunnel = useMutation({
    mutationFn: (id: string) => api(`/funnels/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setFunnelForm(null); refresh(); },
  });
  const usage = useQuery({
    queryKey: ['stage-usage', removing?.stage.id],
    queryFn: () => api<{ candidates: number; history: number; scenarios: number }>(`/funnels/stages/${removing!.stage.id}/usage`),
    enabled: !!removing,
  });
  const removeStage = useMutation({
    mutationFn: (r: RemoveDraft) =>
      api(`/funnels/stages/${r.stage.id}${r.moveTo ? `?moveTo=${r.moveTo}` : ''}`, { method: 'DELETE' }),
    onSuccess: () => { setRemoving(null); refresh(); qc.invalidateQueries({ queryKey: ['candidates'] }); },
  });
  const saveTrans = useMutation({
    mutationFn: () =>
      api(`/funnels/${transOpen!.funnelId}/transitions`, {
        method: 'PATCH',
        body: JSON.stringify({ transitions: { stageRoles: transOpen!.stageRoles } }),
      }),
    onSuccess: () => { setTransOpen(null); refresh(); },
  });
  const move = useMutation({
    mutationFn: ({ funnelId, stageIds }: { funnelId: string; stageIds: string[] }) =>
      api(`/funnels/${funnelId}/reorder`, { method: 'POST', body: JSON.stringify({ stageIds }) }),
    onSuccess: refresh,
  });

  const list = funnels.data || [];
  const needsTarget = !!usage.data && (usage.data.candidates > 0 || usage.data.history > 0);

  return (
    <AppShell
      title="Воронки"
      subtitle="Этапы подбора, их порядок и права на переходы"
      actions={<Button onClick={() => setFunnelForm({ name: '', copyFromId: '' })}><Icon name="plus" className="w-4 h-4" /> Новая воронка</Button>}
    >
      <div className="space-y-4">
        {list.map((f: any) => {
          const stages = f.stages || [];
          return (
            <Card key={f.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-lg">{f.name}</div>
                  <div className="text-xs text-[var(--sk-muted)]">{stages.length} этапов</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => setFunnelForm({ id: f.id, name: f.name, copyFromId: '' })}>
                    <Icon name="edit" className="w-4 h-4" /> Переименовать
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setTransOpen({
                      funnelId: f.id,
                      name: f.name,
                      stages,
                      stageRoles: Object.fromEntries(stages.map((s: any) => [s.code, stageAllowedRoles(f.transitions, s.code) || []])),
                    })}
                  >
                    Права на этапы
                  </Button>
                  <Button variant="ghost" onClick={() => setStageForm({ funnelId: f.id, name: '', isFinal: false })}>
                    <Icon name="plus" className="w-4 h-4" /> Этап
                  </Button>
                </div>
              </div>
              <ol className="space-y-1">
                {stages.map((s: any, i: number) => {
                  const roles = stageAllowedRoles(f.transitions, s.code);
                  return (
                    <li key={s.id} className="flex items-center gap-2 text-sm border-b border-[var(--sk-line)] py-1.5">
                      <span className="text-[var(--sk-muted)] w-6 tabular-nums">{i + 1}</span>
                      <span className="font-medium flex-1 min-w-0">
                        {s.name}
                        {s.isFinal ? <span className="ml-2 text-xs font-semibold text-[var(--sk-text-success)]">выход на работу</span> : null}
                        {roles ? (
                          <span className="ml-2 text-xs font-normal text-[var(--sk-muted)]">
                            только: {roles.map((r) => ROLE_LABELS[r as SystemRole] || r).join(', ')}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="sk-btn sk-btn-icon"
                        aria-label={`Поднять «${s.name}»`}
                        disabled={i === 0 || move.isPending}
                        onClick={() => {
                          const ids = stages.map((x: any) => x.id);
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          move.mutate({ funnelId: f.id, stageIds: ids });
                        }}
                      >
                        <Icon name="up" className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="sk-btn sk-btn-icon"
                        aria-label={`Опустить «${s.name}»`}
                        disabled={i === stages.length - 1 || move.isPending}
                        onClick={() => {
                          const ids = stages.map((x: any) => x.id);
                          [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
                          move.mutate({ funnelId: f.id, stageIds: ids });
                        }}
                      >
                        <Icon name="down" className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="sk-btn sk-btn-icon"
                        aria-label={`Изменить «${s.name}»`}
                        onClick={() => setStageForm({ funnelId: f.id, id: s.id, name: s.name, isFinal: !!s.isFinal })}
                      >
                        <Icon name="edit" className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="sk-btn sk-btn-icon"
                        aria-label={`Удалить «${s.name}»`}
                        disabled={stages.length <= 1}
                        onClick={() => { removeStage.reset(); setRemoving({ stage: s, funnel: f, moveTo: '' }); }}
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>
              {!stages.length ? <Empty text="Нет этапов" /> : null}
            </Card>
          );
        })}
        {!funnels.isLoading && !list.length ? <Empty text="Воронок нет" /> : null}
      </div>

      <Modal open={!!stageForm} title={stageForm?.id ? 'Изменить этап' : 'Новый этап'} onClose={() => setStageForm(null)}>
        {stageForm ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveStage.mutate(stageForm); }}>
            <Field label="Название этапа">
              <Input value={stageForm.name} onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })} placeholder="Например: Медосмотр" required />
            </Field>
            <label className="text-sm flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={stageForm.isFinal} onChange={(e) => setStageForm({ ...stageForm, isFinal: e.target.checked })} />
              <span>
                Финальный этап
                <span className="block text-xs text-[var(--sk-muted)]">Кандидаты на этом этапе считаются вышедшими на работу</span>
              </span>
            </label>
            <ErrorText error={saveStage.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setStageForm(null)}>Отмена</Button>
              <Button type="submit" disabled={!stageForm.name.trim() || saveStage.isPending}>Сохранить</Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!funnelForm} title={funnelForm?.id ? 'Переименовать воронку' : 'Новая воронка'} onClose={() => setFunnelForm(null)}>
        {funnelForm ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveFunnel.mutate(funnelForm); }}>
            <Field label="Название">
              <Input value={funnelForm.name} onChange={(e) => setFunnelForm({ ...funnelForm, name: e.target.value })} placeholder="Например: Массовый подбор" required />
            </Field>
            {!funnelForm.id ? (
              <Field label="Этапы" hint="Можно скопировать этапы и права из существующей воронки">
                <Select value={funnelForm.copyFromId} onChange={(e) => setFunnelForm({ ...funnelForm, copyFromId: e.target.value })}>
                  <option value="">Стандартный набор (отклик, собеседование, оффер, выход)</option>
                  {list.map((f: any) => <option key={f.id} value={f.id}>Как в «{f.name}»</option>)}
                </Select>
              </Field>
            ) : null}
            <ErrorText error={saveFunnel.error || archiveFunnel.error} />
            <div className="flex flex-wrap justify-between gap-2">
              {funnelForm.id ? (
                <ConfirmDelete
                  label="В архив"
                  question="Убрать воронку в архив?"
                  onConfirm={() => archiveFunnel.mutate(funnelForm.id!)}
                  pending={archiveFunnel.isPending}
                />
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setFunnelForm(null)}>Отмена</Button>
                <Button type="submit" disabled={!funnelForm.name.trim() || saveFunnel.isPending}>Сохранить</Button>
              </div>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!removing} title={`Удалить этап «${removing?.stage.name || ''}»`} onClose={() => setRemoving(null)}>
        {removing ? (
          <div className="flex flex-col gap-3">
            {usage.isLoading ? <div className="text-sm text-[var(--sk-muted)]">Проверяем, используется ли этап…</div> : null}
            {usage.data ? (
              <div className="text-sm">
                {usage.data.candidates ? <p>Сейчас на этапе кандидатов: <b>{usage.data.candidates}</b>.</p> : <p>Сейчас на этапе нет кандидатов.</p>}
                {usage.data.history ? <p className="text-[var(--sk-muted)] mt-1">История переходов будет перенесена на выбранный этап с пометкой об удалении.</p> : null}
                {usage.data.scenarios ? <p className="text-[var(--sk-muted)] mt-1">Привязанные к этапу опросники ({usage.data.scenarios}) перестанут отправляться.</p> : null}
              </div>
            ) : null}
            {needsTarget ? (
              <Field label="Куда перенести кандидатов">
                <Select value={removing.moveTo} onChange={(e) => setRemoving({ ...removing, moveTo: e.target.value })}>
                  <option value="">Выберите этап</option>
                  {(removing.funnel.stages || []).filter((s: any) => s.id !== removing.stage.id).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <ErrorText error={removeStage.error || usage.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRemoving(null)}>Отмена</Button>
              <Button
                type="button"
                className="!bg-[var(--sk-danger)] !border-0 !text-white"
                disabled={!usage.data || (needsTarget && !removing.moveTo) || removeStage.isPending}
                onClick={() => removeStage.mutate(removing)}
              >
                Удалить этап
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!transOpen} title={`Кто может переводить на этап · ${transOpen?.name || ''}`} onClose={() => setTransOpen(null)}>
        <div className="space-y-3">
          <div className="text-xs text-[var(--sk-muted)]">
            Отметьте роли, которым разрешён перевод кандидата на этап. Без отметок этап доступен всем. Администратор может всегда.
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--sk-muted)]">
                  <th className="text-left py-1 pr-2 font-medium">Этап</th>
                  {GATED_ROLES.map((r) => <th key={r} className="px-1 py-1 font-medium text-center">{ROLE_LABELS[r]}</th>)}
                </tr>
              </thead>
              <tbody>
                {(transOpen?.stages || []).map((s: any) => {
                  const selected = transOpen?.stageRoles[s.code] || [];
                  return (
                    <tr key={s.id} className="border-t border-[var(--sk-line)]">
                      <td className="py-1.5 pr-2">
                        {s.name}
                        {!selected.length ? <span className="ml-1 text-xs text-[var(--sk-muted)]">· все</span> : null}
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
          <ErrorText error={saveTrans.error} />
          <Button disabled={saveTrans.isPending} onClick={() => saveTrans.mutate()}>Сохранить</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
