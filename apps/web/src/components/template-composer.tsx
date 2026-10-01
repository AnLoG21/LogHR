'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import clsx from 'clsx';

export type TemplateToken = { key: string; label: string; sample: string };

/** Values are stored as {{key}}; the user only ever sees chips with labels. */
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
  { key: 'orgUnit', label: 'Подразделение', sample: 'Склад №1' },
];

export const MESSAGE_TOKENS = TEMPLATE_TOKENS.filter((t) =>
  ['name', 'firstName', 'vacancy', 'datetime', 'link', 'company', 'recruiter', 'city'].includes(t.key),
);

export const VACANCY_TOKENS = TEMPLATE_TOKENS.filter((t) => ['vacancy', 'city', 'company', 'orgUnit'].includes(t.key));

const DRAG_TYPE = 'application/x-loghr-token';
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function labelOf(key: string) {
  return TEMPLATE_TOKENS.find((t) => t.key === key)?.label || key;
}

function sampleOf(key: string) {
  return TEMPLATE_TOKENS.find((t) => t.key === key)?.sample || labelOf(key);
}

/** {{name}} → «Имя полностью» for read-only lists */
export function humanizeTemplate(raw: string) {
  return (raw || '').replace(TOKEN_RE, (_, k: string) => `«${labelOf(k)}»`);
}

export function previewTemplate(raw: string) {
  return (raw || '').replace(TOKEN_RE, (_, k: string) => sampleOf(k));
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

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeChip(key: string) {
  const el = document.createElement('span');
  el.className = 'tok-chip';
  el.contentEditable = 'false';
  el.draggable = true;
  el.dataset.token = key;
  el.textContent = labelOf(key);
  return el;
}

function toHtml(raw: string) {
  const parts = (raw || '').split(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g);
  return parts
    .map((part) => {
      const m = part.match(/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/);
      if (m) {
        return `<span class="tok-chip" contenteditable="false" draggable="true" data-token="${m[1]}">${esc(labelOf(m[1]))}</span>`;
      }
      return esc(part).replace(/\n/g, '<br>');
    })
    .join('');
}

function serializeNode(root: Node): string {
  let out = '';
  root.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += (n.textContent || '').replace(/\u200B/g, '');
    } else if (n instanceof HTMLElement) {
      if (n.dataset.token) out += `{{${n.dataset.token}}}`;
      else if (n.tagName === 'BR') out += '\n';
      else if (n.tagName === 'DIV' || n.tagName === 'P') {
        if (out && !out.endsWith('\n')) out += '\n';
        out += serializeNode(n);
      } else out += serializeNode(n);
    }
  });
  return out;
}

function serialize(root: HTMLElement) {
  let out = serializeNode(root);
  if (root.lastChild instanceof HTMLElement && root.lastChild.tagName === 'BR') out = out.replace(/\n$/, '');
  return out;
}

function rangeFromPoint(x: number, y: number): Range | null {
  const d = document as any;
  if (d.caretRangeFromPoint) return d.caretRangeFromPoint(x, y);
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.offsetNode, p.offset);
    r.collapse(true);
    return r;
  }
  return null;
}

/** Never drop inside a chip: snap to whichever side of it is closer. */
function snapOutOfChip(range: Range, x: number) {
  const node = range.startContainer;
  const el = node instanceof HTMLElement ? node : node.parentElement;
  const chip = el?.closest('[data-token]');
  if (!chip) return;
  const rect = chip.getBoundingClientRect();
  if (x < rect.left + rect.width / 2) range.setStartBefore(chip);
  else range.setStartAfter(chip);
  range.collapse(true);
}

function caretRect(range: Range): DOMRect | null {
  const rects = range.getClientRects();
  if (rects.length && rects[0].height) return rects[0];
  const probe = document.createElement('span');
  probe.textContent = '\u200B';
  const r = range.cloneRange();
  r.insertNode(probe);
  const rect = probe.getBoundingClientRect();
  const parent = probe.parentNode;
  probe.remove();
  parent?.normalize();
  return rect;
}

let draggingChip: HTMLElement | null = null;

export type TokenFieldHandle = { insertToken: (key: string) => void; focus: () => void };

type TokenFieldProps = {
  value: string;
  onChange: (raw: string) => void;
  multiline?: boolean;
  placeholder?: string;
  onFocus?: () => void;
  className?: string;
  minHeight?: number;
};

export const TokenField = forwardRef<TokenFieldHandle, TokenFieldProps>(function TokenField(
  { value, onChange, multiline = false, placeholder, onFocus, className, minHeight },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRaw = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [caret, setCaret] = useState<{ left: number; top: number; height: number } | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || value === lastRaw.current) return;
    el.innerHTML = toHtml(value);
    lastRaw.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const raw = serialize(el);
    lastRaw.current = raw;
    onChange(raw);
  }, [onChange]);

  const saveSelection = () => {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (!sel || !sel.rangeCount || !el) return;
    const r = sel.getRangeAt(0);
    if (el.contains(r.startContainer)) savedRange.current = r.cloneRange();
  };

  const placeCaretAfter = (node: Node) => {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    savedRange.current = r.cloneRange();
  };

  const endRange = () => {
    const el = editorRef.current!;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    return r;
  };

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    insertToken: (key: string) => {
      const el = editorRef.current;
      if (!el) return;
      const r = savedRange.current && el.contains(savedRange.current.startContainer) ? savedRange.current : endRange();
      const chip = makeChip(key);
      r.insertNode(chip);
      el.focus();
      placeCaretAfter(chip);
      emit();
    },
  }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (multiline) document.execCommand('insertLineBreak');
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    let text = e.clipboardData.getData('text/plain');
    if (!multiline) text = text.replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
    if (text.includes('{{')) {
      const el = editorRef.current!;
      const raw = serialize(el);
      el.innerHTML = toHtml(raw);
      lastRaw.current = raw;
      onChange(raw);
      const r = endRange();
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    const chip = (e.target as HTMLElement).closest?.('[data-token]') as HTMLElement | null;
    if (!chip) {
      e.preventDefault();
      return;
    }
    draggingChip = chip;
    e.dataTransfer.setData(DRAG_TYPE, chip.dataset.token || '');
    e.dataTransfer.setData('text/plain', '');
    e.dataTransfer.effectAllowed = 'copyMove';
    chip.classList.add('tok-chip-dragging');
  };

  const onDragEnd = () => {
    draggingChip?.classList.remove('tok-chip-dragging');
    draggingChip = null;
    setCaret(null);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingChip && editorRef.current?.contains(draggingChip) ? 'move' : 'copy';
    const r = rangeFromPoint(e.clientX, e.clientY);
    const wrap = wrapRef.current;
    if (!r || !wrap || !editorRef.current?.contains(r.startContainer)) return;
    snapOutOfChip(r, e.clientX);
    const rect = caretRect(r);
    if (!rect) return;
    const w = wrap.getBoundingClientRect();
    setCaret({ left: rect.left - w.left, top: rect.top - w.top, height: rect.height || 18 });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setCaret(null);
    const el = editorRef.current;
    if (!el) return;
    const key = e.dataTransfer.getData(DRAG_TYPE);
    let r = rangeFromPoint(e.clientX, e.clientY);
    if (!r || !el.contains(r.startContainer)) r = endRange();
    snapOutOfChip(r, e.clientX);

    if (key) {
      if (draggingChip && el.contains(draggingChip)) draggingChip.remove();
      const chip = makeChip(key);
      r.insertNode(chip);
      el.focus();
      placeCaretAfter(chip);
    } else {
      const text = e.dataTransfer.getData('text/plain');
      if (!text) return;
      const node = document.createTextNode(multiline ? text : text.replace(/\s*\n\s*/g, ' '));
      r.insertNode(node);
      placeCaretAfter(node);
    }
    draggingChip?.classList.remove('tok-chip-dragging');
    draggingChip = null;
    emit();
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline={multiline}
        contentEditable
        suppressContentEditableWarning
        className={clsx('sk-input tok-editor !h-auto', multiline ? 'py-2.5' : 'py-2', className)}
        style={{ minHeight: minHeight ?? (multiline ? 140 : 40) }}
        onInput={emit}
        onKeyDown={onKeyDown}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        onFocus={onFocus}
        onPaste={onPaste}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={() => setCaret(null)}
        onDrop={onDrop}
      />
      {!value && placeholder ? (
        <div className="pointer-events-none absolute left-3 top-2.5 text-sm text-[var(--muted)] select-none">{placeholder}</div>
      ) : null}
      {caret ? <div className="tok-caret" style={{ left: caret.left - 1, top: caret.top, height: caret.height }} /> : null}
    </div>
  );
});

export function TokenPalette({
  tokens,
  onInsert,
  hint = 'Перетащите в нужное место текста или нажмите, чтобы вставить у курсора.',
}: {
  tokens: TemplateToken[];
  onInsert: (key: string) => void;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[#f7faf8] p-3">
      <div className="text-sm font-semibold text-[var(--ink)] mb-1">Подстановки</div>
      <div className="text-xs text-[var(--muted)] mb-2">{hint}</div>
      <div className="flex flex-wrap gap-2">
        {tokens.map((t) => (
          <button
            key={t.key}
            type="button"
            draggable
            onDragStart={(e) => {
              draggingChip = null;
              e.dataTransfer.setData(DRAG_TYPE, t.key);
              e.dataTransfer.setData('text/plain', '');
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(t.key)}
            className="tok-chip tok-chip-palette"
            title="Перетащите в текст или нажмите"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type ComposerProps = {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  tokens?: TemplateToken[];
  subjectLabel?: string;
  bodyLabel?: string;
};

export function TemplateComposer({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  tokens = MESSAGE_TOKENS,
  subjectLabel = 'Тема',
  bodyLabel = 'Текст',
}: ComposerProps) {
  const subjectRef = useRef<TokenFieldHandle>(null);
  const bodyRef = useRef<TokenFieldHandle>(null);
  const focusRef = useRef<'subject' | 'body'>('body');

  return (
    <div className="space-y-3">
      <TokenPalette
        tokens={tokens}
        onInsert={(key) => (focusRef.current === 'subject' ? subjectRef : bodyRef).current?.insertToken(key)}
      />

      <div>
        <div className="text-xs text-[var(--muted)] mb-1">{subjectLabel}</div>
        <TokenField
          ref={subjectRef}
          value={subject}
          onChange={onSubjectChange}
          onFocus={() => { focusRef.current = 'subject'; }}
          placeholder="Тема письма"
        />
      </div>

      <div>
        <div className="text-xs text-[var(--muted)] mb-1">{bodyLabel}</div>
        <TokenField
          ref={bodyRef}
          value={body}
          onChange={onBodyChange}
          onFocus={() => { focusRef.current = 'body'; }}
          multiline
          placeholder="Напишите текст и добавьте подстановки"
        />
      </div>

      <div className="rounded-lg border border-dashed border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--muted)]">
        <div className="font-medium text-[var(--ink)] mb-1">Как увидит получатель</div>
        <div className="whitespace-pre-wrap font-medium">{previewTemplate(subject)}</div>
        <div className="mt-1 whitespace-pre-wrap">{previewTemplate(body)}</div>
      </div>
    </div>
  );
}
