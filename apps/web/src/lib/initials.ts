// A Bangla letter carries vowel signs, which are combining marks: keep them with it.
const firstLetter = /^\P{M}\p{M}*/u;

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => firstLetter.exec(word)?.[0] ?? '')
    .join('')
    .toUpperCase();
}
