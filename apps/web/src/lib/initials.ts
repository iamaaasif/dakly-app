// A Bangla letter carries vowel signs, and a conjunct joins letters with a virama (U+09CD):
// keep both with the base letter.
const firstLetter = /^\P{M}(?:\u09CD\P{M}|\p{M})*/u;

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => firstLetter.exec(word)?.[0] ?? '')
    .join('')
    .toUpperCase();
}
