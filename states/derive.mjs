const SHA = "[0-9a-f]{40}";
const RE = {
  verdict: new RegExp(`^VERDICT:\\s+(APPROVE|CHANGES)\\s+at\\s+(${SHA})\\s*$`),
  fleet: /^launch-fleet:\s+fleet active,\s+loop\s+fleet-([1-9][0-9]*)\b/,
  startChecked: /^launch-fleet:\s+start checked,\s+branch\s+(\S+)/,
  held: /^launch-fleet:\s+held (?:manual|live|for ordering):\s*(.+)$/,
  heldPr: /^launch-fleet:\s+held for #([1-9][0-9]*)\b/,
  wait: /^launch-fleet:\s+waiting for #([1-9][0-9]*)\b/,
  resume: /^launch-fleet:\s+resume sent [1-9][0-9]* for #([1-9][0-9]*)\b/,
  revClaim: new RegExp(`^launch-fleet:\\s+review starting\\s+(${SHA})\\b`),
  revStart: new RegExp(`^launch-fleet:\\s+review started\\s+(${SHA})\\b`),
  recheck: new RegExp(`^launch-fleet:\\s+re-check sent\\s+(${SHA})\\b`),
  giveup: new RegExp(`^launch-fleet:\\s+review given up\\s+(${SHA})(?::\\s*(.*))?$`),
  freshClaim: new RegExp(`^launch-fleet:\\s+fresh starting\\s+(${SHA})\\b`),
  freshStart: new RegExp(`^launch-fleet:\\s+findings sent\\s+(${SHA}):\\s*fresh round started,\\s*branch\\s+(\\S+)`),
  freshFail: new RegExp(`^launch-fleet:\\s+fresh (?:failed|refused|withdrawn)\\s+(${SHA})\\b`),
  findings: new RegExp(`^launch-fleet:\\s+findings sent\\s+(${SHA})\\s*$`),
  mergeQueued: new RegExp(`^launch-fleet:\\s+merge queued\\s+(${SHA})\\b`),
  mergeBlocked: new RegExp(`^launch-fleet:\\s+merge blocked\\s+(${SHA})(?::\\s*(.*))?$`),
  mergeMain: new RegExp(`^launch-fleet:\\s+merge main asked\\s+(${SHA})\\b`),
  linkPath: /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/?$/,
  word: /^[A-Za-z]+(['-][A-Za-z]+)*'?$/,
};

const cTime = (c) => c.updated_at || c.created_at;
const cRef = (c) => ({ kind: "comment", repo: c.repo, number: c.number, id: c.id });
const prRef = (pr) => ({ repo: pr.repo, number: pr.number, merged_at: pr.merged_at ?? null });
const firstLine = (body) => (String(body ?? "").split(/\r?\n/).find((l) => l.trim()) || "").trim();
const sentence = (raw) => {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const cap = s[0].toUpperCase() + s.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
};

export function parsePlanLinks(body, repo) {
  const lines = String(body ?? "").replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, ""));
  const sections = [];
  let fence = null;
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inComment) { if (line.includes("-->")) inComment = false; continue; }
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) { if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length && !line.trim().replaceAll(fence[0], "")) fence = null; continue; }
    if (fm) { fence = fm[1]; continue; }
    if (line.includes("<!--")) { if (!line.includes("-->")) inComment = true; continue; }
    if (line === "## Links") {
      const items = [];
      for (i++; i < lines.length && !/^#{1,6}(?: |$)/.test(lines[i]); i++) if (lines[i].trim()) items.push(lines[i]);
      i--;
      sections.push(items);
    }
  }
  if (sections.length === 0) return { valid: true, links: new Map() };
  if (sections.length > 1 || sections[0].length === 0) return { valid: false, links: new Map() };
  const items = sections[0];
  if (items.includes("none")) return { valid: items.length === 1, links: new Map() };
  const links = new Map();
  const seen = new Set();
  for (const line of items) {
    const m = line.match(/^- (?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+))?#([1-9][0-9]*) (real|file):(.*)$/);
    if (!m || (m[1] && m[1].toLowerCase() !== String(repo || "").toLowerCase())) return { valid: false, links: new Map() };
    const num = Number(m[2]);
    if (seen.has(num)) { links.delete(num); continue; }
    seen.add(num);
    const reason = m[4].trim();
    if (m[3] === "real") {
      const words = reason.replace(/`[^`]*`/g, " ").split(/\s+/).map((w) => w.replace(/^[()[\]{}"',.;:!?]+|[()[\]{}"',.;:!?]+$/g, "")).filter((w) => RE.word.test(w));
      if (words.length >= 3) links.set(num, "real");
    } else if ([...reason.matchAll(/`([^`]+)`/g)].some((x) => RE.linkPath.test(x[1]) && !x[1].split("/").some((s) => s === "." || s === ".."))) {
      links.set(num, "file");
    }
  }
  return { valid: true, links };
}

function evalChecks(pr, rawChecks, required, fallbackTime) {
  if (rawChecks && !Array.isArray(rawChecks) && typeof rawChecks.error === "string") {
    return { status: "error", source: rawChecks.source || "checks", reason: rawChecks.error };
  }
  const latest = new Map();
  for (const c of Array.isArray(rawChecks) ? rawChecks : []) {
    if (c.repo !== pr.repo || c.number !== pr.number || c.head !== pr.head) continue;
    const prev = latest.get(c.name);
    const key = `${c.completed_at || c.started_at || ""}\0${String(c.id || 0).padStart(16, "0")}`;
    if (!prev || key >= prev.key) latest.set(c.name, { key, check: c });
  }
  const runs = [...latest.values()].map((v) => v.check);
  const failing = runs.find((c) => c.result === "fail" || c.result === "cancel");
  if (failing) return { status: "failing", check: failing, since: failing.completed_at || fallbackTime };
  const pending = runs.find((c) => c.result === "pending");
  const req = Array.isArray(required) ? required : [];
  if (pending || req.length === 0 || req.some((name) => latest.get(name)?.check.result !== "pass")) {
    return { status: "pending", check: pending || null, since: pending?.completed_at || pending?.started_at || fallbackTime };
  }
  const passing = runs.filter((c) => c.result === "pass").sort((a, b) => (a.completed_at || "").localeCompare(b.completed_at || "") || (a.id - b.id)).at(-1);
  return { status: "green", check: passing, since: passing?.completed_at || fallbackTime };
}

function parsePrComments(prComments) {
  const reviewers = [];
  let active = null;
  let ambiguousReview = false;
  let fixer = null;
  const verdicts = new Map(), mergeQueued = new Map(), mergeBlocked = new Map(), mergeMain = new Map(), findingsSent = new Map(), givenUpByHead = new Map();
  for (const c of prComments) {
    const line = firstLine(c.body);
    let m;
    if ((m = line.match(RE.verdict))) {
      const v = { verdict: m[1], head: m[2], comment: c };
      verdicts.set(m[2], v);
      if (active) { active.verdicts.set(m[2], v); if (m[1] === "CHANGES") active.lastChanges = c; }
    } else if ((m = line.match(RE.revClaim)) || (m = line.match(RE.revStart))) {
      if (active && !active.givenUp) ambiguousReview = true;
      active = { round: reviewers.length + 1, queued: RE.revClaim.test(line), start: c, head: m[1], recheck: null, givenUp: null, verdicts: new Map(), lastChanges: null };
      reviewers.push(active);
      givenUpByHead.delete(m[1]);
    } else if ((m = line.match(RE.recheck))) {
      if (active && !active.givenUp) { active.head = m[1]; active.recheck = c; active.verdicts.delete(m[1]); active.lastChanges = null; }
    } else if ((m = line.match(RE.giveup))) {
      if (active && !active.givenUp) { active.givenUp = c; active = null; }
      givenUpByHead.set(m[1], c);
    } else if ((m = line.match(RE.freshStart))) fixer = { confirmed: true, head: m[1], start: c, failed: null };
    else if ((m = line.match(RE.freshClaim))) fixer = { confirmed: false, head: m[1], start: c, failed: null };
    else if ((m = line.match(RE.freshFail))) { if (fixer) fixer.failed = c; }
    else if ((m = line.match(RE.findings))) findingsSent.set(m[1], c);
    else if ((m = line.match(RE.mergeQueued))) { mergeQueued.set(m[1], c); mergeBlocked.delete(m[1]); }
    else if ((m = line.match(RE.mergeBlocked))) mergeBlocked.set(m[1], { comment: c, reason: sentence(m[2]) || "Merge is blocked." });
    else if ((m = line.match(RE.mergeMain))) mergeMain.set(m[1], c);
  }
  return { reviewers, ambiguousReview, fixer, verdicts, mergeQueued, mergeBlocked, mergeMain, findingsSent, givenUpByHead };
}

function parseTicketComments(tComments) {
  let builderStart = null, builderClaim = null, builderArchived = null, heldReason = null;
  const waitingFor = new Set();
  for (const c of tComments) {
    const line = firstLine(c.body);
    let m;
    if ((m = line.match(RE.startChecked))) { builderStart = { comment: c, branch: m[1] }; builderClaim = null; }
    else if (/^launch-fleet:\s+started\b/.test(line)) { builderStart = { comment: c, branch: null }; builderClaim = null; }
    else if (/^launch-fleet:\s+starting\b/.test(line)) builderClaim = c;
    else if (/^launch-fleet:\s+start (?:refused|not tried|failed|withdrawn)\b/.test(line)) builderClaim = null;
    else if (/^launch-fleet:\s+archived\b/.test(line)) builderArchived = c;
    else if ((m = line.match(RE.held))) heldReason = sentence(m[1]);
    else if ((m = line.match(RE.heldPr))) heldReason = `Held for contract change in #${m[1]}.`;
    else if (/^launch-fleet:\s+released ordering\b/.test(line)) heldReason = null;
    else if ((m = line.match(RE.wait))) waitingFor.add(Number(m[1]));
    else if ((m = line.match(RE.resume))) waitingFor.delete(Number(m[1]));
  }
  return { builderStart, builderClaim, builderArchived, heldReason, waitingFor };
}

export function deriveStates(input) {
  const { read_at, budget, repo, default_branches = {}, required_checks = {}, event_time = read_at } = input;
  const authors = new Set((input.record_authors || []).map((a) => String(a).toLowerCase()));
  const trusted = (input.comments || [])
    .filter((c) => typeof c.author === "string" && authors.has(c.author.toLowerCase()))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const commentsFor = (r, n) => trusted.filter((c) => c.repo === r && c.number === n);
  const unavailable = [...(input.unavailable || [])];
  const ticketsOut = [], candidates = [];
  const trackMap = new Map();
  for (const s of input.specs || []) {
    trackMap.set(s.number, { spec: s.number, tickets: [], agents: [], needs_owner: [], prKeys: new Set(), ticketNums: new Set() });
    const fleetRec = commentsFor(repo, s.number).filter((c) => RE.fleet.test(firstLine(c.body))).at(-1);
    if (fleetRec) {
      const closed = String(s.state || "").toUpperCase() === "CLOSED";
      candidates.push({
        spec: s.number,
        agent: { name: `fleet-${s.number}`, role: "fleet", ticket: null, pull_request: null, state: closed ? "done" : "building", since: closed ? (s.closed_at || event_time) : cTime(fleetRec), record: closed ? { kind: "issue", repo, number: s.number } : cRef(fleetRec) },
      });
    }
  }
  for (const t of input.tickets || []) {
    const track = trackMap.get(t.spec);
    const { builderStart, builderClaim, builderArchived, heldReason, waitingFor } = parseTicketComments(commentsFor(repo, t.number));
    const prs = Array.isArray(t.pull_requests) ? t.pull_requests : [];
    const verified = prs.filter((p) => p.merged_at && (p.base || default_branches[p.repo] || "main") === (default_branches[p.repo] || "main"));
    const openPrs = prs.filter((p) => String(p.state || "").toUpperCase() === "OPEN" && !p.merged_at);
    let selPr = null, ticketErr = t.error || null;
    if (!ticketErr && verified.length > 1) ticketErr = { source: "pull_requests", reason: "Multiple verified closing pull requests found." };
    else if (!ticketErr && verified.length === 1) selPr = verified[0];
    else if (!ticketErr && openPrs.length > 1) ticketErr = { source: "pull_requests", reason: "Multiple open closing pull requests found." };
    else if (!ticketErr && openPrs.length === 1) selPr = openPrs[0];
    const prInfo = selPr ? parsePrComments(commentsFor(selPr.repo, selPr.number)) : null;
    const activeOpenPr = selPr && !selPr.merged_at && String(selPr.state || "").toUpperCase() === "OPEN" && !selPr.draft;
    const checkState = !ticketErr && activeOpenPr ? evalChecks(selPr, t.checks, required_checks[selPr.repo], event_time) : null;
    if (!ticketErr && checkState?.status === "error") ticketErr = { source: checkState.source, reason: checkState.reason };
    const hasBuilder = Boolean(builderStart || builderClaim || (!selPr && (t.labels || []).includes("ready-for-agent")));
    if (ticketErr) {
      unavailable.push({ kind: "ticket", ref: String(t.number), source: ticketErr.source, reason: ticketErr.reason });
      if (hasBuilder) unavailable.push({ kind: "agent", ref: `builder-${t.number}`, source: ticketErr.source, reason: ticketErr.reason });
      if (prInfo) {
        for (const rv of prInfo.reviewers) unavailable.push({ kind: "agent", ref: `reviewer-${selPr.number}-${rv.round}`, source: ticketErr.source, reason: ticketErr.reason });
        if (prInfo.fixer) unavailable.push({ kind: "agent", ref: `fixer-${selPr.number}-2`, source: ticketErr.source, reason: ticketErr.reason });
      }
      continue;
    }
    const labels = new Set(t.labels || []);
    const hardBlockers = t.hard_blockers || [];
    const unsettledHard = hardBlockers.filter((b) => !b.merged && !b.human_complete);
    for (const num of waitingFor) if (!hardBlockers.some((b) => b.number === num && (b.merged || b.human_complete)) && !unsettledHard.some((b) => b.number === num)) unsettledHard.push({ number: num, merged: false });
    unsettledHard.sort((a, b) => a.number - b.number);
    const blockers = [...new Set([...hardBlockers.map((b) => b.number), ...(t.file_blockers || [])])].sort((a, b) => a - b);
    const curVerdict = activeOpenPr ? prInfo.verdicts.get(selPr.head) : null;
    const liveBuild = Boolean((builderStart && (!builderStart.branch || !selPr?.branch || builderStart.branch === selPr.branch)) || selPr?.draft);
    const state = selPr?.merged_at ? "merged"
      : String(t.state || "").toUpperCase() === "CLOSED" ? "closed"
      : activeOpenPr && (checkState.status === "failing" || curVerdict?.verdict === "CHANGES") ? "fix"
      : activeOpenPr && checkState.status === "pending" ? "ci"
      : activeOpenPr && checkState.status === "green" ? "review"
      : liveBuild ? "building"
      : (labels.has("held") || labels.has("needs-info") || unsettledHard.length > 0 || (!labels.has("ready-for-agent") && !labels.has("ready-for-human"))) ? "waiting"
      : "ready";
    let problem = null;
    if (state !== "merged" && state !== "closed") {
      const mBlock = activeOpenPr ? prInfo.mergeBlocked.get(selPr.head) : null;
      if (labels.has("held")) problem = { kind: "held", reason: heldReason || "Ticket is held." };
      else if (mBlock) problem = { kind: "held", reason: mBlock.reason };
      else if (unsettledHard.length > 0) problem = { kind: "blocked", reason: unsettledHard.length === 1 ? `Blocker #${unsettledHard[0].number} needs a verified merge.` : `Blockers ${unsettledHard.map((b) => `#${b.number}`).join(", ")} need verified merges.` };
      else if (activeOpenPr && checkState.status === "failing") problem = { kind: "failing", reason: `Check ${checkState.check.name} failed.` };
      else if (activeOpenPr && curVerdict?.verdict === "CHANGES") problem = { kind: "failing", reason: "The current review requests changes." };
      else if (activeOpenPr && prInfo.givenUpByHead.has(selPr.head)) problem = { kind: "stale", reason: "The fleet gave up on the reviewer." };
      else if (activeOpenPr && prInfo.mergeMain.has(selPr.head)) problem = { kind: "stale", reason: "The builder was asked to merge the default branch." };
    }
    const prOut = selPr ? prRef(selPr) : null;
    ticketsOut.push({ number: t.number, spec: t.spec, version: t.version, title: t.title, blockers, state, problem, pull_request: prOut });
    if (track) { track.tickets.push(t.number); track.ticketNums.add(t.number); if (selPr) track.prKeys.add(`${selPr.repo}#${selPr.number}`); }
    const mergeRec = activeOpenPr && checkState.status === "green" && curVerdict?.verdict === "APPROVE" ? (prInfo.mergeQueued.get(selPr.head) || curVerdict.comment) : null;
    const prObj = selPr ? { kind: "pull_request", repo: selPr.repo, number: selPr.number } : null;
    const assignPrState = (fallbackRec, isFixer) => {
      if (mergeRec) return { state: "merge", since: cTime(mergeRec), record: cRef(mergeRec) };
      if (checkState.status === "failing") return { state: "fix", since: checkState.since, record: { kind: "check", repo: selPr.repo, number: selPr.number, id: checkState.check.id } };
      if (curVerdict?.verdict === "CHANGES") return { state: "fix", since: cTime(curVerdict.comment), record: cRef(curVerdict.comment) };
      if (isFixer && prInfo.fixer.head === selPr.head) return { state: "fix", since: cTime(fallbackRec), record: cRef(fallbackRec) };
      if (!isFixer && prInfo.findingsSent.has(selPr.head)) return { state: "fix", since: cTime(prInfo.findingsSent.get(selPr.head)), record: cRef(prInfo.findingsSent.get(selPr.head)) };
      if (checkState.status === "green") return { state: "review", since: checkState.since, record: { kind: "check", repo: selPr.repo, number: selPr.number, id: checkState.check.id } };
      return { state: "ci", since: checkState.since, record: checkState.check ? { kind: "check", repo: selPr.repo, number: selPr.number, id: checkState.check.id } : prObj };
    };
    if (builderStart || builderClaim || (state === "ready" && labels.has("ready-for-agent"))) {
      const bState = selPr?.merged_at ? { state: "done", since: selPr.merged_at, record: prObj }
        : builderArchived ? { state: "done", since: cTime(builderArchived), record: cRef(builderArchived) }
        : state === "closed" ? { state: "done", since: t.closed_at || event_time, record: { kind: "issue", repo, number: t.number } }
        : prInfo?.fixer?.confirmed ? { state: "done", since: cTime(prInfo.fixer.start), record: cRef(prInfo.fixer.start) }
        : activeOpenPr ? assignPrState(builderStart?.comment || builderClaim, false)
        : builderStart ? { state: "building", since: cTime(builderStart.comment), record: cRef(builderStart.comment) }
        : builderClaim ? { state: "queued", since: cTime(builderClaim), record: cRef(builderClaim) }
        : { state: "queued", since: t.ready_event?.time || event_time, record: t.ready_event ? { kind: "label", repo: t.ready_event.repo, number: t.ready_event.number, id: t.ready_event.id } : { kind: "issue", repo, number: t.number } };
      candidates.push({ spec: t.spec, agent: { name: `builder-${t.number}`, role: "builder", ticket: t.number, pull_request: prOut, ...bState } });
    }
    if (prInfo) {
      if (prInfo.ambiguousReview) {
        for (const rv of prInfo.reviewers) unavailable.push({ kind: "agent", ref: `reviewer-${selPr.number}-${rv.round}`, source: "comments", reason: "Ambiguous reviewer start history." });
      } else {
        for (const rv of prInfo.reviewers) {
          const rState = rv.givenUp ? { state: "done", since: cTime(rv.givenUp), record: cRef(rv.givenUp) }
            : selPr.merged_at ? { state: "done", since: selPr.merged_at, record: prObj }
            : String(selPr.state || "").toUpperCase() === "CLOSED" ? { state: "done", since: selPr.closed_at || event_time, record: prObj }
            : rv.queued ? { state: "queued", since: cTime(rv.start), record: cRef(rv.start) }
            : mergeRec ? { state: "merge", since: cTime(mergeRec), record: cRef(mergeRec) }
            : rv.verdicts.get(selPr.head)?.verdict === "CHANGES" ? { state: "fix", since: cTime(rv.verdicts.get(selPr.head).comment), record: cRef(rv.verdicts.get(selPr.head).comment) }
            : rv.recheck && rv.head === selPr.head ? { state: "review", since: cTime(rv.recheck), record: cRef(rv.recheck) }
            : rv.lastChanges ? { state: "fix", since: cTime(rv.lastChanges), record: cRef(rv.lastChanges) }
            : { state: "review", since: cTime(rv.recheck || rv.start), record: cRef(rv.recheck || rv.start) };
          candidates.push({ spec: t.spec, agent: { name: `reviewer-${selPr.number}-${rv.round}`, role: "reviewer", ticket: t.number, pull_request: prOut, ...rState } });
        }
      }
      if (prInfo.fixer) {
        const fx = prInfo.fixer;
        const fState = selPr.merged_at ? { state: "done", since: selPr.merged_at, record: prObj }
          : String(selPr.state || "").toUpperCase() === "CLOSED" ? { state: "done", since: selPr.closed_at || event_time, record: prObj }
          : fx.failed ? { state: "done", since: cTime(fx.failed), record: cRef(fx.failed) }
          : !fx.confirmed ? { state: "queued", since: cTime(fx.start), record: cRef(fx.start) }
          : activeOpenPr ? assignPrState(fx.start, true)
          : { state: "fix", since: cTime(fx.start), record: cRef(fx.start) };
        candidates.push({ spec: t.spec, agent: { name: `fixer-${selPr.number}-2`, role: "fixer", ticket: t.number, pull_request: prOut, ...fState } });
      }
    }
  }
  const byName = new Map();
  for (const item of candidates) {
    if (!byName.has(item.agent.name)) byName.set(item.agent.name, []);
    byName.get(item.agent.name).push(item);
  }
  const agentsOut = [];
  for (const [name, list] of byName) {
    if (list.length > 1) { unavailable.push({ kind: "agent", ref: name, source: "pull_requests", reason: "Multiple assignments share this agent name." }); continue; }
    agentsOut.push(list[0].agent);
    trackMap.get(list[0].spec)?.agents.push(name);
  }
  for (const card of input.needs_owner || []) {
    for (const tr of trackMap.values()) {
      const hit = (card.repo === repo && (card.number === tr.spec || tr.ticketNums.has(card.number))) || tr.prKeys.has(`${card.repo}#${card.number}`);
      if (hit && !tr.needs_owner.includes(card.id)) tr.needs_owner.push(card.id);
    }
  }
  const tracks = [...trackMap.values()].map(({ spec, tickets, agents, needs_owner }) => ({ spec, tickets, agents, needs_owner }));
  return { schema: "openwiz.states.v1", read_at, budget, tickets: ticketsOut, agents: agentsOut, tracks, unavailable };
}
