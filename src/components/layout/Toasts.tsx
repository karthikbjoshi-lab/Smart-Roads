import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, TriangleAlert, OctagonAlert, X } from 'lucide-react';
import { useStore, type Toast } from '../../store/simStore';
import { cx } from '../ui';

const ICON = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: OctagonAlert };
const TONE = { info: 'text-primary', success: 'text-good', warning: 'text-warn', danger: 'text-bad' };

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useStore((s) => s.dismissToast);
  const navigate = useStore((s) => s.navigate);
  const page = useStore((s) => s.page);
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(t.id), t.tone === 'danger' ? 7000 : 4500);
    return () => window.clearTimeout(id);
  }, [t.id, t.tone, dismiss]);
  const Icon = ICON[t.tone];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.18 }}
      className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl bg-[#2f3337] px-4 py-3 text-white shadow-pop sm:w-[380px] dark:bg-[#e8eaed] dark:text-[#1f2329]"
      role={t.tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon size={18} className={cx('mt-0.5 shrink-0', TONE[t.tone], 'brightness-150 dark:brightness-100')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t.title}</p>
        {t.message && <p className="mt-0.5 text-[13px] leading-5 opacity-80">{t.message}</p>}
        {t.page && t.page !== page && (
          <button
            type="button"
            className="mt-1 text-[13px] font-semibold text-[#8ab4f8] hover:underline dark:text-[#1a73e8]"
            onClick={() => {
              navigate(t.page!);
              dismiss(t.id);
            }}
          >
            View
          </button>
        )}
      </div>
      <button type="button" aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100" onClick={() => dismiss(t.id)}>
        <X size={15} />
      </button>
    </motion.li>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <ol className="pointer-events-none fixed bottom-3 left-3 right-3 z-[90] flex flex-col items-start gap-2 sm:right-auto" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </ol>
  );
}
