/**
 * Peças visuais das páginas novas do portal, no mesmo estilo do resto do site:
 * cantos retos, fundo quase transparente, verde esmeralda.
 */
import { ReactNode } from 'react';

export const mono = "font-['Space_Mono']";
export const panel = 'bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]';
export const input =
  'w-full bg-[#0f0f11] border border-[var(--color-ink-faint)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-accent)]';
const btnBase = `inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs ${mono} border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default`;
export const btn = {
  ghost: `${btnBase} bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700`,
  primary: `${btnBase} bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold border-emerald-500`,
  soft: `${btnBase} bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40`,
  amber: `${btnBase} bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40`,
  danger: `${btnBase} bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30`,
};
export const chip = `inline-flex items-center gap-1 px-2 py-0.5 text-[11px] ${mono} border whitespace-nowrap`;
export const chipColor = {
  gray: 'text-gray-300 border-gray-700',
  green: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  amber: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  red: 'text-red-300 border-red-500/40 bg-red-500/10',
  blue: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  purple: 'text-purple-300 border-purple-500/40 bg-purple-500/10',
};

export function PageHeader({ icon, title, subtitle, actions }: { icon: ReactNode; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--color-ink-faint)] pb-6 mb-8">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">{icon}</div>
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
          {subtitle && <p className={`text-xs text-gray-400 ${mono} mt-1`}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-1 max-w-[72ch]">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-gray-700 p-5 text-sm text-gray-400 flex flex-wrap items-center justify-between gap-3">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className={`block text-[11px] ${mono} uppercase text-gray-400 mb-1.5`}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

export function Loading({ children = 'Carregando…' }: { children?: ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>;
}

export function Stat({ label, value, tone = 'text-white' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className={`${panel} p-4`}>
      <div className={`text-[11px] ${mono} uppercase text-gray-500`}>{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone}`}>{value}</div>
    </div>
  );
}
