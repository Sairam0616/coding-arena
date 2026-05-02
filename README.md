# AI Coding Practice Arena

A full-stack web application that combines ChatGPT-style AI interaction with HackerRank-style coding tests. Users generate custom coding problems via natural language, solve them in an in-browser Monaco editor, and get real test execution + AI feedback.

## ✨ Features

- 🤖 **AI Chat** — Streaming chat with GPT-5.1 to discuss concepts and generate tests
- 🧪 **Test Generator** — Natural-language → structured coding tests with hidden test cases
- 💻 **Monaco Editor** — Python / Java / JavaScript / C++ with syntax highlighting & autosave
- ⚡ **Real Code Execution** — Runs against test cases via Judge0 CE
- 🧠 **AI Feedback** — Reviews failed submissions, explains errors, suggests fixes
- 💡 **Hints** — Get small AI hints without the full solution
- ⏱️ **Practice / Exam Modes** — Optional 20-min timer
- 📊 **Progress Dashboard** — Accuracy, weak topics, recent attempts
- 🏆 **Leaderboards** — Per-test + global public leaderboard
- 🔗 **Public Share Links** — Share any test (hidden cases auto-stripped)
- 🔐 **Auth & Roles** — JWT cookies; first user is admin
- 👥 **User Management** — Admin can approve / block / promote / delete users
- 📢 **Ads System** — Admin uploads ads (image/video URL); 3-per-24h cap; impression + click tracking
- 🎯 **Google AdSense Slot** — Configurable Publisher ID + Ad Slot ID

## 🛠 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** MongoDB
- **Styling:** Tailwind CSS + shadcn/ui
- **Editor:** Monaco (`@monaco-editor/react`)
- **Auth:** JWT in httpOnly cookie + bcryptjs
- **AI:** OpenAI-compatible LLM proxy (configurable)
- **Code Execution:** Judge0 CE public instance
- **Icons:** lucide-react

## 🚀 Local Setup

### Prerequisites
- Node.js 18+, Yarn, MongoDB running on `mongodb://localhost:27017`

### Install & run
```bash
yarn install
cp .env.example .env   # then fill in values
yarn dev               # http://localhost:3000
```

### `.env` variables
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=coding_arena
NEXT_PUBLIC_BASE_URL=http://localhost:3000
EMERGENT_LLM_KEY=<your-llm-key>      # Or use any OpenAI-compatible key
JWT_SECRET=<random-32-byte-hex>
CORS_ORIGINS=*
```

Generate a JWT secret with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📁 Project Structure

```
app/
├── app/
│   ├── api/[[...path]]/route.js   # ALL backend endpoints
│   ├── page.js                    # Main app (auth, chat, solve, admin)
│   ├── layout.js
│   ├── globals.css
│   ├── leaderboard/page.js        # Public global leaderboard
│   └── share/[id]/page.js         # Public test share page
├── lib/
│   └── auth.js                    # JWT helpers + curated templates
├── components/ui/                 # shadcn components
├── package.json
└── tailwind.config.js
```

## 🎯 Core Flow

1. Sign up — first user becomes admin automatically.
2. Open **Generate** tab → click any template card OR chat to describe the test you want.
3. AI generates a structured test (questions, constraints, sample I/O, hidden cases, starter code).
4. Click the test → solve in Monaco → **Run** for stdout, **Submit** to grade against all test cases + get AI feedback.
5. Open **Progress** for personal stats; **Global** for the public leaderboard.

## 👑 Admin

The first user that signs up becomes admin. Admin Console tabs:

- **Users** — list, search, filter (Pending / Admins), one-click approve / block / promote / delete.
- **Ads** — CRUD ads (image/video URL + target URL). Live impressions, clicks, CTR.
- **Settings** — Require approval toggle + Google AdSense config.

## 📜 License

MIT — use freely.

## 🙏 Credits

Built with Next.js, shadcn/ui, Monaco Editor, Judge0 CE, and the Emergent LLM proxy.
