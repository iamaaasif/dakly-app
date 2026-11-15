import type { ReactNode } from 'react';
import { Inter, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const bengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-bengali',
  display: 'swap',
});

export const metadata = { title: 'Dakly staff' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${bengali.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
