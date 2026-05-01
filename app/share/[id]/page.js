'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Brain, ArrowLeft, Trophy } from 'lucide-react'
import Link from 'next/link'

export default function SharePage({ params }) {
  const [test, setTest] = useState(null)
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/share/${params.id}`).then(r => r.json()),
      fetch(`/api/leaderboard/${params.id}`).then(r => r.json()),
    ]).then(([t, b]) => { setTest(t.test); setBoard(b.leaderboard || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
  if (!test) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Test not found.</div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-950">
      <header className="border-b border-border/60 backdrop-blur-lg bg-background/70 sticky top-0 z-30">
        <div className="container mx-auto flex items-center justify-between py-3 px-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold bg-gradient-to-r from-indigo-300 to-pink-300 bg-clip-text text-transparent">Coding Arena</div>
          </Link>
          <Link href="/"><Button size="sm">Sign in to attempt</Button></Link>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-4 text-xs text-muted-foreground">Public test \u2022 read-only preview (hidden test cases hidden)</div>
        <Card className="mb-6 border-border/60 bg-card/40">
          <CardHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-2xl">{test.title}</CardTitle>
              <Badge variant="outline">{test.difficulty}</Badge>
              {(test.tags || []).map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
            </div>
            <p className="text-sm text-muted-foreground">{test.description}</p>
          </CardHeader>
        </Card>

        {(test.questions || []).map((q, i) => (
          <Card key={q.id} className="mb-4 border-border/60 bg-card/40">
            <CardHeader><CardTitle className="text-lg">Q{i + 1}. {q.title}</CardTitle></CardHeader>
            <CardContent className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown>{q.statement}</ReactMarkdown>
              {q.constraints && <><h4>Constraints</h4><ReactMarkdown>{q.constraints}</ReactMarkdown></>}
              {q.examples?.length > 0 && q.examples.map((ex, j) => (
                <div key={j} className="rounded-lg border border-border/60 p-3 bg-background/40 my-2">
                  <div className="text-xs font-semibold text-muted-foreground">Input</div>
                  <pre className="text-xs mt-1">{ex.input}</pre>
                  <div className="text-xs font-semibold text-muted-foreground mt-2">Output</div>
                  <pre className="text-xs mt-1">{ex.output}</pre>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card className="border-border/60 bg-card/40">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Leaderboard</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {board.length === 0 && <div className="text-muted-foreground text-sm">Be the first to attempt!</div>}
            {board.map((row, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded border border-border/60 text-xs">
                <span className={`w-5 text-center font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'}`}>#{i + 1}</span>
                <span className="flex-1 truncate">{row.user}</span>
                <Badge variant="outline" className="text-[10px] py-0">{row.language}</Badge>
                <span className="font-mono">{row.score}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
