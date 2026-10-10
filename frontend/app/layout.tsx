import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Hide Lenny — can you hide him in plain sight?", description: "Hide the little green dragon, mark your photo, and challenge AI to find him." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
