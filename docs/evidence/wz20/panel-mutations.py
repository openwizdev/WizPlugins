# Post-implementation mutation replay for review R4 (not a first red run).
# Run from the repository root: python3 -I docs/evidence/wz20/panel-mutations.py
# Each case breaks the registered panel on purpose, runs StatsPanel.test.tsx,
# and restores the file. Every case must fail at the assertions its claim names.
import subprocess
from pathlib import Path

panel = Path('wizbar/src/StatsPanel.tsx')
original = panel.read_text()
cases = {
    'M1 registered but empty panel (values, disclosures, unavailable state)': [
        ('{stats.status === "ready" ? (', '{false ? ('),
        ('<p style={line}>Stats unavailable</p>', ''),
        ('<p style={{ ...line, color: "var(--muted-foreground)" }}>{disclosureText}</p>\n        </>\n      )}', '</>\n      )}'),
    ],
    'M2 panel trusts raw rows (loading, error, reconnect, gap)': [
        ('const { rows } = useObservableRows();', 'const rows = experimental_useSidebarThreads().threads;'),
        ('import { useObservableRows } from "./FooterCounter";', 'import { experimental_useSidebarThreads } from "@get-bb/plugin-sdk/app";'),
    ],
    'M3 panel drops the coverage disclosure line': [
        ('<p style={{ ...line, color: "var(--muted-foreground)" }}>{disclosureText}</p>\n          <hr', '<hr'),
    ],
    'M4 panel swaps the Cloud and Local numbers': [
        ('${stats.running.cloud} cloud, ${stats.running.local} local', '${stats.running.local} cloud, ${stats.running.cloud} local'),
    ],
}
try:
    for name, edits in cases.items():
        text = original
        for old, new in edits:
            assert old in text, (name, old)
            text = text.replace(old, new)
        panel.write_text(text)
        run = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.config.ts', '--maxWorkers=2', 'src/StatsPanel.test.tsx'],
                             cwd='wizbar', capture_output=True, text=True, env={**__import__('os').environ, 'NO_COLOR': '1', 'FORCE_COLOR': '0'})
        lines = [l.strip() for l in (run.stdout + run.stderr).splitlines() if l.lstrip().startswith('FAIL') or 'Tests ' in l]
        print(f'== {name}: exit {run.returncode}')
        print('\n'.join(sorted(set(lines))))
        assert run.returncode != 0, name
finally:
    panel.write_text(original)
