import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Atlantic — Entitlements Admin",
  description: "Manage user subscriptions and entitlements",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <header className="bg-white border-b border-gray-200 px-6 py-4 mb-8">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight text-gray-900">The Atlantic</span>
            <span className="text-gray-300 text-xl">|</span>
            <span className="text-sm text-gray-500 uppercase tracking-widest font-medium">
              Entitlements Admin
            </span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 pb-16">{children}</main>
      </body>
    </html>
  );
}
