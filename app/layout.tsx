import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Joy for Books",
  description: "Thoughtful book operations for stronger school communities",
  robots: { index: false, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <a className="skip" href="#content">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
