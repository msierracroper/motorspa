import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Figtree, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
});

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'MotoSpa', template: '%s · MotoSpa' },
  description: 'Gestión de lavadero y parqueadero de motos',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#eef6fa',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es-CO"
      className={`${figtree.variable} ${bricolage.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
