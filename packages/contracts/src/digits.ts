const banglaDigits = '০১২৩৪৫৬৭৮৯';

export const toAsciiDigits = (text: string) =>
  text.replace(/[০-৯]/g, (digit) => String(banglaDigits.indexOf(digit)));
