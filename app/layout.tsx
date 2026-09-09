import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Sistema de Asistencias",
  description: "Control de asistencias seguro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Asistencias",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${jakarta.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col bg-slate-50">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
