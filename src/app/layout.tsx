import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "YGGDRASIL — The DMMO-RPG MUD",
  description: "A text MUD faithful to YGGDRASIL from Overlord: 100 levels, racial and job classes, tier magic with Super Tier at 70, karma, death penalties, World Items and World Enemies.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
