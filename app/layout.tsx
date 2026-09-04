import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "GSAT — Gold & Silver Analysis Terminal",
  description: "Live gold and silver market dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="gsat-dashboard" style={{ minHeight: "100vh" }}>{children}</div>
      </body>
    </html>
  );
}
