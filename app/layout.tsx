import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { RoomProvider } from "@/context/RoomContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GroupRoute — The Fair Way to Meet Up",
  description: "Create a secure gatekeeper lobby, analyze everyone's location, and find the mathematically optimal meeting point for your group.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} style={{ backgroundColor: '#ffffff', colorScheme: 'light' }} data-scroll-behavior="smooth">
      <body style={{ backgroundColor: '#ffffff', color: '#1d1d1f' }}>
        <AuthProvider>
          <RoomProvider>
            {children}
          </RoomProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
