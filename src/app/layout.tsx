import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parugu — Multiplayer Endless Runner",
  description: "Parugu is a real-time multiplayer endless runner game. Create or join rooms, compete with friends, and dominate the leaderboard!",
  keywords: ["parugu", "endless runner", "multiplayer", "game", "subway", "runner"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0a0a1a] text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
