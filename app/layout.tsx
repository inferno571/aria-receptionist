import type { Metadata } from "next";
import "./globals.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";

export const metadata: Metadata = {
  title: "Aria · AI Voice Receptionist",
  description:
    "Your AI reception desk: live conversations, reliable appointments, and private call history, powered by Gemini.",
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
