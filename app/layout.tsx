import type { Metadata } from "next";
import "./globals.css";
import "@fontsource-variable/space-grotesk";

export const metadata: Metadata = {
  title: "Aria · AI Voice Receptionist",
  description:
    "Your AI reception desk: live conversations, reliable appointments, and private call history, powered by Gemini.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
