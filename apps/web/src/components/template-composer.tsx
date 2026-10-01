'use client';

import { useRef, type DragEvent } from 'react';
import { Input, Textarea } from '@/components/ui';

export type TemplateToken = { key: string; label: string; sample: string };

/** Подстановки, которые система умеет заполнять сама — пользователю показываем только подписи. */
export const TEMPLATE_TOKENS: TemplateToken[] = [
  { key: 'name', label: 'Имя полностью', sample: 'Иван Иванов' },
  { key: 'firstName', label: 'Имя', sample: 'Иван' },
  { key: 'vacancy', label: 'Вакансия', sample: 'Водитель' },
  { key: 'datetime', label: 'Дата и время', sample: '10 октября в 14:00' },
  { key: 'link', label: 'Ссылка', sample: 'https://…' },
  { key: 'company', label: 'Компания', sample: 'Таймыр Инвест' },
  { key: 'title', label: 'Название', sample: 'Заявка №12' },
  { key: 'stage', label: 'Этап', sample: 'Собеседование' },
  { key: 'recruiter', label: 'Рекрутер', sample: 'Анна' },
  { key: 'email', label: 'Email', sample: 'user@company.ru' },
  { key: 'board', label: 'Площадка', sample: 'HeadHunter' },
  { key: 'city', label: 'Город', sample: 'Норильск' },
];

const MARK_OPEN = '⟦';
const MARK_CLOSE = '⟧';

function labelByKey(key: string) {
  return TEMPLATE_TOKENS.find((t) => t.key === key)?.label || key;
}

function keyByLabel(label: string) {
  return TEMPLATE_TOKENS.find((t) => t.label === label)?.key;
}

/** {{name}} → ⟦Имя полностью⟧ для редактора */
export function tokensToDisplay(raw: string) {
  return raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => `${MARK_OPEN}${labelByKey(key)}${MARK_CLOSE}`);
}

/** ⟦Имя⟧ → {{name}} перед сохранением */
export function displayToTokens(display: string) {
  return display.replace(new RegExp(`${MARK_OPEN}([^${MARK_CLOSE}]+)${MARK_CLOSE}`, 'g'), (_, label: string) => {
    const key = keyByLabel(label.trim());
    return key ? `{{${key}}}` : `{{${label.trim()}}}`;
  });
}

export function unwrapHtmlBody(body: string): { text: string; wrapP: boolean } {
  const trimmed = (body || '').trim();
  const m = trimmed.match(/^<p>([\s\S]*)<\/p>$/i);
  if (m) return { text: m[1], wrapP: true };
  return { text: trimmed, wrapP: false };
}

export function wrapHtmlBody(text: string, wrapP: boolean) {
  return wrapP ? `<p>${text}</p>` : text;
}

export function previewTemplate(display: string) {
  return display.replace(new RegExp(`${MARK_OPEN}([^${MARK_CLOSE}]+)${MARK_CLOSE}`, 'g'), (_, label: string) => {
    const token = TEMPLATE_TOKENS.find((t) => t.label === label.trim());
    return token?.sample || label;
  });
}

function insertAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement,
  chunk: string,
  value: string,
  onChange: (next: string) => void,
) {
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + chunk + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + chunk.length;
    el.setSelectionRange(pos, pos);
  });
}

function usedKeysIn(display: string) {
  const keys = new Set<string>();
  const re = new RegExp(`${MARK_OPEN}([^${MARK_CLOSE}]+)${MARK_CLOSE}`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(display))) {
    const key = keyByLabel(m[1].trim());
    if (key) keys.add(key);
  }
  return keys;
}

type Props = {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  /** Какие токены предложить (по умолчанию все частые) */
  tokens?: TemplateToken[];
};

export function TemplateComposer({ subject, body, onSubjectChange, onBodyChange, tokens }: Props) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusRef = useRef<'subject' | 'body'>('body');
  const palette = tokens || TEMPLATE_TOKENS.filter((t) =>
    ['name', 'firstName', 'vacancy', 'datetime', 'link', 'company', 'recruiter', 'city'].includes(t.key),
  );

  const insert = (token: TemplateToken) => {
    const chunk = `${MARK_OPEN}${token.label}${MARK_CLOSE}`;
    if (focusRef.current === 'subject' && subjectRef.current) {
      insertAtCursor(subjectRef.current, chunk, subject, onSubjectChange);
    } else if (bodyRef.current) {
      insertAtCursor(bodyRef.current, chunk, body, onBodyChange);
    } else {
      onBodyChange(body + chunk);
    }
  };

  const onDragStart = (e: DragEvent, token: TemplateToken) => {
    e.dataTransfer.setData('text/plain', `${MARK_OPEN}${token.label}${MARK_CLOSE}`);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDropField = (
    e: DragEvent,
    el: HTMLTextAreaElement | HTMLInputElement | null,
    value: string,
    onChange: (v: string) => void,
  ) => {
    e.preventDefault();
    const chunk = e.dataTransfer.getData('text/plain');
    if (!chunk || !el) return;
    // Drop at caret if possible, else append
    if (typeof el.selectionStart === 'number') {
      insertAtCursor(el, chunk, value, onChange);
    } else {
      onChange(value + chunk);
    }
  };

  const used = usedKeysIn(subject + body);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--line)] bg-[#f7faf8] p-3">
        <div className="text-sm font-semibold text-[var(--ink)] mb-1">Подстановки</div>
        <div className="text-xs text-[var(--muted)] mb-2">Нажмите кнопку или перетащите её в тему / текст — система сама подставит данные кандидата.</div>
        <div className="flex flex-wrap gap-2">
          {palette.map((t) => (
            <button
              key={t.key}
              type="button"
              draggable
              onDragStart={(e) => onDragStart(e, t)}
              onClick={() => insert(t)}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--brand-primary)]/30 bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)] shadow-sm hover:border-[var(--brand-primary)] hover:bg-[#eef8f1] cursor-grab active:cursor-grabbing select-none"
              title="Нажмите или перетащите в поле"
            >
              <span aria-hidden className="text-[var(--muted)] text-xs tracking-tighter">⋮⋮</span>
              {t.label}
              {used.has(t.key) ? <span className="text-[var(--brand-primary)] text-xs">✓</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-[var(--muted)] mb-1">Тема</div>
        <Input
          ref={subjectRef}
          value={subject}
          onFocus={() => { focusRef.current = 'subject'; }}
          onChange={(e) => onSubjectChange(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDropField(e, subjectRef.current, subject, onSubjectChange)}
          placeholder="Тема письма"
        />
      </div>

      <div>
        <div className="text-xs text-[var(--muted)] mb-1">Текст</div>
        <Textarea
          ref={bodyRef}
          rows={8}
          value={body}
          onFocus={() => { focusRef.current = 'body'; }}
          onChange={(e) => onBodyChange(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => onDropField(e, bodyRef.current, body, onBodyChange)}
          placeholder="Напишите текст. Подстановки — кнопками выше."
          className="min-h-[140px]"
        />
      </div>

      <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--muted)]">
        <div className="font-medium text-[var(--ink)] mb-1">Как увидит получатель</div>
        <div className="whitespace-pre-wrap">{previewTemplate(subject)}</div>
        <div className="mt-1 whitespace-pre-wrap opacity-90">{previewTemplate(body)}</div>
      </div>
    </div>
  );
}
