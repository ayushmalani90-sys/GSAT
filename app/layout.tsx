import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GSAT — Gold & Silver Analysis Terminal",
  description: "Free live gold and silver market dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
