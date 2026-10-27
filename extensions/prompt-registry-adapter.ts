// Syncs ~/.pi/agent/prompts/*.md into ~/.pi/agent/agents/*.md, in the
// format that @mickyyy68/pi-subagents expects.
//
// Files are skipped if they lack a leading --- (no frontmatter) or a
// <!-- PI_ROLE: slug --> marker. The template file is no longer part of
// this project; the plan template lives inside _architect.md.
//
// Runs on session_start. The subagent extension reads agents/ at spawn
// time, so this just needs to finish before the first spawn.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROMPTS_DIR = join(homedir(), ".pi", "agent", "prompts");
const AGENTS_DIR = join(homedir(), ".pi", "agent", "agents");

type Frontmatter = {
  title?: string;
  description?: string;
  model?: string;
  tools?: string;
};

function parseFrontmatter(
  text: string,
): { fm: Frontmatter; body: string } | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const fmLines = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n");
  const fm: Frontmatter = {};
  for (const line of fmLines) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (key === "title") fm.title = value;
    else if (key === "description") fm.description = value;
    else if (key === "model") fm.model = value;
    else if (key === "tools") {
      // YAML tools may be written as `[a, b, c]` or `a, b, c`.
      // @mickyyy68 expects a comma-separated string. Normalize to that.
      fm.tools = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(",");
    }
  }
  return { fm, body };
}

function extractRole(text: string): string | null {
  const m = text.match(/<!--\s*PI_ROLE:\s*([a-z0-9-]+)\s*-->/i);
  return m ? m[1].toLowerCase() : null;
}

async function syncAgents(): Promise<void> {
  await mkdir(AGENTS_DIR, { recursive: true });
  const files = await readdir(PROMPTS_DIR);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    const path = join(PROMPTS_DIR, file);
    const text = await readFile(path, "utf8");
    const parsed = parseFrontmatter(text);
    if (!parsed) {
      console.warn(`prompt-registry-adapter: skip ${file} (no frontmatter)`);
      continue;
    }
    const role = extractRole(text);
    if (!role) {
      console.warn(`prompt-registry-adapter: skip ${file} (no PI_ROLE marker)`);
      continue;
    }

    const { fm, body } = parsed;
    const agentContent = [
      "---",
      `name: ${role}`,
      `description: ${fm.description ?? fm.title ?? role}`,
      `model: ${fm.model ?? "deepseek/deepseek-flash"}`,
      `tools: ${fm.tools ?? "read,grep,find,ls"}`,
      "---",
      "",
      body,
    ].join("\n");

    await writeFile(join(AGENTS_DIR, `${role}.md`), agentContent, "utf8");
  }
}

export default function promptRegistryAdapter(pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    try {
      await syncAgents();
    } catch (err) {
      console.error("prompt-registry-adapter: sync failed", err);
    }
  });
}
