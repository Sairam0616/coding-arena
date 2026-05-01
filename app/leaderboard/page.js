'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Brain, Trophy, Users, FileCode2, Crown, Medal, Award, Target } from 'lucide-react'

export default function GlobalLeaderboard() {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch('/api/global-leaderboard').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  if (!data) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>

  const board = data.leaderboard || []
  const top3 = board.slice(0, 3)
  const rest = board.slice(3)

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
          <Link href="/"><Button size="sm" variant="outline">Open App</Button></Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="text-center mb-8">
          <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-2" />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
            Global Leaderboard
          </h1>
          <p className="text-muted-foreground mt-1">Top coders across all tests</p>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mb-8">
          <Stat icon={<Users className="w-5 h-5 text-indigo-400" />} label="Total Coders" value={data.stats.totalUsers} />
          <Stat icon={<FileCode2 className="w-5 h-5 text-purple-400" />} label="Tests Created" value={data.stats.totalTests} />
          <Stat icon={<Target className="w-5 h-5 text-emerald-400" />} label="Submissions" value={data.stats.totalAttempts} />
        </div>

        {top3.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {top3.map((row, i) => (
              <PodiumCard key={i} rank={i + 1} row={row} />
            ))}
          </div>
        )}

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Full Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            {board.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No coders ranked yet. <Link href="/" className="text-primary underline">Be the first!</Link>
              </div>
            )}
            <div className="space-y-1">
              {rest.map((row, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded border border-border/60 hover:bg-card/60 transition">
                  <span className="w-8 text-center font-mono text-muted-foreground">#{i + 4}</span>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/40 to-purple-500/40 flex items-center justify-center font-bold text-xs">
                    {row.user[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                      {row.user}
                      {row.is_admin && <Crown className="w-3 h-3 text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{row.tests_taken} tests • {row.languages.slice(0, 3).join(', ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">{row.solved}<span className="text-xs text-muted-foreground"> solved</span></div>
                    <div className="text-[10px] text-emerald-400">{row.avg_score}% avg</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function PodiumCard({ rank, row }) {
  const styles = [
    { bg: 'from-amber-500/30 to-yellow-600/20', border: 'border-amber-500/50', icon: <Crown className="w-7 h-7 text-amber-400" />, height: 'min-h-[180px]' },
    { bg: 'from-slate-400/30 to-slate-500/20', border: 'border-slate-400/50', icon: <Medal className="w-6 h-6 text-slate-300" />, height: 'min-h-[160px]' },
    { bg: 'from-amber-700/30 to-orange-700/20', border: 'border-amber-700/50', icon: <Award className="w-6 h-6 text-amber-700" />, height: 'min-h-[150px]' },
  ][rank - 1]
  return (
    <Card className={`bg-gradient-to-b ${styles.bg} border ${styles.border} ${styles.height} flex flex-col items-center justify-center text-center p-4`}>
      {styles.icon}
      <div className="font-bold text-lg mt-2 truncate w-full">{row.user}</div>
      <div className="text-3xl font-extrabold mt-1">{row.solved}</div>
      <div className="text-xs text-muted-foreground">problems solved</div>
      <div className="text-[10px] text-emerald-300 mt-1">{row.avg_score}% avg • {row.tests_taken} tests</div>
    </Card>
  )
}

function Stat({ icon, label, value }) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-background/60 flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}
