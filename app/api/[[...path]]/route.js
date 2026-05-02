import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { signToken, getUserFromRequest, COOKIE_NAME, TEMPLATES } from '@/lib/auth'

// ---------------- Mongo ----------------
const MONGO_URL = process.env.MONGO_URL

if (!MONGO_URL) {
  throw new Error("MONGO_URL is not defined")
}
const DB_NAME = process.env.DB_NAME && process.env.DB_NAME !== 'your_database_name' ? process.env.DB_NAME : 'coding_arena'

let _client = null
let _connecting = null

async function getDb() {
  // Reuse cached client if it's healthy
  if (_client) {
    try {
      await _client.db(DB_NAME).command({ ping: 1 })
      return _client.db(DB_NAME)
    } catch (e) {
      // Connection died (sleep / network drop) — reset and reconnect
      try { await _client.close() } catch {}
      _client = null
      _connecting = null
    }
  }
  // Avoid simultaneous reconnects from parallel requests
  if (!_connecting) {
    _connecting = new MongoClient(MONGO_URL, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      retryWrites: true,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
    }).connect()
  }
  try {
    _client = await _connecting
    return _client.db(DB_NAME)
  } catch (e) {
    _connecting = null
    throw e
  }
}

// ---------------- LLM ----------------
// ---------------- LLM (provider-agnostic, OpenAI-compatible) ----------------
// Works with Emergent proxy, OpenAI, Google Gemini, Anthropic, Groq, etc.
// Set LLM_BASE_URL + LLM_API_KEY + LLM_MODEL in env to switch providers.
const LLM_BASE = (process.env.LLM_BASE_URL || 'https://integrations.emergentagent.com/llm/v1').replace(/\/$/, '')
const EMERGENT_LLM_URL = `${LLM_BASE}/chat/completions`
const LLM_KEY = process.env.LLM_API_KEY || process.env.EMERGENT_LLM_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY
const DEFAULT_MODEL = process.env.LLM_MODEL || 'gpt-5.1'

async function llmRaw(messages, { jsonMode = false, model = DEFAULT_MODEL, tools = null } = {}) {
  const body = { model, messages }
  if (jsonMode) body.response_format = { type: 'json_object' }
  if (tools) body.tools = tools
  const r = await fetch(EMERGENT_LLM_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) { const t = await r.text(); throw new Error(`LLM ${r.status}: ${t}`) }
  return await r.json()
}

async function llmChat(messages, opts = {}) {
  const data = await llmRaw(messages, opts)
  return data.choices?.[0]?.message?.content || ''
}

async function llmText(messages, opts = {}) {
  return await llmChat(messages, opts)
}

async function llmStream(messages, { model = DEFAULT_MODEL } = {}) {
  return await fetch(EMERGENT_LLM_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  })
}

// ---------------- Judge0 ----------------
const JUDGE0_URL = 'https://ce.judge0.com'
const LANG_MAP = { python: 71, javascript: 63, java: 62, cpp: 54, c: 50 }

async function runCode({ source_code, language, stdin = '' }) {
  const language_id = LANG_MAP[language]
  if (!language_id) throw new Error(`Unsupported language: ${language}`)
  const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_code, language_id, stdin }),
  })
  if (!res.ok) throw new Error(`Judge0 ${res.status}`)
  return await res.json()
}

// ---------------- Prompts ----------------
const CHAT_SYSTEM = `You are CodeMentor AI, an assistant inside "AI Coding Practice Arena".
Help users generate custom coding practice tests, explain concepts, and answer doubts.
Keep responses tight (under 150 words) unless asked for code.
When the user clearly wants a test generated, suggest they click the "Generate Test" button.`

function testGenPrompt(userPrompt) {
  return `You are a senior coding interviewer. Generate a coding practice test based on the user's request below.

USER REQUEST: """${userPrompt}"""

Return STRICT JSON only with this exact schema (no markdown):
{
  "title": "short catchy test title (<=60 chars)",
  "description": "2-3 sentence summary",
  "difficulty": "easy|medium|hard",
  "tags": ["tag1","tag2"],
  "language_hint": "java|python|cpp|javascript",
  "questions": [
    {
      "title": "Problem title",
      "statement": "Markdown-friendly problem statement with clear I/O format.",
      "constraints": "Constraints as a markdown list",
      "examples": [ { "input": "stdin", "output": "stdout", "explanation": "why" } ],
      "test_cases": [
        { "input": "stdin", "expected_output": "expected stdout", "hidden": false },
        { "input": "stdin", "expected_output": "expected stdout", "hidden": true }
      ],
      "starter_code": { "java": "...", "python": "...", "cpp": "...", "javascript": "..." },
      "tags": ["topic"],
      "difficulty": "easy|medium|hard"
    }
  ]
}

RULES:
- 1 to 3 questions (default 2).
- All problems read stdin & print stdout for auto-grading.
- 4-6 test cases per question (>=2 hidden). Expected output deterministic, exact stdout match.
- Starter code MUST compile as-is; include scaffolding (Java: public class Main { public static void main... }).
- No markdown fences in any string. Properly escape JSON.`
}

function feedbackPrompt({ question, code, language, results, stderr }) {
  return `You are an expert code reviewer.
Problem: ${question.title}
Language: ${language}
Results: ${results.passed}/${results.total} test cases passed.
${results.failed_sample ? `First failing test:\nInput: ${results.failed_sample.input}\nExpected: ${results.failed_sample.expected}\nGot: ${results.failed_sample.got}\n` : ''}
${stderr ? `Error:\n${stderr}\n` : ''}

Student's code:
\`\`\`${language}
${code}
\`\`\`

Return markdown with sections:
**What went wrong** (skip if all passed)
**Why** (root cause)
**How to fix** (concise, no full rewrite)
If all tests passed, praise & suggest ONE optimization or edge case.
Keep total under 180 words.`
}

function hintPrompt({ question, code, language }) {
  return `Give the student a SMALL hint about the problem below — do NOT give the full solution. Just one nudge in the right direction (1-2 sentences).

Problem: ${question.title}
${question.statement}

Student's current code (${language}):
\`\`\`
${code || '(empty)'}
\`\`\`

Return 1-2 sentences max. Don't write code.`
}

// ---------------- Helpers ----------------
function ok(data, status = 200) { return NextResponse.json(data, { status }) }
function err(message, status = 400) { return NextResponse.json({ error: message }, { status }) }
function normalize(s) {
  if (s === null || s === undefined) return ''
  return String(s).replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\s+$/g, '')
}
async function requireUser(request) {
  console.log("🔍 requireUser called")
  const u = getUserFromRequest(request)
  if (!u) {console.log("❌ No user from token") return null}
  const db = await getDb()
  const fresh = await db.collection('users').findOne({ id: u.id })
  return fresh
}
function setAuthCookie(res, token) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
function publicUser(u) {
  if (!u) return null
  return { id: u.id, email: u.email, name: u.name, is_admin: !!u.is_admin, is_approved: u.is_approved !== false, last_ads_shown_at: u.last_ads_shown_at || 0, avatar: u.avatar || '', created_at: u.created_at }
}
function needsAds(user) {
  if (!user) return false
  const last = user.last_ads_shown_at || 0
  return (Date.now() - last) >= 24 * 60 * 60 * 1000
}

// ---------------- Admin Agent (function calling) ----------------
const ADMIN_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_users',
      description: 'List users on the platform. Optionally filter or search.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by email or name' },
          only_pending: { type: 'boolean', description: 'Only show users awaiting approval' },
          only_admins: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_user',
      description: 'Approve a pending user so they can use the platform.',
      parameters: { type: 'object', properties: { email_or_id: { type: 'string' } }, required: ['email_or_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'disapprove_user',
      description: 'Block a user from accessing the platform (revoke approval).',
      parameters: { type: 'object', properties: { email_or_id: { type: 'string' } }, required: ['email_or_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_user',
      description: "Permanently delete a user account and all their data (tests, attempts, chats).",
      parameters: { type: 'object', properties: { email_or_id: { type: 'string' } }, required: ['email_or_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'promote_to_admin',
      description: 'Grant a user admin privileges.',
      parameters: { type: 'object', properties: { email_or_id: { type: 'string' } }, required: ['email_or_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'demote_from_admin',
      description: 'Revoke admin privileges from a user.',
      parameters: { type: 'object', properties: { email_or_id: { type: 'string' } }, required: ['email_or_id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_ads',
      description: 'List all ads with stats.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ad',
      description: 'Create a new ad. Requires title, image_url, target_url.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          image_url: { type: 'string' },
          target_url: { type: 'string' },
          type: { type: 'string', enum: ['image', 'video'] },
          duration: { type: 'number' },
        },
        required: ['title', 'image_url', 'target_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_ad',
      description: 'Activate or deactivate an ad by id or title.',
      parameters: {
        type: 'object',
        properties: { id_or_title: { type: 'string' }, active: { type: 'boolean' } },
        required: ['id_or_title', 'active'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_ad',
      description: 'Delete an ad by id or title.',
      parameters: { type: 'object', properties: { id_or_title: { type: 'string' } }, required: ['id_or_title'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_require_approval',
      description: 'Toggle whether new signups must be approved by an admin before using the platform.',
      parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_platform_stats',
      description: 'Return overall platform statistics: users, tests, attempts, ads, revenue indicators.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tests',
      description: 'List tests, optionally filtered by author email or topic.',
      parameters: { type: 'object', properties: { author: { type: 'string' }, query: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_test',
      description: 'Delete a test by id.',
      parameters: { type: 'object', properties: { test_id: { type: 'string' } }, required: ['test_id'] },
    },
  },
]

const AGENT_SYSTEM = `You are the Admin Co-Pilot for "AI Coding Practice Arena".
You help the human admin manage users (approve, delete, promote), ads, and platform settings via tool calls.
Be concise. When asked to do something, USE THE TOOLS. Don't make up results.
Before destructive bulk actions (delete multiple), list the items first and confirm.
After actions, summarize what changed in 1-2 sentences. Use markdown lists when listing.
If a tool returns many items, summarize the most relevant ones.`

async function findUser(db, ref) {
  if (!ref) return null
  const byId = await db.collection('users').findOne({ id: ref })
  if (byId) return byId
  return await db.collection('users').findOne({ email: ref.toLowerCase() })
}
async function findAd(db, ref) {
  if (!ref) return null
  const byId = await db.collection('ads').findOne({ id: ref })
  if (byId) return byId
  return await db.collection('ads').findOne({ title: { $regex: new RegExp(ref, 'i') } })
}

async function executeAgentTool(name, args, db, currentUser) {
  switch (name) {
    case 'list_users': {
      const q = {}
      if (args.only_pending) q.is_approved = false
      if (args.only_admins) q.is_admin = true
      let users = await db.collection('users').find(q).limit(200).toArray()
      if (args.query) {
        const s = args.query.toLowerCase()
        users = users.filter(u => u.email.toLowerCase().includes(s) || (u.name || '').toLowerCase().includes(s))
      }
      return users.slice(0, 50).map(u => ({
        id: u.id, email: u.email, name: u.name,
        is_admin: !!u.is_admin, is_approved: u.is_approved !== false,
        created_at: u.created_at,
      }))
    }
    case 'approve_user': {
      const u = await findUser(db, args.email_or_id)
      if (!u) return { error: 'User not found' }
      await db.collection('users').updateOne({ id: u.id }, { $set: { is_approved: true } })
      return { ok: true, user: { id: u.id, email: u.email, name: u.name, is_approved: true } }
    }
    case 'disapprove_user': {
      const u = await findUser(db, args.email_or_id)
      if (!u) return { error: 'User not found' }
      if (u.id === currentUser.id) return { error: "You can't disapprove yourself" }
      await db.collection('users').updateOne({ id: u.id }, { $set: { is_approved: false } })
      return { ok: true, user: { id: u.id, email: u.email, is_approved: false } }
    }
    case 'delete_user': {
      const u = await findUser(db, args.email_or_id)
      if (!u) return { error: 'User not found' }
      if (u.id === currentUser.id) return { error: "You can't delete yourself" }
      await db.collection('users').deleteOne({ id: u.id })
      const t = await db.collection('tests').deleteMany({ user_id: u.id })
      const a = await db.collection('attempts').deleteMany({ user_id: u.id })
      await db.collection('chat_messages').deleteMany({ user_id: u.id })
      return { ok: true, deleted_user: u.email, removed_tests: t.deletedCount, removed_attempts: a.deletedCount }
    }
    case 'promote_to_admin': {
      const u = await findUser(db, args.email_or_id)
      if (!u) return { error: 'User not found' }
      await db.collection('users').updateOne({ id: u.id }, { $set: { is_admin: true } })
      return { ok: true, email: u.email, is_admin: true }
    }
    case 'demote_from_admin': {
      const u = await findUser(db, args.email_or_id)
      if (!u) return { error: 'User not found' }
      if (u.id === currentUser.id) return { error: "You can't demote yourself" }
      await db.collection('users').updateOne({ id: u.id }, { $set: { is_admin: false } })
      return { ok: true, email: u.email, is_admin: false }
    }
    case 'list_ads': {
      const ads = await db.collection('ads').find({}, { projection: { _id: 0 } }).toArray()
      return ads
    }
    case 'create_ad': {
      const id = uuidv4()
      const ad = {
        id,
        title: args.title || 'Untitled Ad',
        image_url: args.image_url || '',
        target_url: args.target_url || '#',
        type: args.type || 'image',
        duration: args.duration || 6,
        active: true,
        impressions: 0, clicks: 0,
        created_at: new Date().toISOString(),
      }
      await db.collection('ads').insertOne(ad)
      const { _id, ...clean } = ad
      return { ok: true, ad: clean }
    }
    case 'toggle_ad': {
      const ad = await findAd(db, args.id_or_title)
      if (!ad) return { error: 'Ad not found' }
      await db.collection('ads').updateOne({ id: ad.id }, { $set: { active: !!args.active } })
      return { ok: true, id: ad.id, title: ad.title, active: !!args.active }
    }
    case 'delete_ad': {
      const ad = await findAd(db, args.id_or_title)
      if (!ad) return { error: 'Ad not found' }
      await db.collection('ads').deleteOne({ id: ad.id })
      return { ok: true, deleted: ad.title }
    }
    case 'set_require_approval': {
      await db.collection('config').updateOne(
        { id: 'platform' },
        { $set: { id: 'platform', require_approval: !!args.enabled } },
        { upsert: true }
      )
      return { ok: true, require_approval: !!args.enabled }
    }
    case 'get_platform_stats': {
      const totalUsers = await db.collection('users').countDocuments({})
      const pendingUsers = await db.collection('users').countDocuments({ is_approved: false })
      const totalAdmins = await db.collection('users').countDocuments({ is_admin: true })
      const totalTests = await db.collection('tests').countDocuments({})
      const totalAttempts = await db.collection('attempts').countDocuments({})
      const ads = await db.collection('ads').find({}).toArray()
      const adImpr = ads.reduce((s, a) => s + (a.impressions || 0), 0)
      const adClicks = ads.reduce((s, a) => s + (a.clicks || 0), 0)
      return { totalUsers, pendingUsers, totalAdmins, totalTests, totalAttempts, totalAds: ads.length, adImpressions: adImpr, adClicks, adCTR: adImpr ? +(adClicks / adImpr * 100).toFixed(2) : 0 }
    }
    case 'list_tests': {
      const all = await db.collection('tests').find({}, { projection: { _id: 0 } }).limit(100).toArray()
      let filtered = all
      if (args.author) {
        const u = await findUser(db, args.author)
        if (u) filtered = filtered.filter(t => t.user_id === u.id)
      }
      if (args.query) {
        const s = args.query.toLowerCase()
        filtered = filtered.filter(t => t.title?.toLowerCase().includes(s) || (t.tags || []).some(x => x.toLowerCase().includes(s)))
      }
      return filtered.slice(0, 30).map(t => ({ id: t.id, title: t.title, difficulty: t.difficulty, tags: t.tags, questions: t.questions?.length || 0, user_id: t.user_id }))
    }
    case 'delete_test': {
      const r = await db.collection('tests').deleteOne({ id: args.test_id })
      return { ok: r.deletedCount > 0 }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

async function runAdminAgent(userMessage, history, db, currentUser) {
  const messages = [
    { role: 'system', content: AGENT_SYSTEM },
    ...(history || []).filter(m => m.role && (m.content || m.tool_calls)).slice(-20),
    { role: 'user', content: userMessage },
  ]
  const actions = []
  for (let i = 0; i < 6; i++) {
    const data = await llmRaw(messages, { tools: ADMIN_TOOLS })
    const msg = data.choices?.[0]?.message
    if (!msg) break
    messages.push(msg)
    if (!msg.tool_calls || !msg.tool_calls.length) {
      return { reply: msg.content || '', actions, history: messages.slice(1) } // strip system
    }
    for (const tc of msg.tool_calls) {
      let args = {}
      try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}
      let result
      try {
        result = await executeAgentTool(tc.function.name, args, db, currentUser)
        actions.push({ name: tc.function.name, args, result })
      } catch (e) {
        result = { error: e.message }
        actions.push({ name: tc.function.name, args, error: e.message })
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) })
    }
  }
  return { reply: 'Reached tool-call iteration limit.', actions, history: messages.slice(1) }
}

// ---------------- Routes ----------------
export async function GET(request, { params }) {
  const path = (params?.path || []).join('/')
  try {
    const db = await getDb()
    if (path === '' || path === 'health') return ok({ status: 'ok', service: 'coding-arena' })

    if (path === 'auth/me') {
      console.log("🔥 /api/auth/me called")
      const u = await requireUser(request)
      if (!u) return ok({ user: null })
      return ok({ user: publicUser(u), needs_ads: needsAds(u) })
    }

    if (path === 'admin/users') {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const all = await db.collection('users').find({}, { projection: { _id: 0, password_hash: 0 } }).sort({ created_at: -1 }).toArray()
      // augment with counts
      const ids = all.map(x => x.id)
      const tests = await db.collection('tests').aggregate([
        { $match: { user_id: { $in: ids } } },
        { $group: { _id: '$user_id', count: { $sum: 1 } } },
      ]).toArray()
      const attempts = await db.collection('attempts').aggregate([
        { $match: { user_id: { $in: ids } } },
        { $group: { _id: '$user_id', count: { $sum: 1 }, solved: { $sum: { $cond: [{ $and: [{ $gt: ['$total', 0] }, { $eq: ['$passed', '$total'] }] }, 1, 0] } } } },
      ]).toArray()
      const tMap = Object.fromEntries(tests.map(x => [x._id, x.count]))
      const aMap = Object.fromEntries(attempts.map(x => [x._id, x]))
      const users = all.map(x => ({
        ...publicUser(x),
        tests_count: tMap[x.id] || 0,
        attempts_count: aMap[x.id]?.count || 0,
        solved_count: aMap[x.id]?.solved || 0,
      }))
      return ok({ users })
    }

    if (path === 'admin/config') {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const cfg = await db.collection('config').findOne({ id: 'platform' }) || {}
      return ok({ require_approval: !!cfg.require_approval })
    }

    if (path === 'auth/profile') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const tests = await db.collection('tests').countDocuments({ user_id: u.id })
      const attempts = await db.collection('attempts').countDocuments({ user_id: u.id })
      const solved = await db.collection('attempts').aggregate([
        { $match: { user_id: u.id } },
        { $group: { _id: '$question_id', best: { $max: { $cond: [{ $and: [{ $gt: ['$total', 0] }, { $eq: ['$passed', '$total'] }] }, 1, 0] } } } },
        { $match: { best: 1 } },
        { $count: 'n' },
      ]).toArray()
      return ok({ user: publicUser(u), stats: { tests, attempts, solved: solved[0]?.n || 0 } })
    }

    if (path === 'templates') return ok({ templates: TEMPLATES })

    if (path === 'tests') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const tests = await db.collection('tests').find({ user_id: u.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray()
      return ok({ tests })
    }

    if (path.startsWith('tests/')) {
      const id = path.split('/')[1]
      const t = await db.collection('tests').findOne({ id }, { projection: { _id: 0 } })
      if (!t) return err('Test not found', 404)
      return ok({ test: t })
    }

    if (path === 'stats') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const attempts = await db.collection('attempts').find({ user_id: u.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(200).toArray()
      const total = attempts.length
      const solved = attempts.filter(a => a.passed === a.total && a.total > 0).length
      const accuracy = total ? Math.round((attempts.reduce((s,a)=>s+(a.passed/(a.total||1)),0)/total)*100) : 0
      const tagStats = {}
      for (const a of attempts) for (const t of (a.tags || [])) {
        tagStats[t] = tagStats[t] || { tag: t, attempts: 0, passed: 0 }
        tagStats[t].attempts += 1
        if (a.passed === a.total && a.total > 0) tagStats[t].passed += 1
      }
      const weak = Object.values(tagStats).map(t => ({ ...t, rate: t.attempts ? Math.round((t.passed/t.attempts)*100) : 0 })).sort((a,b)=>a.rate-b.rate).slice(0,5)
      return ok({ total, solved, accuracy, attempts: attempts.slice(0, 30), weak })
    }

    if (path.startsWith('chats/')) {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const session_id = path.split('/')[1]
      const msgs = await db.collection('chat_messages').find({ session_id, user_id: u.id }, { projection: { _id: 0 } }).sort({ ts: 1 }).toArray()
      return ok({ messages: msgs })
    }

    // attempts history per question
    if (path.startsWith('attempts/')) {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const question_id = path.split('/')[1]
      const list = await db.collection('attempts').find({ user_id: u.id, question_id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(20).toArray()
      return ok({ attempts: list })
    }

    // public share — read-only
    if (path.startsWith('share/')) {
      const id = path.split('/')[1]
      const t = await db.collection('tests').findOne({ id }, { projection: { _id: 0, user_id: 0 } })
      if (!t) return err('Test not found', 404)
      // strip hidden test cases on shared link
      const sanitized = {
        ...t,
        questions: (t.questions || []).map(q => ({
          ...q,
          test_cases: (q.test_cases || []).filter(tc => !tc.hidden),
        })),
      }
      return ok({ test: sanitized })
    }

    if (path === 'global-leaderboard') {
      // Public — top users across all tests
      const attempts = await db.collection('attempts').find({}).toArray()
      const byUser = {}
      for (const a of attempts) {
        const uid = a.user_id || 'anon'
        if (!byUser[uid]) byUser[uid] = { user_id: uid, attempts: 0, solved_set: new Set(), score_sum: 0, langs: new Set(), tests_set: new Set(), best_per_q: {} }
        const u = byUser[uid]
        u.attempts += 1
        if (a.language) u.langs.add(a.language)
        u.tests_set.add(a.test_id)
        const score = a.total ? (a.passed / a.total) : 0
        const prev = u.best_per_q[a.question_id] || 0
        if (score > prev) {
          u.score_sum += (score - prev)
          u.best_per_q[a.question_id] = score
        }
        if (a.passed === a.total && a.total > 0) u.solved_set.add(a.question_id)
      }
      const userIds = Object.keys(byUser).filter(x => x !== 'anon')
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray()
      const userMap = Object.fromEntries(users.map(u => [u.id, u]))
      const board = Object.values(byUser).map(u => {
        const usr = userMap[u.user_id]
        const totalQs = Object.keys(u.best_per_q).length
        return {
          user: usr?.name || usr?.email?.split('@')[0] || 'anonymous',
          is_admin: !!usr?.is_admin,
          solved: u.solved_set.size,
          attempts: u.attempts,
          tests_taken: u.tests_set.size,
          avg_score: totalQs ? Math.round((u.score_sum / totalQs) * 100) : 0,
          languages: Array.from(u.langs),
          joined: usr?.created_at,
        }
      }).sort((a, b) => b.solved - a.solved || b.avg_score - a.avg_score).slice(0, 100)
      const totalUsers = await db.collection('users').countDocuments({})
      const totalAttempts = attempts.length
      const totalTests = await db.collection('tests').countDocuments({})
      return ok({ leaderboard: board, stats: { totalUsers, totalAttempts, totalTests } })
    }

    if (path.startsWith('leaderboard/')) {
      const id = path.split('/')[1]
      const attempts = await db.collection('attempts').find({ test_id: id }).sort({ created_at: -1 }).limit(500).toArray()
      const byUser = {}
      for (const a of attempts) {
        const key = a.user_id || 'anon'
        if (!byUser[key] || (a.passed/(a.total||1)) > (byUser[key].passed/(byUser[key].total||1))) byUser[key] = a
      }
      const userIds = Object.keys(byUser)
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray()
      const userMap = Object.fromEntries(users.map(u => [u.id, u]))
      const board = Object.values(byUser).map(a => ({
        user: userMap[a.user_id]?.name || userMap[a.user_id]?.email?.split('@')[0] || 'anonymous',
        passed: a.passed, total: a.total,
        score: a.total ? Math.round((a.passed/a.total)*100) : 0,
        language: a.language,
        when: a.created_at,
      })).sort((a,b)=>b.score-a.score).slice(0, 25)
      return ok({ leaderboard: board })
    }

    if (path === 'ads/today') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      if (!needsAds(u)) return ok({ ads: [], needs: false })
      const all = await db.collection('ads').find({ active: true }, { projection: { _id: 0 } }).toArray()
      let pool = [...all]
      const ads = []
      for (let i = 0; i < 3; i++) {
        if (!pool.length) pool = [...all]
        if (!pool.length) break
        const idx = Math.floor(Math.random() * pool.length)
        ads.push(pool.splice(idx, 1)[0])
      }
      // also fetch adsense config (optional)
      const cfg = await db.collection('config').findOne({ id: 'adsense' })
      return ok({ ads, needs: true, adsense: cfg ? { client: cfg.client, slot: cfg.slot } : null })
    }

    if (path === 'admin/ads') {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const ads = await db.collection('ads').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray()
      const cfg = await db.collection('config').findOne({ id: 'adsense' }) || {}
      const stats = {
        total_ads: ads.length,
        impressions: ads.reduce((s,a)=>s+(a.impressions||0),0),
        clicks: ads.reduce((s,a)=>s+(a.clicks||0),0),
      }
      return ok({ ads, adsense: { client: cfg.client || '', slot: cfg.slot || '' }, stats })
    }

    return err('Not found', 404)
  } catch (e) {
    console.error('GET error', e)
    return err(e.message, 500)
  }
}

export async function POST(request, { params }) {
  const path = (params?.path || []).join('/')
  try {
    const body = await request.json().catch(() => ({}))
    const db = await getDb()

    // ---- AUTH ----
    if (path === 'auth/signup') {
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      const name = (body.name || '').trim() || email.split('@')[0]
      if (!email || !password || password.length < 6) return err('Email and password (>=6) required')
      const exists = await db.collection('users').findOne({ email })
      if (exists) return err('Email already registered', 409)
      const totalUsers = await db.collection('users').countDocuments({})
      const cfg = await db.collection('config').findOne({ id: 'platform' }) || {}
      const requireApproval = !!cfg.require_approval
      const id = uuidv4()
      const user = {
        id, email, name,
        password_hash: bcrypt.hashSync(password, 10),
        is_admin: totalUsers === 0,
        is_approved: totalUsers === 0 || !requireApproval,
        last_ads_shown_at: 0,
        avatar: '',
        created_at: new Date().toISOString(),
      }
      await db.collection('users').insertOne(user)
      const token = signToken({ id, email })
      const res = ok({ user: publicUser(user), needs_ads: needsAds(user) })
      return setAuthCookie(res, token)
    }

    if (path === 'auth/profile') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const update = {}
      if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
      if (typeof body.avatar === 'string') update.avatar = body.avatar
      if (body.new_password) {
        if ((body.new_password || '').length < 6) return err('Password must be >=6 chars')
        if (!body.current_password || !bcrypt.compareSync(body.current_password, u.password_hash)) {
          return err('Current password incorrect', 401)
        }
        update.password_hash = bcrypt.hashSync(body.new_password, 10)
      }
      if (Object.keys(update).length === 0) return err('Nothing to update')
      await db.collection('users').updateOne({ id: u.id }, { $set: update })
      const fresh = await db.collection('users').findOne({ id: u.id })
      return ok({ user: publicUser(fresh) })
    }

    // Admin user management
    if (path.startsWith('admin/users/') && path.endsWith('/approve')) {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = path.split('/')[2]
      await db.collection('users').updateOne({ id }, { $set: { is_approved: true } })
      return ok({ ok: true })
    }
    if (path.startsWith('admin/users/') && path.endsWith('/disapprove')) {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = path.split('/')[2]
      if (id === u.id) return err("Can't disapprove yourself")
      await db.collection('users').updateOne({ id }, { $set: { is_approved: false } })
      return ok({ ok: true })
    }
    if (path.startsWith('admin/users/') && path.endsWith('/promote')) {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = path.split('/')[2]
      await db.collection('users').updateOne({ id }, { $set: { is_admin: true } })
      return ok({ ok: true })
    }
    if (path.startsWith('admin/users/') && path.endsWith('/demote')) {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = path.split('/')[2]
      if (id === u.id) return err("Can't demote yourself")
      await db.collection('users').updateOne({ id }, { $set: { is_admin: false } })
      return ok({ ok: true })
    }
    if (path === 'admin/config') {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      await db.collection('config').updateOne(
        { id: 'platform' },
        { $set: { id: 'platform', require_approval: !!body.require_approval } },
        { upsert: true }
      )
      return ok({ ok: true })
    }
    if (path === 'admin/agent') {
      return err('AI Agent has been disabled to reduce LLM costs.', 410)
    }

    if (path === 'auth/login') {
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      const user = await db.collection('users').findOne({ email })
      if (!user || !bcrypt.compareSync(password, user.password_hash)) return err('Invalid credentials', 401)
      const token = signToken({ id: user.id, email })
      const res = ok({ user: publicUser(user), needs_ads: needsAds(user) })
      return setAuthCookie(res, token)
    }

    if (path === 'auth/logout') {
      const res = ok({ ok: true })
      res.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
      return res
    }

    // ---- ADS ----
    if (path === 'ads/seen') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      await db.collection('users').updateOne({ id: u.id }, { $set: { last_ads_shown_at: Date.now() } })
      return ok({ ok: true })
    }
    if (path === 'ads/impression') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const { ad_id } = body
      if (ad_id) await db.collection('ads').updateOne({ id: ad_id }, { $inc: { impressions: 1 } })
      return ok({ ok: true })
    }
    if (path === 'ads/click') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const { ad_id } = body
      if (ad_id) await db.collection('ads').updateOne({ id: ad_id }, { $inc: { clicks: 1 } })
      return ok({ ok: true })
    }

    if (path === 'admin/ads') {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = uuidv4()
      const ad = {
        id,
        title: body.title || 'Untitled Ad',
        image_url: body.image_url || '',
        target_url: body.target_url || '#',
        type: body.type || 'image',
        duration: body.duration || 6,
        active: body.active !== false,
        impressions: 0, clicks: 0,
        created_at: new Date().toISOString(),
      }
      await db.collection('ads').insertOne(ad)
      const { _id, ...clean } = ad
      return ok({ ad: clean })
    }

    if (path === 'admin/adsense') {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      await db.collection('config').updateOne(
        { id: 'adsense' },
        { $set: { id: 'adsense', client: body.client || '', slot: body.slot || '' } },
        { upsert: true }
      )
      return ok({ ok: true })
    }

    // ---- CHAT ----
    if (path === 'chat') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const session_id = body.session_id || uuidv4()
      const text = (body.message || '').trim()
      if (!text) return err('Message required')
      const history = await db.collection('chat_messages').find({ session_id, user_id: u.id }).sort({ ts: 1 }).limit(20).toArray()
      const messages = [
        { role: 'system', content: CHAT_SYSTEM },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ]
      const reply = await llmChat(messages)
      const now = Date.now()
      await db.collection('chat_messages').insertMany([
        { session_id, user_id: u.id, role: 'user', content: text, ts: now },
        { session_id, user_id: u.id, role: 'assistant', content: reply, ts: now + 1 },
      ])
      return ok({ session_id, reply })
    }

    if (path === 'chat/stream') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const session_id = body.session_id || uuidv4()
      const text = (body.message || '').trim()
      if (!text) return err('Message required')
      const history = await db.collection('chat_messages').find({ session_id, user_id: u.id }).sort({ ts: 1 }).limit(20).toArray()
      const messages = [
        { role: 'system', content: CHAT_SYSTEM },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ]
      const now = Date.now()
      await db.collection('chat_messages').insertOne({ session_id, user_id: u.id, role: 'user', content: text, ts: now })
      const upstream = await llmStream(messages)
      if (!upstream.ok) {
        const t = await upstream.text()
        return err(`LLM ${upstream.status}: ${t}`, 500)
      }
      let full = ''
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`__SID__:${session_id}\n`))
          const reader = upstream.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() || ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed.startsWith('data:')) continue
              const data = trimmed.slice(5).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const piece = parsed.choices?.[0]?.delta?.content
                if (piece) {
                  full += piece
                  controller.enqueue(encoder.encode(piece))
                }
              } catch {}
            }
          }
          try {
            await db.collection('chat_messages').insertOne({ session_id, user_id: u.id, role: 'assistant', content: full, ts: Date.now() })
          } catch {}
          controller.close()
        },
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Accel-Buffering': 'no' } })
    }

    // ---- TEST GENERATION ----
    if (path === 'generate-test') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const prompt = (body.prompt || '').trim()
      if (!prompt) return err('Prompt required')
      const raw = await llmChat(
        [
          { role: 'system', content: 'You output only strict JSON. No markdown. No commentary.' },
          { role: 'user', content: testGenPrompt(prompt) },
        ],
        { jsonMode: true }
      )
      let parsed
      try { parsed = JSON.parse(raw) }
      catch {
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) parsed = JSON.parse(m[0])
        else return err('AI returned invalid JSON', 500)
      }
      const id = uuidv4()
      const test = {
        id,
        user_id: u.id,
        prompt,
        title: parsed.title || 'Untitled Test',
        description: parsed.description || '',
        difficulty: parsed.difficulty || 'medium',
        tags: parsed.tags || [],
        language_hint: parsed.language_hint || 'python',
        questions: (parsed.questions || []).map((q, i) => ({
          id: uuidv4(),
          order: i,
          title: q.title || `Question ${i + 1}`,
          statement: q.statement || '',
          constraints: q.constraints || '',
          examples: q.examples || [],
          test_cases: q.test_cases || [],
          starter_code: q.starter_code || {},
          tags: q.tags || [],
          difficulty: q.difficulty || 'medium',
        })),
        created_at: new Date().toISOString(),
      }
      await db.collection('tests').insertOne({ ...test })
      return ok({ test })
    }

    // ---- EXECUTE / SUBMIT ----
    if (path === 'execute') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const { code, language, stdin } = body
      if (!code || !language) return err('code & language required')
      const r = await runCode({ source_code: code, language, stdin: stdin || '' })
      return ok({
        stdout: r.stdout || '', stderr: r.stderr || '', compile_output: r.compile_output || '',
        time: r.time, memory: r.memory, status: r.status?.description || 'Unknown',
      })
    }

    if (path === 'submit') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const { test_id, question_id, code, language } = body
      if (!test_id || !question_id || !code || !language) return err('Missing fields')
      const test = await db.collection('tests').findOne({ id: test_id })
      if (!test) return err('Test not found', 404)
      const question = test.questions.find(q => q.id === question_id)
      if (!question) return err('Question not found', 404)

      const cases = question.test_cases || []
      const caseResults = []
      let passed = 0
      let firstFail = null
      let firstStderr = ''
      for (const tc of cases) {
        const r = await runCode({ source_code: code, language, stdin: tc.input || '' })
        const got = normalize(r.stdout)
        const expected = normalize(tc.expected_output)
        const okCase = got === expected && !r.stderr && !r.compile_output
        const item = {
          hidden: !!tc.hidden,
          input: tc.hidden ? '(hidden)' : tc.input,
          expected: tc.hidden ? '(hidden)' : expected,
          got: r.stderr || r.compile_output ? '' : got,
          stderr: r.stderr || r.compile_output || '',
          time: r.time,
          passed: okCase,
          status: r.status?.description,
        }
        caseResults.push(item)
        if (okCase) passed += 1
        else if (!firstFail) { firstFail = { input: tc.input, expected, got: item.got }; firstStderr = item.stderr }
      }
      const total = cases.length
      let feedback = ''
      try {
        feedback = await llmChat([
          { role: 'system', content: 'You are a concise, kind code review mentor.' },
          { role: 'user', content: feedbackPrompt({ question, code, language, results: { passed, total, failed_sample: firstFail }, stderr: firstStderr }) },
        ])
      } catch { feedback = 'Feedback unavailable.' }

      const attempt = {
        id: uuidv4(),
        user_id: u.id,
        test_id, question_id,
        question_title: question.title,
        test_title: test.title,
        language, code,
        passed, total,
        tags: [...(question.tags || []), ...(test.tags || [])],
        feedback,
        results: caseResults,
        created_at: new Date().toISOString(),
      }
      await db.collection('attempts').insertOne(attempt)
      const { _id, ...clean } = attempt
      return ok({ attempt: clean })
    }

    // ---- HINT ----
    if (path === 'hint') {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const { test_id, question_id, code, language } = body
      const test = await db.collection('tests').findOne({ id: test_id })
      const question = test?.questions.find(q => q.id === question_id)
      if (!question) return err('Question not found', 404)
      const hint = await llmChat([
        { role: 'system', content: 'You give tiny hints, never solutions.' },
        { role: 'user', content: hintPrompt({ question, code, language }) },
      ])
      return ok({ hint })
    }

    return err('Not found', 404)
  } catch (e) {
    console.error('POST error', e)
    return err(e.message || 'Server error', 500)
  }
}

export async function PUT(request, { params }) {
  const path = (params?.path || []).join('/')
  try {
    const db = await getDb()
    const body = await request.json().catch(() => ({}))
    if (path.startsWith('admin/ads/')) {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = path.split('/')[2]
      const update = {}
      for (const k of ['title','image_url','target_url','type','duration','active']) {
        if (body[k] !== undefined) update[k] = body[k]
      }
      await db.collection('ads').updateOne({ id }, { $set: update })
      return ok({ ok: true })
    }
    return err('Not found', 404)
  } catch (e) { return err(e.message, 500) }
}

export async function DELETE(request, { params }) {
  const path = (params?.path || []).join('/')
  try {
    const db = await getDb()
    if (path.startsWith('admin/users/')) {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = path.split('/')[2]
      if (id === u.id) return err("Can't delete yourself")
      await db.collection('users').deleteOne({ id })
      await db.collection('tests').deleteMany({ user_id: id })
      await db.collection('attempts').deleteMany({ user_id: id })
      await db.collection('chat_messages').deleteMany({ user_id: id })
      return ok({ deleted: true })
    }
    if (path.startsWith('tests/')) {
      const u = await requireUser(request); if (!u) return err('Auth required', 401)
      const id = path.split('/')[1]
      await db.collection('tests').deleteOne({ id, user_id: u.id })
      return ok({ deleted: true })
    }
    if (path.startsWith('admin/ads/')) {
      const u = await requireUser(request); if (!u || !u.is_admin) return err('Admin only', 403)
      const id = path.split('/')[2]
      await db.collection('ads').deleteOne({ id })
      return ok({ deleted: true })
    }
    return err('Not found', 404)
  } catch (e) { return err(e.message, 500) }
}
