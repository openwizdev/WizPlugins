import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parsePlanLinks } from "./derive.mjs";

const execFileAsync = promisify(execFile);
const RE_CLOSES = /(?:^|\n)\s*(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+(?:([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+))?#([1-9][0-9]*)\b/gi;
const RE_ENDPOINT = /^[A-Za-z0-9_./?&=:%+-]+$/;
const RE_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/;
const RE_ADDITIONAL = /\*\*Additional\b[^*\n]*? check: `([^`]+)`/g;
const branchMatches = (pat, br) => (pat.endsWith("*") ? br.startsWith(pat.slice(0, -1)) : pat === br);

export function parseFleetSettings(markdown, branch = "main") {
  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  let heading = "";
  const authorRows = [], checkRows = [], ciLines = [];
  for (const line of lines) {
    if (line.startsWith("## ")) { heading = line.trim(); continue; }
    if (heading === "## CI checks") ciLines.push(line);
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
    if (heading === "## GitHub identity" && cells.length === 2 && cells[0] === "Record authors") authorRows.push(cells[1]);
    if (heading === "## CI checks" && cells.length === 3 && /^`[^`]+`$/.test(cells[0])) checkRows.push(cells);
  }
  if (authorRows.length !== 1) return { ok: false, reason: "Record authors could not be read." };
  const parts = authorRows[0].split(",").map((s) => s.trim());
  const recordAuthors = parts.map((p) => (p.startsWith("`") && p.endsWith("`") ? p.slice(1, -1) : ""));
  if (recordAuthors.length === 0 || !recordAuthors.every((a) => RE_LOGIN.test(a))) return { ok: false, reason: "Record authors could not be read." };
  const requiredChecks = [];
  for (const [nameCell, , reqCell] of checkRows) {
    const branches = [...reqCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (branches.some((p) => branchMatches(p, branch))) requiredChecks.push(nameCell.slice(1, -1));
  }
  for (const m of ciLines.join("\n").matchAll(RE_ADDITIONAL)) if (!requiredChecks.includes(m[1])) requiredChecks.push(m[1]);
  return { ok: true, recordAuthors, requiredChecks };
}

function parseHttp(stdout) {
  const sep = stdout.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
  const idx = stdout.indexOf(sep);
  if (idx === -1) return null;
  const head = stdout.slice(0, idx);
  const code = Number(((head.split(/\r?\n/)[0] || "").match(/^HTTP\/[0-9.]+ ([0-9]{3})/) || [])[1]);
  const link = head.split(/\r?\n/).find((l) => /^link:/i.test(l)) || "";
  const next = (link.match(/<https:\/\/api\.github\.com\/([^>]+)>;\s*rel="next"/i) || [])[1] || null;
  return { code, next, body: stdout.slice(idx + sep.length) };
}

export function createBudgetedReader({ gh = "gh", limit = 50, timeoutMs = 30000 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("budget limit must be a positive integer");
  let used = 0;
  async function get(endpoint, { method = "GET", source = "issues", reason = "GitHub source could not be read." } = {}) {
    if (String(method).toUpperCase() !== "GET" || typeof endpoint !== "string" || !RE_ENDPOINT.test(endpoint) || endpoint.startsWith("-")) {
      throw new Error("GitHub reader is read-only");
    }
    if (used >= limit) return { ok: false, source: "budget", reason: "GitHub request budget reached." };
    used += 1;
    try {
      const { stdout } = await execFileAsync(gh, ["api", "-X", "GET", "--include", endpoint], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
      const parsed = parseHttp(stdout);
      if (!parsed || parsed.code < 200 || parsed.code >= 300) return { ok: false, source, reason };
      return { ok: true, data: JSON.parse(parsed.body), next: parsed.next };
    } catch { return { ok: false, source, reason }; }
  }
  async function pages(endpoint, opts) {
    const items = [];
    for (let url = endpoint; url;) {
      const res = await get(url, opts);
      if (!res.ok) return res;
      if (!Array.isArray(res.data)) return { ok: false, source: opts.source, reason: opts.reason };
      items.push(...res.data);
      url = res.next;
    }
    return { ok: true, data: items };
  }
  return { budget: () => ({ limit, used }), get, pages };
}

function closingTickets(prBody, prRepo, trackerRepo) {
  const nums = [];
  for (const m of String(prBody || "").matchAll(RE_CLOSES)) {
    if ((m[1] || prRepo).toLowerCase() === trackerRepo.toLowerCase()) nums.push(Number(m[2]));
  }
  return [...new Set(nums)];
}

function mapCheckRun(prRepo, prNumber, head, run) {
  const s = String(run.status || "").toLowerCase(), c = String(run.conclusion || "").toLowerCase();
  const result = s !== "completed" ? "pending" : c === "success" ? "pass" : c === "cancelled" ? "cancel" : (c === "skipped" || c === "neutral") ? "skipping" : "fail";
  return { kind: "check", repo: prRepo, number: prNumber, id: run.id, head, name: run.name, result, completed_at: run.completed_at || undefined, started_at: run.started_at || undefined };
}

async function fetchRepoSettings(reader, repo, defaultBranch, authors, checks) {
  let br = defaultBranch;
  if (!br) {
    const info = await reader.get(`repos/${repo}`, { source: "issues", reason: "Repository metadata could not be read." });
    if (!info.ok || typeof info.data?.default_branch !== "string") return { ok: false, source: info.ok ? "issues" : info.source, reason: info.ok ? "Repository metadata could not be read." : info.reason };
    br = info.data.default_branch;
  }
  if (authors && checks) return { ok: true, branch: br, authors, checks };
  const fm = await reader.get(`repos/${repo}/contents/docs/agents/fleet.md?ref=${br}`, { source: "issues", reason: "Fleet settings could not be read." });
  const text = fm.ok && typeof fm.data?.content === "string" ? Buffer.from(fm.data.content, "base64").toString("utf8") : null;
  const parsed = text ? parseFleetSettings(text, br) : { ok: false, reason: fm.ok ? "Fleet settings could not be read." : fm.reason };
  if (!parsed.ok) return { ok: false, source: fm.ok ? "issues" : fm.source, reason: parsed.reason };
  return { ok: true, branch: br, authors: authors || parsed.recordAuthors, checks: checks || parsed.requiredChecks };
}

export async function readGitHubState({ repo, prRepos = [], version = null, limit = 50, gh = "gh", recordAuthors = null, requiredChecks = null, defaultBranch = null, needsOwner = [] }) {
  const reader = createBudgetedReader({ gh, limit });
  const unavailable = [], defaultBranches = {}, reqChecks = {}, repoErrors = new Map();
  const empty = (authors = []) => ({ budget: reader.budget(), repo, default_branches: defaultBranches, record_authors: authors, required_checks: reqChecks, specs: [], tickets: [], comments: [], needs_owner: needsOwner, unavailable });
  const meta = await fetchRepoSettings(reader, repo, defaultBranch, recordAuthors, requiredChecks);
  if (!meta.ok) { unavailable.push({ kind: "snapshot", ref: "*", source: meta.source, reason: meta.reason }); return empty(); }
  defaultBranches[repo] = meta.branch;
  reqChecks[repo] = meta.checks;
  const authors = meta.authors;
  const authorSet = new Set(authors.map((a) => a.toLowerCase()));
  const specsRes = await reader.pages(`repos/${repo}/issues?state=all&labels=spec&per_page=100`, { source: "issues", reason: "Specs could not be read." });
  if (!specsRes.ok) { unavailable.push({ kind: "snapshot", ref: "*", source: specsRes.source, reason: specsRes.reason }); return empty(authors); }
  const specs = specsRes.data.filter((i) => !i.pull_request && (!version || i.milestone?.title === version));
  const allRepos = [...new Set([repo, ...prRepos])];
  const prsByTicket = new Map();
  let prError = null;
  for (const r of allRepos) {
    if (r !== repo) {
      const rm = await fetchRepoSettings(reader, r, null, authors, null);
      if (!rm.ok) { repoErrors.set(r, rm); continue; }
      defaultBranches[r] = rm.branch;
      reqChecks[r] = rm.checks;
    }
    const prRes = await reader.pages(`repos/${r}/pulls?state=all&per_page=100`, { source: "pull_requests", reason: "Pull requests could not be read." });
    if (!prRes.ok) { prError = prRes; break; }
    for (const p of prRes.data) {
      for (const tNum of closingTickets(p.body, r, repo)) {
        if (!prsByTicket.has(tNum)) prsByTicket.set(tNum, []);
        prsByTicket.get(tNum).push({ repo: r, number: p.number, state: p.merged_at ? "MERGED" : String(p.state || "").toUpperCase(), draft: Boolean(p.draft), head: p.head?.sha || "", branch: p.head?.ref || null, base: p.base?.ref || defaultBranches[r] || "main", merged_at: p.merged_at || null, closed_at: p.closed_at || null });
      }
    }
  }
  const comments = [], tickets = [], humanDoneCache = new Map();
  const hasVerifiedMerge = (num) => (prsByTicket.get(num) || []).some((p) => p.merged_at && p.base === (defaultBranches[p.repo] || "main"));
  for (const s of specs) {
    const sc = await reader.pages(`repos/${repo}/issues/${s.number}/comments?per_page=100`, { source: "comments", reason: "Spec comments could not be read." });
    if (sc.ok) for (const c of sc.data) comments.push({ kind: "comment", repo, number: s.number, id: c.id, author: c.user?.login || null, created_at: c.created_at, updated_at: c.updated_at || c.created_at, body: c.body || "" });
    else unavailable.push({ kind: "track", ref: String(s.number), source: sc.source, reason: sc.reason });
    const subs = await reader.pages(`repos/${repo}/issues/${s.number}/sub_issues?per_page=100`, { source: "issues", reason: "Spec tickets could not be read." });
    if (!subs.ok) { unavailable.push({ kind: "track", ref: String(s.number), source: subs.source, reason: subs.reason }); continue; }
    for (const sub of subs.data) {
      const labels = (sub.labels || []).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);
      const tPrs = prsByTicket.get(sub.number) || [];
      let err = prError ? { source: prError.source, reason: prError.reason } : null;
      if (!err) for (const p of tPrs) if (repoErrors.has(p.repo)) { err = repoErrors.get(p.repo); break; }
      const bRes = !err ? await reader.pages(`repos/${repo}/issues/${sub.number}/dependencies/blocked_by?per_page=100`, { source: "blockers", reason: "Blockers could not be read." }) : null;
      if (!err && !bRes.ok) err = { source: bRes.source, reason: bRes.reason };
      const tcRes = !err ? await reader.pages(`repos/${repo}/issues/${sub.number}/comments?per_page=100`, { source: "comments", reason: "Ticket comments could not be read." }) : null;
      if (!err && !tcRes.ok) err = { source: tcRes.source, reason: tcRes.reason };
      else if (tcRes?.ok) for (const c of tcRes.data) comments.push({ kind: "comment", repo, number: sub.number, id: c.id, author: c.user?.login || null, created_at: c.created_at, updated_at: c.updated_at || c.created_at, body: c.body || "" });
      const parsedLinks = parsePlanLinks(sub.body, repo);
      const hardBlockers = [], fileBlockers = [];
      for (const b of !err && bRes?.ok ? bRes.data : []) {
        if (parsedLinks.valid && parsedLinks.links.get(b.number) === "file") { fileBlockers.push(b.number); continue; }
        let humanComplete = false;
        const merged = hasVerifiedMerge(b.number);
        const bLabels = (b.labels || []).map((l) => (typeof l === "string" ? l : l.name));
        if (!merged && b.state === "closed" && bLabels.includes("ready-for-human")) {
          if (!humanDoneCache.has(b.number)) {
            const bc = await reader.pages(`repos/${repo}/issues/${b.number}/comments?per_page=100`, { source: "blockers", reason: "Blocker completion record could not be read." });
            if (!bc.ok) { err = { source: bc.source, reason: bc.reason }; break; }
            humanDoneCache.set(b.number, bc.data.some((c) => authorSet.has(String(c.user?.login || "").toLowerCase()) && /^launch-fleet:\s+complete:/i.test(String(c.body || "").trim())));
          }
          humanComplete = humanDoneCache.get(b.number);
        }
        hardBlockers.push({ number: b.number, merged, human_complete: humanComplete });
      }
      let readyEvent = null;
      if (!err && labels.includes("ready-for-agent") && !tPrs.some((p) => p.merged_at || p.state === "OPEN")) {
        const ev = await reader.pages(`repos/${repo}/issues/${sub.number}/events?per_page=100`, { source: "labels", reason: "Label events could not be read." });
        if (!ev.ok) err = { source: ev.source, reason: ev.reason };
        else { const hit = ev.data.filter((e) => e.event === "labeled" && e.label?.name === "ready-for-agent").at(-1); if (hit) readyEvent = { kind: "label", repo, number: sub.number, id: hit.id, time: hit.created_at }; }
      }
      let checks = [];
      for (const p of !err ? tPrs : []) {
        const pc = await reader.pages(`repos/${p.repo}/issues/${p.number}/comments?per_page=100`, { source: "comments", reason: "Pull request comments could not be read." });
        if (!pc.ok) { err = { source: pc.source, reason: pc.reason }; break; }
        for (const c of pc.data) comments.push({ kind: "comment", repo: p.repo, number: p.number, id: c.id, author: c.user?.login || null, created_at: c.created_at, updated_at: c.updated_at || c.created_at, body: c.body || "" });
        if (p.state === "OPEN" && !p.draft && !p.merged_at) {
          if (!/^[0-9a-f]{40}$/.test(p.head)) {
            checks = { error: "Pull request head could not be read.", source: "pull_requests" };
          } else {
            for (let url = `repos/${p.repo}/commits/${p.head}/check-runs?per_page=100`; url;) {
              const cr = await reader.get(url, { source: "checks", reason: "Checks could not be read." });
              if (!cr.ok || !Array.isArray(cr.data?.check_runs)) { checks = { error: cr.ok ? "Checks could not be read." : cr.reason, source: cr.ok ? "checks" : cr.source }; break; }
              checks.push(...cr.data.check_runs.map((r) => mapCheckRun(p.repo, p.number, p.head, r)));
              url = cr.next;
            }
          }
        }
      }
      tickets.push({ number: sub.number, spec: s.number, version: sub.milestone?.title || version || "unassigned", title: sub.title || `Ticket #${sub.number}`, state: String(sub.state || "open").toUpperCase(), state_reason: sub.state_reason || null, closed_at: sub.closed_at || null, labels, ready_event: readyEvent, hard_blockers: hardBlockers, file_blockers: fileBlockers, pull_requests: tPrs, checks, error: err });
    }
  }
  return { budget: reader.budget(), repo, default_branches: defaultBranches, record_authors: authors, required_checks: reqChecks, specs: specs.map((s) => ({ number: s.number, state: String(s.state || "open").toUpperCase(), closed_at: s.closed_at || null })), tickets, comments, needs_owner: needsOwner, unavailable };
}
