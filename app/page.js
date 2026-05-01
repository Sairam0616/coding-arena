'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import { diffLines } from 'diff'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Send, Sparkles, Code2, Play, Check, X, Loader2, Brain, ArrowLeft,
  Trash2, Timer, Trophy, Target, TrendingUp, FileCode2, Zap, MessageSquare,
  LogOut, User, Shield, Lightbulb, History as HistoryIcon, Share2, Crown,
  GraduationCap, Eye, MousePointerClick, Plus, Power, Copy,
} from 'lucide-react'

const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const LANGUAGES = [
  { id: 'python', name: 'Python 3' },
  { id: 'java', name: 'Java' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'cpp', name: 'C++' },
]
const DEFAULT_STARTER = {
  python: '# read stdin, print stdout\nline = input()\nprint(line)\n',
  java: 'import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    String line = sc.nextLine();\n    System.out.println(line);\n  }\n}\n',
  javascript: 'const lines = require("fs").readFileSync(0,"utf8").trim().split("\\n");\nconsole.log(lines[0]);\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n  string s; getline(cin, s);\n  cout << s << endl;\n  return 0;\n}\n',
}

function getSessionId() {
  if (typeof window === 'undefined') return ''
  let sid = localStorage.getItem('arena_session')
  if (!sid) { sid = crypto.randomUUID(); localStorage.setItem('arena_session', sid) }
  return sid
}

export default function App() {
  const [user, setUser] = useState(null)
  const [needsAds, setNeedsAds] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [view, setView] = useState('home')
  const [activeTest, setActiveTest] = useState(null)
  const [activeQ, setActiveQ] = useState(0)
  const [tests, setTests] = useState([])

  const checkAuth = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me')
      const d = await r.json()
      setUser(d.user)
      setNeedsAds(!!d.needs_ads)
    } catch {} finally { setAuthChecked(true) }
  }, [])

  const loadTests = useCallback(async () => {
    if (!user) return
    try { const r = await fetch('/api/tests'); const d = await r.json(); setTests(d.tests || []) } catch {}
  }, [user])

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { loadTests() }, [loadTests, user])

  // Public share view detection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/^\/share\/(.+)$/)
      if (m) {
        // handled by separate share page in app router
      }
    }
  }, [])

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }
  if (!user) return <AuthGate onAuth={(u, na) => { setUser(u); setNeedsAds(na) }} />

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-slate-950">
      <Header user={user} view={view} setView={setView} onLogout={async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        setUser(null); setView('home')
      }} />
      {needsAds && <AdsModal onDone={() => setNeedsAds(false)} />}
      {view === 'home' && (
        <Home tests={tests} onOpenTest={(t) => { setActiveTest(t); setActiveQ(0); setView('solve') }} onReload={loadTests} />
      )}
      {view === 'solve' && activeTest && (
        <Solve test={activeTest} qIndex={activeQ} setQIndex={setActiveQ} user={user}
          onBack={() => { setView('home'); loadTests() }} />
      )}
      {view === 'dashboard' && <Dashboard onBack={() => setView('home')} />}
      {view === 'admin' && user.is_admin && <AdminPanel onBack={() => setView('home')} />}
    </div>
  )
}

// ============= AUTH GATE =============
function AuthGate({ onAuth }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!')
      onAuth(d.user, !!d.needs_ads)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 p-4">
      <Card className="w-full max-w-md border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-purple-900/20">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-purple-500/40 mb-3">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-2xl bg-gradient-to-r from-indigo-300 to-pink-300 bg-clip-text text-transparent">
            AI Coding Practice Arena
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Generate unlimited coding tests. Practice. Improve.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === 'signup' && (
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </div>
          )}
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          </div>
          <Button onClick={submit} disabled={loading || !email || !password} className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
          <button className="text-xs text-muted-foreground hover:text-foreground w-full text-center pt-1"
            onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
          <p className="text-[10px] text-center text-muted-foreground pt-2">
            First user becomes admin automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============= ADS MODAL =============
function AdsModal({ onDone }) {
  const [ads, setAds] = useState([])
  const [adsense, setAdsense] = useState(null)
  const [idx, setIdx] = useState(0)
  const [secs, setSecs] = useState(6)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/ads/today').then(r => r.json()).then(d => {
      setAds(d.ads || [])
      setAdsense(d.adsense || null)
      setLoaded(true)
      if (!d.needs || (d.ads.length === 0 && !d.adsense)) {
        // No ads to show; just mark seen to suppress
        fetch('/api/ads/seen', { method: 'POST' }).then(() => onDone())
      }
    })
  }, [onDone])

  useEffect(() => {
    if (!ads.length) return
    setSecs(ads[idx]?.duration || 6)
    const ad = ads[idx]
    if (ad?.id) fetch('/api/ads/impression', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad_id: ad.id }) })
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [idx, ads])

  const next = async () => {
    if (idx + 1 < 3 && idx + 1 < ads.length) setIdx(i => i + 1)
    else { await fetch('/api/ads/seen', { method: 'POST' }); onDone() }
  }

  if (!loaded || !ads.length) return null
  const ad = ads[idx]

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-xl" onInteractOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Sponsor Message ({Math.min(idx + 1, 3)}/{Math.min(3, ads.length)})
          </DialogTitle>
        </DialogHeader>
        <a href={ad.target_url} target="_blank" rel="noopener noreferrer"
          onClick={() => fetch('/api/ads/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ad_id: ad.id }) })}
          className="block group">
          <div className="rounded-lg overflow-hidden border border-border/60 bg-black">
            {ad.type === 'image' && ad.image_url && (
              <img src={ad.image_url} alt={ad.title} className="w-full h-64 object-cover group-hover:scale-105 transition-transform" />
            )}
            {ad.type === 'video' && ad.image_url && (
              <video src={ad.image_url} autoPlay muted className="w-full h-64 object-cover" />
            )}
          </div>
          <div className="mt-2">
            <div className="font-medium text-sm">{ad.title}</div>
            <div className="text-xs text-primary">Click to learn more →</div>
          </div>
        </a>
        {adsense?.client && adsense?.slot && (
          <div className="text-[10px] text-muted-foreground">AdSense slot configured: {adsense.slot}</div>
        )}
        <DialogFooter>
          <Button onClick={next} disabled={secs > 0} className="bg-gradient-to-r from-indigo-500 to-purple-500">
            {secs > 0 ? `Skip in ${secs}s` : (idx + 1 >= Math.min(3, ads.length) ? 'Continue to App' : 'Next Ad')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============= HEADER =============
function Header({ user, view, setView, onLogout }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 backdrop-blur-lg bg-background/70">
      <div className="container mx-auto flex items-center justify-between py-3 px-4">
        <button onClick={() => setView('home')} className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <div className="font-bold text-base leading-none bg-gradient-to-r from-indigo-300 to-pink-300 bg-clip-text text-transparent">Coding Arena</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">AI-Powered Practice</div>
          </div>
        </button>
        <nav className="flex gap-1 items-center">
          <Button variant={view === 'home' ? 'default' : 'ghost'} size="sm" onClick={() => setView('home')}>
            <MessageSquare className="w-4 h-4 mr-1.5" /> Generate
          </Button>
          <Button variant={view === 'dashboard' ? 'default' : 'ghost'} size="sm" onClick={() => setView('dashboard')}>
            <TrendingUp className="w-4 h-4 mr-1.5" /> Progress
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/leaderboard"><Trophy className="w-4 h-4 mr-1.5" /> Global</a>
          </Button>
          {user.is_admin && (
            <Button variant={view === 'admin' ? 'default' : 'ghost'} size="sm" onClick={() => setView('admin')}>
              <Shield className="w-4 h-4 mr-1.5" /> Admin
            </Button>
          )}
          <div className="ml-2 flex items-center gap-2 pl-2 border-l border-border/60">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
              {user.is_admin ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : (user.name?.[0]?.toUpperCase() || 'U')}
            </div>
            <Button variant="ghost" size="sm" onClick={onLogout}><LogOut className="w-3.5 h-3.5" /></Button>
          </div>
        </nav>
      </div>
    </header>
  )
}

// ============= HOME =============
function Home({ tests, onOpenTest, onReload }) {
  const [templates, setTemplates] = useState([])
  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(d => setTemplates(d.templates || []))
  }, [])

  const useTemplate = async (t) => {
    toast.info(`Generating "${t.title}"...`)
    try {
      const r = await fetch('/api/generate-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: t.prompt }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(`Generated: ${d.test.title}`)
      onReload()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <main className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <GraduationCap className="w-4 h-4" /> Quick-start Templates
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {templates.map(t => (
            <button key={t.id} onClick={() => useTemplate(t)}
              className="text-left p-4 rounded-xl border border-border/60 bg-card/40 hover:bg-card/80 hover:border-primary/50 transition-all group">
              <div className="text-2xl mb-1">{t.icon}</div>
              <div className="font-semibold text-sm group-hover:text-primary transition">{t.title}</div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.desc}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(t.tags || []).slice(0, 3).map(tg => <Badge key={tg} variant="secondary" className="text-[9px] py-0 px-1.5">{tg}</Badge>)}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <ChatPanel onTestGenerated={onReload} onOpenTest={onOpenTest} />
        <TestsPanel tests={tests} onOpenTest={onOpenTest} onReload={onReload} />
      </div>
    </main>
  )
}

function ChatPanel({ onTestGenerated, onOpenTest }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey! I'm your AI coding mentor. Tell me what you want to practice, like:\n\n- *\"Generate 2 Java OOP problems with inheritance\"*\n- *\"Make a test on Python arrays and hashmaps\"*\n- *\"Exception handling in Java, 3 questions\"*\n\nOr ask me any coding concept and I'll explain it." },
  ])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [generating, setGenerating] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streaming, generating])

  const sendChat = async () => {
    if (!input.trim() || streaming) return
    const txt = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: txt }, { role: 'assistant', content: '' }])
    setStreaming(true)
    try {
      const r = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: getSessionId(), message: txt }),
      })
      if (!r.ok || !r.body) throw new Error('Stream failed')
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      let firstChunk = true
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        let piece = decoder.decode(value, { stream: true })
        if (firstChunk && piece.startsWith('__SID__:')) {
          const nl = piece.indexOf('\n')
          piece = piece.slice(nl + 1)
          firstChunk = false
        }
        acc += piece
        setMessages(m => {
          const copy = [...m]
          copy[copy.length - 1] = { role: 'assistant', content: acc }
          return copy
        })
      }
    } catch (e) { toast.error('Chat failed: ' + e.message) }
    setStreaming(false)
  }

  const generateTest = async () => {
    const p = input.trim()
    if (!p) { toast.error('Describe the test you want first'); return }
    setGenerating(true)
    toast.info('Generating test... ~15-30s')
    try {
      const r = await fetch('/api/generate-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      toast.success(`Generated "${d.test.title}"`)
      setMessages(m => [...m, { role: 'assistant', content: `\u2728 Generated **${d.test.title}** \u2014 ${d.test.questions.length} question(s).`, test: d.test }])
      onTestGenerated?.()
    } catch (e) { toast.error('Generation failed: ' + e.message) }
    setGenerating(false)
  }

  return (
    <Card className="flex flex-col h-[calc(100vh-22rem)] min-h-[500px] border-border/60 shadow-xl bg-card/40 backdrop-blur">
      <CardHeader className="pb-3 border-b border-border/60">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-purple-400" /> AI Chat
          <span className="ml-auto text-xs font-normal text-muted-foreground">Streaming • GPT-5.1</span>
        </CardTitle>
      </CardHeader>
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/70 border border-border/60'}`}>
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-code:text-xs">
                  <ReactMarkdown>{m.content || (i === messages.length - 1 && streaming ? '\u2026' : '')}</ReactMarkdown>
                </div>
                {m.test && (
                  <Button size="sm" className="mt-2 bg-gradient-to-r from-indigo-500 to-purple-500" onClick={() => onOpenTest(m.test)}>
                    <Code2 className="w-3.5 h-3.5 mr-1.5" /> Start Solving
                  </Button>
                )}
              </div>
            </div>
          ))}
          {generating && (
            <div className="flex justify-start">
              <div className="bg-muted/70 border border-border/60 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Crafting your test...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border/60 space-y-2">
        <Textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
          placeholder="Describe a test or ask a coding question..."
          className="min-h-[60px] resize-none bg-background/60" disabled={streaming || generating} />
        <div className="flex gap-2">
          <Button onClick={sendChat} variant="outline" disabled={streaming || generating || !input.trim()} size="sm">
            <Send className="w-3.5 h-3.5 mr-1.5" /> Chat
          </Button>
          <Button onClick={generateTest} disabled={generating || streaming || !input.trim()} size="sm"
            className="flex-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
            Generate Test from this
          </Button>
        </div>
      </div>
    </Card>
  )
}

function TestsPanel({ tests, onOpenTest, onReload }) {
  const deleteTest = async (id, e) => {
    e.stopPropagation()
    await fetch(`/api/tests/${id}`, { method: 'DELETE' })
    onReload(); toast.success('Test deleted')
  }
  const share = (id, e) => {
    e.stopPropagation()
    const url = `${window.location.origin}/share/${id}`
    navigator.clipboard.writeText(url)
    toast.success('Share link copied!')
  }
  return (
    <Card className="flex flex-col h-[calc(100vh-22rem)] min-h-[500px] border-border/60 shadow-xl bg-card/40 backdrop-blur">
      <CardHeader className="pb-3 border-b border-border/60">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCode2 className="w-4 h-4 text-indigo-400" /> Your Tests
          <span className="ml-auto text-xs font-normal text-muted-foreground">{tests.length} saved</span>
        </CardTitle>
      </CardHeader>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {tests.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No tests yet.</p>
              <p className="text-xs mt-1">Pick a template above or chat with AI!</p>
            </div>
          )}
          {tests.map(t => (
            <button key={t.id} onClick={() => onOpenTest(t)}
              className="w-full text-left group p-4 rounded-xl border border-border/60 bg-background/40 hover:bg-background/80 hover:border-primary/50 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate group-hover:text-primary transition">{t.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.description}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={(e) => share(t.id, e)} title="Copy share link"
                    className="opacity-40 hover:opacity-100 p-1"><Share2 className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => deleteTest(t.id, e)} title="Delete"
                    className="opacity-40 hover:opacity-100 hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                <Badge variant="outline" className="text-[10px] py-0 px-1.5">{t.questions?.length || 0} Qs</Badge>
                <Badge className={`text-[10px] py-0 px-1.5 ${t.difficulty === 'easy' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : t.difficulty === 'hard' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`} variant="outline">{t.difficulty}</Badge>
                {(t.tags || []).slice(0, 4).map(tg => <Badge key={tg} variant="secondary" className="text-[10px] py-0 px-1.5">{tg}</Badge>)}
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </Card>
  )
}

// ============= SOLVE =============
function Solve({ test, qIndex, setQIndex, onBack, user }) {
  const q = test.questions[qIndex]
  const [lang, setLang] = useState(test.language_hint || 'python')
  const starter = q?.starter_code?.[lang] || DEFAULT_STARTER[lang]
  const storageKey = `code_${test.id}_${q.id}_${lang}`
  const [code, setCode] = useState('')
  const [stdin, setStdin] = useState('')
  const [output, setOutput] = useState(null)
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submission, setSubmission] = useState(null)
  const [hint, setHint] = useState('')
  const [hintLoading, setHintLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [diffWith, setDiffWith] = useState(null)
  const [mode, setMode] = useState('practice')
  const [examEndTs, setExamEndTs] = useState(null)
  const [, setTick] = useState(0)
  const [leaderboard, setLeaderboard] = useState([])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
    setCode(saved || starter || '')
    setOutput(null); setSubmission(null); setHint('')
    fetch(`/api/attempts/${q.id}`).then(r => r.json()).then(d => setHistory(d.attempts || []))
    fetch(`/api/leaderboard/${test.id}`).then(r => r.json()).then(d => setLeaderboard(d.leaderboard || []))
  }, [qIndex, lang, test.id, q.id, storageKey, starter])

  useEffect(() => { if (code) localStorage.setItem(storageKey, code) }, [code, storageKey])

  useEffect(() => {
    if (mode !== 'exam' || !examEndTs) return
    const t = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [mode, examEndTs])

  const timeLeft = examEndTs ? Math.max(0, Math.floor((examEndTs - Date.now()) / 1000)) : 0
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const ss = String(timeLeft % 60).padStart(2, '0')

  const startExam = () => { setMode('exam'); setExamEndTs(Date.now() + 20 * 60 * 1000); toast.info('Exam mode: 20 minutes!') }

  const runCode = async () => {
    setRunning(true); setOutput(null); setSubmission(null)
    try {
      const r = await fetch('/api/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: lang, stdin }),
      })
      setOutput(await r.json())
    } catch (e) { toast.error('Run failed: ' + e.message) }
    setRunning(false)
  }

  const submit = async () => {
    setSubmitting(true); setSubmission(null); setOutput(null)
    toast.info('Running tests + AI review...')
    try {
      const r = await fetch('/api/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: test.id, question_id: q.id, code, language: lang }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed')
      setSubmission(d.attempt)
      if (d.attempt.passed === d.attempt.total) toast.success(`\ud83c\udf89 All ${d.attempt.total} test cases passed!`)
      else toast.warning(`${d.attempt.passed}/${d.attempt.total} passed`)
      fetch(`/api/attempts/${q.id}`).then(r => r.json()).then(d => setHistory(d.attempts || []))
      fetch(`/api/leaderboard/${test.id}`).then(r => r.json()).then(d => setLeaderboard(d.leaderboard || []))
    } catch (e) { toast.error(e.message) }
    setSubmitting(false)
  }

  const getHint = async () => {
    setHintLoading(true)
    try {
      const r = await fetch('/api/hint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: test.id, question_id: q.id, code, language: lang }),
      })
      const d = await r.json()
      setHint(d.hint || '')
    } catch (e) { toast.error(e.message) }
    setHintLoading(false)
  }

  return (
    <main className="container mx-auto px-4 py-4 max-w-[1600px]">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{test.title}</div>
          <div className="text-xs text-muted-foreground">Question {qIndex + 1} of {test.questions.length}</div>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'exam' && examEndTs && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border ${timeLeft < 60 ? 'bg-red-500/20 border-red-500/50 animate-pulse' : 'bg-muted border-border'}`}>
              <Timer className="w-3.5 h-3.5" /> <span className="font-mono text-sm">{mm}:{ss}</span>
            </div>
          )}
          {mode === 'practice' && <Button size="sm" variant="outline" onClick={startExam}><Timer className="w-3.5 h-3.5 mr-1" /> Exam Mode</Button>}
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {test.questions.map((qq, i) => (
          <button key={qq.id} onClick={() => setQIndex(i)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${i === qIndex ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border hover:bg-muted'}`}>
            Q{i + 1}. {qq.title.slice(0, 30)}{qq.title.length > 30 ? '...' : ''}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 h-[calc(100vh-13rem)]">
        {/* Problem */}
        <Card className="flex flex-col border-border/60 bg-card/40">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{q.title}</CardTitle>
              <Badge className={`${q.difficulty === 'easy' ? 'bg-emerald-500/20 text-emerald-300' : q.difficulty === 'hard' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`} variant="outline">{q.difficulty}</Badge>
              {(q.tags || []).map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              <div className="ml-auto">
                <Button size="sm" variant="outline" onClick={getHint} disabled={hintLoading}>
                  {hintLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5 mr-1 text-amber-400" />} Hint
                </Button>
              </div>
            </div>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="prose prose-sm prose-invert max-w-none">
              {hint && (
                <div className="not-prose mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <div className="flex items-center gap-1.5 text-amber-300 font-medium text-xs mb-1"><Lightbulb className="w-3.5 h-3.5" /> AI Hint</div>
                  <div>{hint}</div>
                </div>
              )}
              <ReactMarkdown>{q.statement}</ReactMarkdown>
              {q.constraints && <><h4>Constraints</h4><ReactMarkdown>{q.constraints}</ReactMarkdown></>}
              {q.examples?.length > 0 && <>
                <h4>Examples</h4>
                {q.examples.map((ex, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-3 bg-background/40 my-2">
                    <div className="text-xs font-semibold text-muted-foreground">Input</div>
                    <pre className="text-xs mt-1">{ex.input}</pre>
                    <div className="text-xs font-semibold text-muted-foreground mt-2">Output</div>
                    <pre className="text-xs mt-1">{ex.output}</pre>
                    {ex.explanation && <><div className="text-xs font-semibold text-muted-foreground mt-2">Explanation</div><div className="text-xs mt-1">{ex.explanation}</div></>}
                  </div>
                ))}
              </>}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* Editor + Output */}
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col flex-1 border-border/60 bg-card/40 overflow-hidden">
            <div className="flex items-center gap-2 p-2 border-b border-border/60">
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={runCode} disabled={running || submitting}>
                {running ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />} Run
              </Button>
              <Button size="sm" onClick={submit} disabled={running || submitting} className="bg-gradient-to-r from-emerald-500 to-green-500">
                {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Submit
              </Button>
            </div>
            <div className="flex-1">
              <Monaco height="100%" language={lang === 'cpp' ? 'cpp' : lang} theme="vs-dark"
                value={code} onChange={v => setCode(v || '')}
                options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }} />
            </div>
          </Card>

          <Tabs defaultValue="output" className="h-56">
            <TabsList className="h-8">
              <TabsTrigger value="output" className="text-xs">Output</TabsTrigger>
              <TabsTrigger value="custom" className="text-xs">Custom Input</TabsTrigger>
              <TabsTrigger value="results" className="text-xs">Results {submission && `(${submission.passed}/${submission.total})`}</TabsTrigger>
              <TabsTrigger value="feedback" className="text-xs">Feedback</TabsTrigger>
              <TabsTrigger value="history" className="text-xs">History ({history.length})</TabsTrigger>
              <TabsTrigger value="leaderboard" className="text-xs">Leaderboard</TabsTrigger>
            </TabsList>

            <TabsContent value="output" className="mt-2">
              <Card className="h-44 border-border/60 bg-black/60">
                <ScrollArea className="h-full">
                  <CardContent className="p-3 font-mono text-xs">
                    {!output && <div className="text-muted-foreground">Click Run to execute. Submit to grade against all test cases.</div>}
                    {output && <>
                      {output.stdout && <pre className="text-emerald-400 whitespace-pre-wrap">{output.stdout}</pre>}
                      {output.stderr && <pre className="text-rose-400 whitespace-pre-wrap">{output.stderr}</pre>}
                      {output.compile_output && <pre className="text-amber-400 whitespace-pre-wrap">{output.compile_output}</pre>}
                      <div className="text-muted-foreground mt-2 text-[10px]">status: {output.status} • time: {output.time}s</div>
                    </>}
                  </CardContent>
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="custom" className="mt-2">
              <Textarea value={stdin} onChange={e => setStdin(e.target.value)} placeholder="Custom stdin..." className="h-44 font-mono text-xs bg-black/40" />
            </TabsContent>

            <TabsContent value="results" className="mt-2">
              <Card className="h-44 border-border/60 bg-black/60">
                <ScrollArea className="h-full">
                  <CardContent className="p-3 text-xs space-y-1.5">
                    {!submission && <div className="text-muted-foreground">Submit to run against all hidden test cases.</div>}
                    {submission?.results?.map((r, i) => (
                      <div key={i} className={`flex items-center gap-2 p-2 rounded border ${r.passed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
                        {r.passed ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <X className="w-4 h-4 text-rose-400 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">Test {i + 1} {r.hidden && <span className="text-muted-foreground">(hidden)</span>} — {r.status}</div>
                          {!r.passed && !r.hidden && (
                            <div className="text-[11px] text-muted-foreground mt-1 font-mono grid grid-cols-2 gap-2">
                              <div><div className="opacity-60">Expected:</div><pre className="whitespace-pre-wrap">{r.expected}</pre></div>
                              <div><div className="opacity-60">Got:</div><pre className="whitespace-pre-wrap">{r.got || r.stderr}</pre></div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="feedback" className="mt-2">
              <Card className="h-44 border-border/60 bg-card/40">
                <ScrollArea className="h-full">
                  <CardContent className="p-3">
                    {!submission && <div className="text-muted-foreground text-xs">AI reviews your code after Submit.</div>}
                    {submission && <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{submission.feedback}</ReactMarkdown></div>}
                  </CardContent>
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-2">
              <Card className="h-44 border-border/60 bg-card/40">
                <ScrollArea className="h-full">
                  <CardContent className="p-3 space-y-2">
                    {history.length === 0 && <div className="text-muted-foreground text-xs">No submissions yet.</div>}
                    {history.map((a, i) => (
                      <div key={a.id} className="flex items-center gap-2 p-2 rounded border border-border/60 text-xs">
                        {a.passed === a.total ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />}
                        <div className="flex-1">
                          <div className="font-mono">{a.passed}/{a.total} • {a.language}</div>
                          <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                        </div>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setDiffWith(a)}>Diff vs current</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setCode(a.code)}>Restore</Button>
                      </div>
                    ))}
                  </CardContent>
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-2">
              <Card className="h-44 border-border/60 bg-card/40">
                <ScrollArea className="h-full">
                  <CardContent className="p-3 space-y-1.5">
                    {leaderboard.length === 0 && <div className="text-muted-foreground text-xs">No submissions yet on this test.</div>}
                    {leaderboard.map((row, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded border border-border/60 text-xs">
                        <span className={`w-5 text-center font-bold ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'}`}>#{i + 1}</span>
                        <span className="flex-1 truncate">{row.user}</span>
                        <Badge variant="outline" className="text-[10px] py-0">{row.language}</Badge>
                        <span className="font-mono">{row.score}%</span>
                      </div>
                    ))}
                  </CardContent>
                </ScrollArea>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {diffWith && (
        <Dialog open onOpenChange={() => setDiffWith(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>Diff: past attempt vs current</DialogTitle></DialogHeader>
            <DiffView before={diffWith.code} after={code} />
          </DialogContent>
        </Dialog>
      )}
    </main>
  )
}

function DiffView({ before, after }) {
  const parts = diffLines(before || '', after || '')
  return (
    <ScrollArea className="h-[60vh] rounded border border-border/60 bg-black/60">
      <pre className="text-xs font-mono p-3">
        {parts.map((p, i) => (
          <span key={i} className={p.added ? 'bg-emerald-900/40 text-emerald-300' : p.removed ? 'bg-rose-900/40 text-rose-300' : 'text-muted-foreground'}>
            {p.added ? '+ ' : p.removed ? '- ' : '  '}{p.value}
          </span>
        ))}
      </pre>
    </ScrollArea>
  )
}

// ============= DASHBOARD =============
function Dashboard({ onBack }) {
  const [stats, setStats] = useState(null)
  useEffect(() => { fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {}) }, [])
  return (
    <main className="container mx-auto px-4 py-6 max-w-5xl">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
      <h1 className="text-2xl font-bold mt-4 mb-6">Your Progress</h1>
      {!stats && <Loader2 className="w-5 h-5 animate-spin" />}
      {stats && <>
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <StatCard icon={<Trophy className="w-5 h-5 text-amber-400" />} label="Total Attempts" value={stats.total} />
          <StatCard icon={<Target className="w-5 h-5 text-emerald-400" />} label="Solved" value={stats.solved} />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-indigo-400" />} label="Avg Accuracy" value={`${stats.accuracy}%`} />
        </div>
        {stats.weak?.length > 0 && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base">Topics to Improve</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stats.weak.map(w => (
                <div key={w.tag} className="flex items-center gap-3">
                  <Badge variant="secondary">{w.tag}</Badge>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-rose-500 to-amber-500" style={{ width: `${w.rate}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground w-20 text-right">{w.passed}/{w.attempts} ({w.rate}%)</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Attempts</CardTitle></CardHeader>
          <CardContent>
            {stats.attempts.length === 0 && <div className="text-muted-foreground text-sm">No attempts yet.</div>}
            <div className="space-y-2">
              {stats.attempts.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-2 rounded border border-border/60">
                  {a.passed === a.total ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-rose-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{a.question_title}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.test_title}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{a.language}</Badge>
                  <span className="text-xs font-mono">{a.passed}/{a.total}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </>}
    </main>
  )
}

function StatCard({ icon, label, value }) {
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

// ============= ADMIN PANEL =============
function AdminPanel({ onBack }) {
  const [data, setData] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [adsense, setAdsense] = useState({ client: '', slot: '' })

  const load = async () => {
    const r = await fetch('/api/admin/ads')
    const d = await r.json()
    setData(d)
    if (d.adsense) setAdsense(d.adsense)
  }
  useEffect(() => { load() }, [])

  const toggle = async (ad) => {
    await fetch(`/api/admin/ads/${ad.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !ad.active }) })
    load()
  }
  const remove = async (ad) => {
    await fetch(`/api/admin/ads/${ad.id}`, { method: 'DELETE' })
    toast.success('Ad deleted'); load()
  }
  const saveAdsense = async () => {
    await fetch('/api/admin/adsense', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adsense) })
    toast.success('AdSense config saved')
  }

  return (
    <main className="container mx-auto px-4 py-6 max-w-5xl">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
      <div className="flex items-center justify-between mt-4 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Crown className="w-6 h-6 text-amber-400" /> Admin — Monetization</h1>
        <Button onClick={() => setShowAdd(true)} className="bg-gradient-to-r from-indigo-500 to-purple-500"><Plus className="w-4 h-4 mr-1" /> New Ad</Button>
      </div>

      {data && (
        <>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <StatCard icon={<FileCode2 className="w-5 h-5 text-indigo-400" />} label="Total Ads" value={data.stats.total_ads} />
            <StatCard icon={<Eye className="w-5 h-5 text-emerald-400" />} label="Impressions" value={data.stats.impressions} />
            <StatCard icon={<MousePointerClick className="w-5 h-5 text-pink-400" />} label="Clicks" value={data.stats.clicks} />
          </div>

          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base">Google AdSense Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Label className="text-xs">Publisher ID (data-ad-client)</Label>
              <Input value={adsense.client} onChange={e => setAdsense(a => ({ ...a, client: e.target.value }))} placeholder="ca-pub-xxxxxxxxxxxxxxxx" />
              <Label className="text-xs">Ad Slot ID</Label>
              <Input value={adsense.slot} onChange={e => setAdsense(a => ({ ...a, slot: e.target.value }))} placeholder="1234567890" />
              <Button size="sm" onClick={saveAdsense}>Save AdSense</Button>
              <p className="text-[10px] text-muted-foreground">Get your IDs at <a href="https://www.google.com/adsense" target="_blank" rel="noreferrer" className="underline">Google AdSense</a>. Approval takes 1-2 weeks.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Custom Ads ({data.ads.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.ads.length === 0 && <div className="text-muted-foreground text-sm py-8 text-center">No ads yet. Click <strong>New Ad</strong> to add one.</div>}
              {data.ads.map(ad => (
                <div key={ad.id} className="flex gap-3 p-3 rounded border border-border/60 bg-card/40">
                  {ad.image_url && (
                    ad.type === 'video'
                      ? <video src={ad.image_url} className="w-32 h-20 object-cover rounded" />
                      : <img src={ad.image_url} alt="" className="w-32 h-20 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{ad.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{ad.target_url}</div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                      <span><Eye className="w-3 h-3 inline" /> {ad.impressions || 0}</span>
                      <span><MousePointerClick className="w-3 h-3 inline" /> {ad.clicks || 0}</span>
                      <span>CTR {ad.impressions ? ((ad.clicks || 0) / ad.impressions * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={ad.active} onCheckedChange={() => toggle(ad)} />
                    <Button size="sm" variant="ghost" onClick={() => remove(ad)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {showAdd && <AddAdDialog onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </main>
  )
}

function AddAdDialog({ onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', image_url: '', target_url: '', type: 'image', duration: 6 })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.title || !form.image_url || !form.target_url) { toast.error('All fields required'); return }
    setSaving(true)
    await fetch('/api/admin/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false); toast.success('Ad created'); onSaved()
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Ad</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Awesome Course" /></div>
          <div><Label className="text-xs">Image / Video URL</Label><Input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
          <div><Label className="text-xs">Target URL (where click takes user)</Label><Input value={form.target_url} onChange={e => setForm({ ...form, target_url: e.target.value })} placeholder="https://..." /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="image">Image</SelectItem><SelectItem value="video">Video</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Min view duration (s)</Label>
              <Input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: parseInt(e.target.value) || 6 })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
