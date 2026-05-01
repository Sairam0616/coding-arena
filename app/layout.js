import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'AI Coding Practice Arena',
  description: 'Generate unlimited AI coding problems, solve in-browser, and get instant AI feedback.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
