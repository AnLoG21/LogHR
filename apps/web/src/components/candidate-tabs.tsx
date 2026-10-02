'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASSIGNMENT_STATUS_LABELS,
  CHECK_STATUS_LABELS,
  CHECK_TYPE_LABELS,
  OFFER_STATUS_LABELS,
  QUESTIONNAIRE_TYPE_LABELS,
  ruLabel,
} from '@skillaz/shared';
import { Badge, Button, ConfirmDelete, ErrorText, Field, Icon, Input, Modal, Select, Textarea } from '@/components/ui';
import { AssignmentResult, assessmentLink } from '@/components/assignment-result';
import { api } from '@/lib/api';

function origin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function CopyLinkButton({ url, label = 'Скопировать ссылку' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await navigator.clipboard?.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} className="w-4 h-4" /> {copied ? 'Скопировано' : label}
    </Button>
  );
}

const row = 'flex flex-col gap-2 border-b border-[var(--sk-line)] py-3 last:border-b-0';

/* ---------------- Офферы ---------------- */

type OfferForm = { id?: string; position: string; salary: string; startDate: string; conditions: string };

const OFFER_COLORS: Record<string, string> = {
  DRAFT: 'slate',
  PENDING_MANAGER: 'amber',
  APPROVED_MANAGER: 'blue',
  REJECTED_MANAGER: 'rose',
  SENT_TO_CANDIDATE: 'purple',
  ACCEPTED: 'green',
  DECLINED: 'rose',
};

const OFFER_NEXT: Record<string, { status: string; label: string }[]> = {
  DRAFT: [
    { status: 'PENDING_MANAGER', label: 'На согласование руководителю' },
    { status: 'SENT_TO_CANDIDATE', label: 'Отправлен кандидату' },
  ],
  PENDING_MANAGER: [
    { status: 'APPROVED_MANAGER', label: 'Руководитель согласовал' },
    { status: 'REJECTED_MANAGER', label: 'Руководитель отклонил' },
  ],
  APPROVED_MANAGER: [{ status: 'SENT_TO_CANDIDATE', label: 'Отправлен кандидату' }],
  REJECTED_MANAGER: [{ status: 'DRAFT', label: 'Вернуть на доработку' }],
  SENT_TO_CANDIDATE: [
    { status: 'ACCEPTED', label: 'Кандидат принял' },
    { status: 'DECLINED', label: 'Кандидат отказался' },
  ],
};

async function downloadOfferPdf(id: string) {
  const res = await api<{ base64: string }>(`/offers/${id}/pdf`);
  const bin = atob(res.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'offer.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OffersTab({ candidate }: { candidate: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<OfferForm | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['candidate', candidate.id] });

  const save = useMutation({
    mutationFn: (f: OfferForm) => {
      const body = {
        position: f.position,
        salary: f.salary ? Number(f.salary) : null,
        startDate: f.startDate || null,
        conditions: f.conditions,
      };
      return f.id
        ? api(`/offers/${f.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        : api('/offers', {
            method: 'POST',
            body: JSON.stringify({ ...body, candidateId: candidate.id, salary: body.salary ?? undefined, startDate: body.startDate ?? undefined }),
          });
    },
    onSuccess: () => { setForm(null); refresh(); },
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/offers/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/offers/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const pdf = useMutation({ mutationFn: downloadOfferPdf });

  const offers: any[] = candidate.offers || [];
  const newForm = (): OfferForm => ({
    position: candidate.vacancy?.title || candidate.desiredPosition || '',
    salary: '',
    startDate: '',
    conditions: '',
  });

  return (
    <div className="flex flex-col">
      {offers.map((o) => {
        const locked = o.status === 'ACCEPTED' || o.status === 'DECLINED';
        return (
          <div key={o.id} className={row}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{o.position || 'Должность не указана'}</div>
                <div className="text-sm text-[var(--sk-muted)]">
                  {o.salary ? `${Number(o.salary).toLocaleString('ru-RU')} ₽` : 'Оклад не указан'}
                  {o.startDate ? ` · выход ${new Date(o.startDate).toLocaleDateString('ru-RU')}` : ''}
                </div>
                {o.conditions ? <div className="text-sm mt-1 whitespace-pre-wrap">{o.conditions}</div> : null}
              </div>
              <Badge color={OFFER_COLORS[o.status]}>{ruLabel(OFFER_STATUS_LABELS, o.status)}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {(OFFER_NEXT[o.status] || []).map((n) => (
                <Button key={n.status} variant="ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: o.id, status: n.status })}>
                  {n.label}
                </Button>
              ))}
              {!locked ? (
                <Button
                  variant="ghost"
                  onClick={() => setForm({
                    id: o.id,
                    position: o.position || '',
                    salary: o.salary != null ? String(o.salary) : '',
                    startDate: o.startDate ? String(o.startDate).slice(0, 10) : '',
                    conditions: o.conditions || '',
                  })}
                >
                  <Icon name="edit" className="w-4 h-4" /> Изменить
                </Button>
              ) : null}
              {o.externalToken && !locked ? <CopyLinkButton url={`${origin()}/public/offer/${o.externalToken}`} label="Ссылка для кандидата" /> : null}
              <Button variant="ghost" disabled={pdf.isPending} onClick={() => pdf.mutate(o.id)}>Скачать PDF</Button>
              {o.status !== 'ACCEPTED' ? (
                <ConfirmDelete question="Удалить оффер?" onConfirm={() => remove.mutate(o.id)} pending={remove.isPending} />
              ) : null}
            </div>
          </div>
        );
      })}
      {!offers.length ? <div className="text-sm text-[var(--sk-muted)] py-2">Офферов пока нет</div> : null}
      <ErrorText error={setStatus.error || remove.error || pdf.error} />
      <div className="pt-3">
        <Button onClick={() => { save.reset(); setForm(newForm()); }}><Icon name="plus" className="w-4 h-4" /> Создать оффер</Button>
      </div>

      <Modal open={!!form} title={form?.id ? 'Изменить оффер' : 'Новый оффер'} onClose={() => setForm(null)}>
        {form ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
            <Field label="Должность">
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Оклад, ₽">
                <Input type="number" min={0} step={1000} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="Например: 120000" />
              </Field>
              <Field label="Дата выхода">
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Условия">
              <Textarea value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} placeholder="График, вахта, испытательный срок, компенсации" />
            </Field>
            <ErrorText error={save.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setForm(null)}>Отмена</Button>
              <Button type="submit" disabled={!form.position.trim() || save.isPending}>Сохранить</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

/* ---------------- Проверки ---------------- */

const CHECK_COLORS: Record<string, string> = {
  NEW: 'slate',
  IN_PROGRESS: 'amber',
  APPROVED: 'green',
  REJECTED: 'rose',
  CANCELLED: 'slate',
};

export function ChecksTab({ candidate }: { candidate: any }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['candidate', candidate.id] });
  const create = useMutation({
    mutationFn: (type: string) => api('/checks', { method: 'POST', body: JSON.stringify({ candidateId: candidate.id, type }) }),
    onSuccess: refresh,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/checks/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: refresh,
  });
  const checks: any[] = candidate.checks || [];

  return (
    <div className="flex flex-col">
      {checks.map((ch) => {
        const open = ch.status === 'NEW' || ch.status === 'IN_PROGRESS';
        return (
          <div key={ch.id} className={row}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{ruLabel(CHECK_TYPE_LABELS, ch.type)}</div>
                <div className="text-xs text-[var(--sk-muted)]">
                  запущена {new Date(ch.createdAt).toLocaleDateString('ru-RU')}
                  {ch.assignee ? ` · ${[ch.assignee.lastName, ch.assignee.firstName].filter(Boolean).join(' ')}` : ''}
                </div>
                {ch.comment ? <div className="text-sm mt-1 whitespace-pre-wrap">{ch.comment}</div> : null}
              </div>
              <Badge color={CHECK_COLORS[ch.status]}>{ruLabel(CHECK_STATUS_LABELS, ch.status)}</Badge>
            </div>
            {open ? (
              <div className="flex flex-wrap gap-2">
                {ch.externalToken ? <CopyLinkButton url={`${origin()}/public/check/${ch.externalToken}`} label="Ссылка для проверяющего" /> : null}
                {ch.externalToken ? (
                  <a className="sk-btn sk-btn-outline" href={`/public/check/${ch.externalToken}`} target="_blank" rel="noreferrer">Открыть форму</a>
                ) : null}
                <ConfirmDelete
                  label="Отменить проверку"
                  question="Отменить проверку?"
                  onConfirm={() => setStatus.mutate({ id: ch.id, status: 'CANCELLED' })}
                  pending={setStatus.isPending}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      {!checks.length ? <div className="text-sm text-[var(--sk-muted)] py-2">Проверок пока нет</div> : null}
      <ErrorText error={create.error || setStatus.error} />
      <div className="flex flex-wrap gap-2 pt-3">
        {Object.entries(CHECK_TYPE_LABELS).map(([type, label]) => (
          <Button key={type} variant="ghost" disabled={create.isPending} onClick={() => create.mutate(type)}>
            <Icon name="plus" className="w-4 h-4" /> {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Вложения ---------------- */

function fileSize(n?: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function AttachmentsTab({ candidate }: { candidate: any }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (attId: string) => api(`/candidates/${candidate.id}/attachments/${attId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidate', candidate.id] }),
  });
  const files: any[] = candidate.attachments || [];
  return (
    <div className="flex flex-col">
      {files.map((a) => {
        const href = /^https?:\/\//.test(a.url || '') ? a.url : null;
        return (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sk-line)] py-2.5 last:border-b-0">
            <div className="min-w-0">
              {href ? (
                <a className="sk-link font-medium break-all" href={href} target="_blank" rel="noreferrer">{a.fileName}</a>
              ) : (
                <span className="font-medium break-all">{a.fileName}</span>
              )}
              <div className="text-xs text-[var(--sk-muted)]">
                {new Date(a.createdAt).toLocaleDateString('ru-RU')}
                {a.size ? ` · ${fileSize(a.size)}` : ''}
                {!href ? ' · текст сохранён в резюме' : ''}
              </div>
            </div>
            <ConfirmDelete iconOnly question="Удалить файл?" onConfirm={() => remove.mutate(a.id)} pending={remove.isPending} />
          </div>
        );
      })}
      {!files.length ? <div className="text-sm text-[var(--sk-muted)] py-2">Вложений нет. Файлы резюме появляются здесь после импорта.</div> : null}
      <ErrorText error={remove.error} />
    </div>
  );
}

/* ---------------- Опросники ---------------- */

export function AssessmentsTab({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const [pick, setPick] = useState('');
  const [resultId, setResultId] = useState<string | null>(null);
  const assignments = useQuery({
    queryKey: ['assignments', candidateId],
    queryFn: () => api<any[]>(`/assessments/assignments?candidateId=${candidateId}`),
  });
  const questionnaires = useQuery({ queryKey: ['questionnaires'], queryFn: () => api<any[]>('/assessments/questionnaires') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['assignments'] });
  const assign = useMutation({
    mutationFn: () => api('/assessments/assign', { method: 'POST', body: JSON.stringify({ candidateId, questionnaireId: pick }) }),
    onSuccess: () => { setPick(''); refresh(); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/assessments/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const list = assignments.data || [];
  const result = list.find((a) => a.id === resultId);

  return (
    <div className="flex flex-col">
      {assignments.isLoading ? <div className="text-sm text-[var(--sk-muted)] py-2">Загрузка…</div> : null}
      {list.map((a) => {
        const done = a.status === 'COMPLETED';
        return (
          <div key={a.id} className={row}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{a.questionnaire?.name || 'Опросник'}</div>
                <div className="text-xs text-[var(--sk-muted)]">
                  {ruLabel(QUESTIONNAIRE_TYPE_LABELS, a.questionnaire?.type)} · отправлен {new Date(a.createdAt).toLocaleDateString('ru-RU')}
                  {a.completedAt ? ` · пройден ${new Date(a.completedAt).toLocaleDateString('ru-RU')}` : ''}
                </div>
              </div>
              <Badge color={done ? 'green' : 'amber'}>{ruLabel(ASSIGNMENT_STATUS_LABELS, a.status)}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {done ? (
                <Button variant="ghost" onClick={() => setResultId(a.id)}>Посмотреть ответы</Button>
              ) : (
                <>
                  {a.externalToken ? <CopyLinkButton url={assessmentLink(a.externalToken)} label="Ссылка для кандидата" /> : null}
                  <ConfirmDelete
                    label="Отменить"
                    question="Отменить отправку опросника?"
                    onConfirm={() => cancel.mutate(a.id)}
                    pending={cancel.isPending}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
      {!assignments.isLoading && !list.length ? <div className="text-sm text-[var(--sk-muted)] py-2">Опросники кандидату ещё не отправлялись</div> : null}
      <ErrorText error={assign.error || cancel.error} />
      <div className="flex flex-wrap gap-2 pt-3">
        <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Опросник" className="flex-1 min-w-[220px]">
          <option value="">Выберите опросник</option>
          {(questionnaires.data || []).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
        </Select>
        <Button disabled={!pick || assign.isPending} onClick={() => assign.mutate()}>Отправить кандидату</Button>
      </div>

      <Modal open={!!result} title="Ответы кандидата" onClose={() => setResultId(null)}>
        {result ? <AssignmentResult assignment={result} /> : null}
      </Modal>
    </div>
  );
}
