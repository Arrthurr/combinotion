import "./globals.css";
import { Providers } from "./providers";
export const metadata = { title: "Joy for Books", description: "Book operations for school visits" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><a className="skip" href="#content">Skip to content</a><Providers>{children}</Providers></body></html>; }
