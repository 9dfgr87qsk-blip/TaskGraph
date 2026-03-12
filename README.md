# TaskGraph

**Estimate whether engineering tasks can safely run in parallel without causing merge conflicts.**

You describe tasks in plain English. TaskGraph tells you which pairs will collide.

---

## What it does

Given a list of engineering tasks, TaskGraph outputs:

- **Conflict probability matrix** — likelihood each pair of tasks touches the same code
- **Recommended execution order** — so foundational work lands first
- **Dependency graph** — visual DAG showing where the risk lives

## How it works

Two analysis modes:

| Mode | Requires API key | Accuracy |
|------|:-:|:-:|
| **LLM-powered** (Claude) | Yes | High — reasons about architecture, shared modules, file overlap |
| **Keyword heuristic** | No | Decent — pattern-matches against common domains (auth, db, api, ui, infra) |

## Try it

### Hosted

Visit the deployed URL and enter your tasks. No account needed.

### Local development

```bash
git clone https://github.com/YOUR_USERNAME/taskgraph.git
cd taskgraph
npm install
cp .env.example .env  # optional: add your Anthropic API key
npx vercel dev
```

Open `http://localhost:3000` in your browser.

### API usage

```bash
curl -X POST http://localhost:3000/api/taskgraph \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      "Refactor authentication module",
      "Add strict TypeScript types",
      "Split monolith into services"
    ]
  }'
```

With an API key for LLM analysis:

```bash
curl -X POST http://localhost:3000/api/taskgraph \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      "Refactor authentication module",
      "Add strict TypeScript types"
    ],
    "apiKey": "sk-ant-..."
  }'
```

### Response shape

```json
{
  "conflicts": [
    {
      "taskA": "Refactor authentication module",
      "taskB": "Add strict TypeScript types",
      "probability": 0.45,
      "reason": "Both tasks touch middleware, config, and shared type definitions",
      "sharedAreas": ["types", "auth"]
    }
  ],
  "executionOrder": ["Refactor authentication module", "Add strict TypeScript types"],
  "summary": "Moderate parallelization risk. Auth refactor and TypeScript migration share type definitions and middleware layers."
}
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/taskgraph)

1. Push this repo to GitHub
2. Import it on [vercel.com/new](https://vercel.com/new)
3. Optionally set `ANTHROPIC_API_KEY` in Vercel → Settings → Environment Variables
4. Done — the UI serves from `/` and the API from `/api/taskgraph`

## Project structure

```
taskgraph/
  api/
    taskgraph.ts    # Vercel serverless function (LLM + heuristic analysis)
  public/
    index.html      # Self-contained UI (no build step, no framework)
  vercel.json       # Routing and security headers
  package.json      # Minimal deps (@vercel/node only)
```

## Contributing

PRs welcome. Some ideas:

- [ ] Git history analysis for calibration
- [ ] Linear/Jira integration to auto-analyze sprint backlogs
- [ ] Team-specific conflict profiles
- [ ] More granular heuristics (file path patterns, import graphs)

## License

MIT
