import type { VercelRequest, VercelResponse } from "@vercel/node";

interface TaskInput {
  tasks: string[];
  apiKey?: string;
}

interface ConflictPair {
  taskA: string;
  taskB: string;
  probability: number;
  reason: string;
  sharedAreas: string[];
}

interface AnalysisResult {
  conflicts: ConflictPair[];
  executionOrder: string[];
  summary: string;
}

const SYSTEM_PROMPT = `You are a senior software architect analyzing engineering tasks for parallelization risk.

Given a list of engineering tasks, estimate the probability that each pair of tasks would cause merge conflicts or architectural interference if worked on simultaneously.

Consider:
- Likely files and directories each task would modify
- Shared modules, utilities, and configuration files
- Architectural layers (API, database, auth, UI, etc.)
- Implicit dependencies between tasks
- Common patterns in real codebases

Respond ONLY with valid JSON matching this exact schema:
{
  "conflicts": [
    {
      "taskA": "task description",
      "taskB": "task description",
      "probability": 0.0 to 1.0,
      "reason": "brief explanation",
      "sharedAreas": ["area1", "area2"]
    }
  ],
  "executionOrder": ["task that should go first", "task second", ...],
  "summary": "one paragraph overview of parallelization risk"
}

Order executionOrder so that the most foundational / high-conflict tasks come first, reducing merge risk for later tasks.`;

async function analyzeWithLLM(
  tasks: string[],
  apiKey: string,
): Promise<AnalysisResult> {
  const userPrompt = `Analyze these engineering tasks for parallelization risk:\n\n${tasks.map((t, i) => `${i + 1}. "${t}"`).join("\n")}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text =
    data.content?.[0]?.type === "text" ? data.content[0].text : "";

  // Extract JSON from response (handle markdown code fences)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [
    null,
    text,
  ];
  return JSON.parse(jsonMatch[1]!.trim()) as AnalysisResult;
}

function fallbackAnalysis(tasks: string[]): AnalysisResult {
  // Keyword-based heuristic when no API key is provided
  const keywords: Record<string, string[]> = {
    auth: ["auth", "login", "session", "token", "oauth", "permission", "role"],
    database: ["database", "db", "schema", "migration", "model", "orm", "sql", "query"],
    api: ["api", "endpoint", "route", "rest", "graphql", "controller"],
    ui: ["ui", "component", "page", "layout", "style", "css", "frontend", "form"],
    infra: ["deploy", "ci", "docker", "kubernetes", "config", "env", "infrastructure"],
    types: ["type", "typescript", "interface", "schema", "validation", "zod"],
    refactor: ["refactor", "split", "extract", "reorganize", "modular", "monolith", "service"],
    test: ["test", "spec", "coverage", "e2e", "unit"],
  };

  function getAreas(task: string): string[] {
    const lower = task.toLowerCase();
    return Object.entries(keywords)
      .filter(([, words]) => words.some((w) => lower.includes(w)))
      .map(([area]) => area);
  }

  const conflicts: ConflictPair[] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const areasA = getAreas(tasks[i]);
      const areasB = getAreas(tasks[j]);
      const shared = areasA.filter((a) => areasB.includes(a));
      const probability = Math.min(
        0.95,
        shared.length * 0.2 + (areasA.length === 0 || areasB.length === 0 ? 0.15 : 0),
      );
      conflicts.push({
        taskA: tasks[i],
        taskB: tasks[j],
        probability: Math.round(probability * 100) / 100,
        reason:
          shared.length > 0
            ? `Both tasks touch: ${shared.join(", ")}`
            : "Low apparent overlap based on task descriptions",
        sharedAreas: shared,
      });
    }
  }

  // Sort tasks: highest total conflict first
  const scores = new Map<string, number>();
  tasks.forEach((t) => scores.set(t, 0));
  conflicts.forEach((c) => {
    scores.set(c.taskA, (scores.get(c.taskA) || 0) + c.probability);
    scores.set(c.taskB, (scores.get(c.taskB) || 0) + c.probability);
  });
  const executionOrder = [...tasks].sort(
    (a, b) => (scores.get(b) || 0) - (scores.get(a) || 0),
  );

  return {
    conflicts,
    executionOrder,
    summary: `Heuristic analysis of ${tasks.length} tasks found ${conflicts.filter((c) => c.probability > 0.3).length} high-risk pairs. For more accurate results, provide an Anthropic API key.`,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // CORS
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { tasks, apiKey } = req.body as TaskInput;

    if (!tasks || !Array.isArray(tasks) || tasks.length < 2) {
      return res
        .status(400)
        .json({ error: "Provide at least 2 tasks as an array of strings." });
    }
    if (tasks.length > 10) {
      return res
        .status(400)
        .json({ error: "Maximum 10 tasks per analysis." });
    }

    const key = apiKey || process.env.ANTHROPIC_API_KEY;

    let result: AnalysisResult;
    if (key) {
      result = await analyzeWithLLM(tasks, key);
    } else {
      result = fallbackAnalysis(tasks);
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("TaskGraph error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  }
}
