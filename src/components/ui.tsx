// Shared design-system components. Small, consistent, keyboard-friendly.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Info, X, AlertTriangle, AlertOctagon, CircleAlert, CheckCircle2, CircleDot, type LucideIcon } from 'lucide-react';
import type { EventSeverity, Severity } from '../sim/types';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

// ---------- Card ----------
export function Card({ children, className, as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & Record<string, unknown>) {
  return (
    <As className={cx('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, actions, className }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink">
            <Icon size={17} strokeWidth={2} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6 text-ink">{title}</h2>
          {subtitle && <p className="text-[13px] leading-5 text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tonal';
type Size = 'sm' | 'md';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover dark:text-[#0b1a33] shadow-sm',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad-fill text-white hover:brightness-95 shadow-sm',
  tonal: 'bg-primary-soft text-primary-ink hover:brightness-[0.97] dark:hover:brightness-125',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: LucideIcon; iconRight?: LucideIcon }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 15 : 16} strokeWidth={2} aria-hidden />}
      {children}
      {IconRight && <IconRight size={15} strokeWidth={2} aria-hidden />}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, active, size = 'md', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean; size?: Size }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={cx(
          'grid shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40',
          size === 'sm' ? 'size-8' : 'size-10',
          active && 'bg-primary-soft text-primary-ink hover:bg-primary-soft',
          className,
        )}
        {...rest}
      >
        <Icon size={size === 'sm' ? 16 : 19} strokeWidth={2} aria-hidden />
      </button>
    </Tooltip>
  );
}

// ---------- Tooltip ----------
export function Tooltip({ label, children, side = 'bottom', className }: { label: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'right'; className?: string }) {
  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
      : side === 'right'
        ? 'left-full top-1/2 ml-2 -translate-y-1/2'
        : 'top-full left-1/2 mt-2 -translate-x-1/2';
  return (
    <span className={cx('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 w-max max-w-64 rounded-md bg-[#2f3337] px-2.5 py-1.5 text-xs leading-4 font-medium text-white opacity-0 shadow-pop transition-opacity delay-0 duration-100 group-hover/tt:opacity-100 group-hover/tt:delay-300 group-focus-within/tt:opacity-100 dark:bg-[#e8eaed] dark:text-[#1f2329]',
          pos,
        )}
      >
        {label}
      </span>
    </span>
  );
}

/** Small "i" with an explanation — so each technical metric can be explained in plain words. */
export function InfoTip({ text, side = 'top' }: { text: ReactNode; side?: 'top' | 'bottom' | 'right' }) {
  return (
    <Tooltip label={text} side={side}>
      <button type="button" aria-label="More information" className="grid size-4 place-items-center rounded-full text-ink-3 hover:text-ink-2">
        <Info size={13} aria-hidden />
      </button>
    </Tooltip>
  );
}

// ---------- Badges & status ----------
type Tone = 'neutral' | 'primary' | 'good' | 'warn' | 'bad' | 'crit' | 'violet';
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  primary: 'bg-primary-soft text-primary-ink',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  crit: 'bg-crit text-white dark:bg-bad-soft dark:text-crit',
  violet: 'bg-violet-soft text-violet',
};

export function Badge({ tone = 'neutral', icon: Icon, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>
      {Icon && <Icon size={13} strokeWidth={2.2} aria-hidden />}
      {children}
    </span>
  );
}

export const SEVERITY_TONE: Record<Severity | EventSeverity, Tone> = { critical: 'crit', high: 'bad', medium: 'warn', low: 'primary', info: 'neutral' };
const SEVERITY_ICON: Record<Severity | EventSeverity, LucideIcon> = { critical: AlertOctagon, high: AlertTriangle, medium: CircleAlert, low: Info, info: CircleDot };

export function SeverityBadge({ severity }: { severity: Severity | EventSeverity }) {
  return (
    <Badge tone={SEVERITY_TONE[severity]} icon={SEVERITY_ICON[severity]}>
      {severity[0].toUpperCase() + severity.slice(1)}
    </Badge>
  );
}

export function StatusDot({ tone, pulse }: { tone: 'good' | 'warn' | 'bad' | 'neutral' | 'primary'; pulse?: boolean }) {
  const c = { good: 'bg-good-fill', warn: 'bg-warn-fill', bad: 'bg-bad-fill', neutral: 'bg-ink-3', primary: 'bg-primary' }[tone];
  return (
    <span className="relative inline-flex size-2.5 shrink-0" aria-hidden>
      {pulse && <span className={cx('absolute inset-0 animate-ping rounded-full opacity-60', c)} />}
      <span className={cx('relative inline-flex size-2.5 rounded-full', c)} />
    </span>
  );
}

// ---------- Form controls ----------
export function Switch({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <label htmlFor={sid} className="min-w-0 cursor-pointer">
          {label && <span className="block text-sm font-medium text-ink">{label}</span>}
          {description && <span className="block text-[13px] leading-5 text-ink-3">{description}</span>}
        </label>
      )}
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 transition-colors duration-200 disabled:opacity-45',
          checked ? 'border-primary bg-primary' : 'border-line-strong bg-surface-3',
        )}
      >
        <span
          className={cx(
            'inline-block size-4 rounded-full shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[22px] bg-white dark:bg-[#0b1a33]' : 'translate-x-[3px] bg-ink-3',
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md', label }: { value: T; options: Array<{ value: T; label: ReactNode; icon?: LucideIcon; title?: string }>; onChange: (v: T) => void; size?: Size; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full shrink-0 overflow-x-auto rounded-full border border-line-strong bg-surface p-0.5 scroll-thin">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3.5 text-[13px]',
              active ? 'bg-primary-soft text-primary-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            {Icon && <Icon size={14} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs leading-4 text-ink-3">{hint}</p>}
    </div>
  );
}

export function Select({ value, onChange, options, id, className, ariaLabel }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; group?: string }>; id?: string; className?: string; ariaLabel?: string }) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx('h-9 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink hover:border-ink-3 focus:border-primary focus:outline-none', className)}
    >
      {groups.map((g) =>
        g ? (
          <optgroup key={g} label={g}>
            {options
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ) : (
          options
            .filter((o) => !o.group)
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
        ),
      )}
    </select>
  );
}

export function NumberField({ value, onChange, min, max, step = 1, id, suffix }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; id?: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer"
      />
      <span className="w-20 shrink-0 text-right text-sm font-medium text-ink tabular">
        {value}
        {suffix && <span className="ml-0.5 text-ink-3">{suffix}</span>}
      </span>
    </div>
  );
}

// ---------- Progress / meters ----------
export function Meter({ value, tone = 'primary', label, className }: { value: number; tone?: 'primary' | 'good' | 'warn' | 'bad'; label?: string; className?: string }) {
  const c = { primary: 'bg-primary', good: 'bg-good-fill', warn: 'bg-warn-fill', bad: 'bg-bad-fill' }[tone];
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function densityTone(d: number, threshold = 70): 'good' | 'warn' | 'bad' {
  if (d >= threshold) return 'bad';
  if (d >= 40) return 'warn';
  return 'good';
}

export function healthTone(h: number): 'good' | 'warn' | 'bad' {
  if (h >= 75) return 'good';
  if (h >= 55) return 'warn';
  return 'bad';
}

// ---------- Page header ----------
export function PageHeader({ title, description, actions, icon: Icon }: { title: string; description: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon size={22} className="text-primary" aria-hidden />}
          <h1 className="text-[26px] leading-8 font-semibold tracking-tight text-ink">{title}</h1>
        </div>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-2">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SimNote({ children = 'All values on this page are simulated — no physical sensors are connected.' }: { children?: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-ink-3">
      <Info size={13} aria-hidden /> {children}
    </p>
  );
}

// ---------- Empty state ----------
export function EmptyState({ icon: Icon = CheckCircle2, title, body, action }: { icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
        <Icon size={20} aria-hidden />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body && <p className="max-w-sm text-[13px] leading-5 text-ink-3">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------- Modal & confirm ----------
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], button, input, select')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
          <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            className={cx('relative max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-surface shadow-pop scroll-thin', width)}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
            </div>
            <div className="px-6 pt-2 pb-5 text-sm leading-6 text-ink-2">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, danger = true }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body}
    </Modal>
  );
}

// ---------- Small stat ----------
export function MiniStat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3.5 py-3">
      <div className="flex items-center gap-1 text-xs font-medium text-ink-3">{label}</div>
      <div className={cx('mt-0.5 truncate text-lg font-semibold tabular', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : 'text-ink')}>{value}</div>
      {hint && <div className="truncate text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Chip({ active, onClick, children, icon: Icon, count }: { active: boolean; onClick: () => void; children: ReactNode; icon?: LucideIcon; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
        active ? 'border-transparent bg-primary-soft text-primary-ink' : 'border-line-strong text-ink-2 hover:bg-surface-2',
      )}
    >
      {Icon && <Icon size={14} aria-hidden />}
      {children}
      {count !== undefined && <span className={cx('rounded-full px-1.5 text-[11px] tabular', active ? 'bg-primary/15' : 'bg-surface-3')}>{count}</span>}
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-9 w-full min-w-0 rounded-full border border-line-strong bg-surface px-4 text-sm text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none sm:w-64"
    />
  );
}
