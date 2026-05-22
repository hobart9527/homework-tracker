import type { Metadata } from "next";
import "../styles/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "作业小管家",
  description: "帮助家长管理孩子作业的小工具",
};

export function generateStaticParams() {
  return [{ locale: "zh" }, { locale: "en" }];
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Enable static rendering
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background">
        <a href="#main-content" className="skip-to-content">跳过导航，查看内容</a>
        <main id="main-content">
          <ToastProvider>
            <NextIntlClientProvider messages={messages}>
              {children}
            </NextIntlClientProvider>
          </ToastProvider>
        </main>
      </body>
    </html>
  );
}
