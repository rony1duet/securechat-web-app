import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export default function TypingIndicator({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1 w-fit",
      !compact ? "px-3 py-2 bg-white dark:bg-[#18222d] rounded-2xl rounded-tl-sm border border-slate-200 dark:border-white/5 shadow-sm" : "py-1"
    )}>
      {[0, 0.2, 0.4].map((delay, i) => (
        <motion.div
          key={i}
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1, delay }}
          className={cn("bg-blue-500 rounded-full", compact ? "w-1 h-1" : "w-1.5 h-1.5")}
        />
      ))}
    </div>
  );
}
