import React from 'react';

export default function SectionBar({ title, width = 'w-[816px]', textClass = 'text-sm', uppercase = true, accent = 'blue', children }: { title: string; width?: string; textClass?: string; uppercase?: boolean; accent?: 'blue'|'indigo'|'teal'|'rose'|'amber'|'purple'|'gray'|'slate'|'emerald'|'pink'; children?: React.ReactNode }) {
 const tracking = uppercase ? 'tracking-[0.06em]' : 'tracking-normal';
  const accentMap: Record<string, string> = {
 blue: 'bg-blue-200 dark:bg-blue-900/25 border-b border-blue-300/60 dark:border-blue-400/40',
 indigo: 'bg-indigo-200 dark:bg-indigo-900/25 border-b border-indigo-300/60 dark:border-indigo-400/40',
 teal: 'bg-teal-200 dark:bg-teal-900/25 border-b border-teal-300/50 dark:border-teal-400/40',
 rose: 'bg-rose-200 dark:bg-rose-900/25 border-b border-rose-300/60 dark:border-rose-400/40',
 amber: 'bg-amber-200 dark:bg-amber-900/25 border-b border-amber-300/60 dark:border-amber-400/40',
 purple: 'bg-purple-200 dark:bg-purple-900/25 border-b border-purple-300/60 dark:border-purple-400/40',
 gray: 'bg-gray-200 dark:bg-gray-900/25 border-b border-gray-300/60 dark:border-gray-400/40',
 slate: 'bg-slate-200 dark:bg-slate-900/25 border-b border-slate-300/60 dark:border-slate-400/40',
 emerald: 'bg-emerald-200 dark:bg-emerald-900/25 border-b border-emerald-300/60 dark:border-emerald-400/40',
 pink: 'bg-pink-200 dark:bg-pink-900/25 border-b border-pink-300/60 dark:border-pink-400/40',
  };
  const accentClass = accentMap[accent] || accentMap.slate;
  return (
    <div className={`h-8 ${width} ${accentClass} flex items-center justify-between px-[48px]`}>
      <span className={`${uppercase ? 'uppercase' : ''} font-semibold ${tracking} ${textClass} text-black/80 dark:text-white/80`}>{title}</span>
      {children ? (
        <div className="ml-4 flex items-center gap-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}