# WZ12 UI brief

Small copy/source change to WZ5's approved compact footer concept. Existing
source/design revision: `8e878b346916311fec6d2ac11c5450b275d16410` and its
`docs/evidence/wz5/target.png`; no separate taste board exists. Preserve host
sans-serif, semantic colors, 12px tabular number, 14px spinner, 6px gap and
rounded bordered hover. No new screen, navigation or dependency.

Task: glance at observable running threads, then hover/focus for coverage.
Desktop: 1440×900; phone: 390×844. The footer remains compact at both widths;
long disclosure wraps within the viewport rather than widening the page.

Synthetic packet: positive = 2 unique working threads in two projects, including
a hidden child and duplicate parent; empty-ready = 0; absent/loading/error = no
number. Muting and shelf/search/project visibility never alter raw source input.
No titles, user or host identities enter the packet.

Exact hover copy for positive: “2 observable running threads. Subagents are not
counted yet. Threads outside the sidebar source may be unseen; total coverage
and freshness are unverified.” Zero changes only 2 to 0. Settings source status
remains unverified for valid observable input, unavailable for loading/error or
invalid input. No fabricated subagent zero and no Live claim.

Target: generated design guidance only. Real screenshots will render the actual
React component on synthetic inputs, not the host. Footer registration is still
subject to WZ12-F1; no icon-only/card/alternate location is proposed.

Critique: preserve the glanceable number while allowing coverage text to wrap.
The longer hover deliberately replaces the old complete thread/subagent split.

WZ12-F1 approved the target with shorter hover copy on 2026-11-11:
`N running · subagents not counted yet · some threads may be unseen`.
This deliberate copy change follows the public ruling at
https://github.com/openwizdev/wizplugins/issues/28#issuecomment-6786760739;
the original generated target/prompt are retained. No new layout is proposed.
