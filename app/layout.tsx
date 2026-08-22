import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GSAT — Gold & Silver Analysis Terminal",
  description: "A focused market intelligence terminal for gold and silver.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
