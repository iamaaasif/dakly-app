import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const mergeClasses = extendTailwindMerge({ extend: { theme: { text: ['md'] } } });

export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs));
}
