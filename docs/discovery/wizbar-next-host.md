# WizBar next-iteration host discovery (WZ10)

Status: documentation in preparation for #24 under [approved plan revision 8](https://github.com/openwizdev/wizplugins/issues/1#issuecomment-6780025774).

## Proof plan, before the contract

N0 uses the [existing private keeper observation](https://github.com/jparker2006/ClosedWiz/pull/2375#issuecomment-6779925149), public SDK inspection and independent review. No live read is repeated. Only field semantics and synthetic examples belong here.

| Claim | Evidence and boundary |
| --- | --- |
| Preserve the keeper's scope and limits | Independent comparison with that exact private comment; no fixture proves live behavior |
| Identify SDK/footer/source/coverage/update boundaries | Published 0.6.49 declarations plus the keeper record; missing host facts stay Unverified |
| Preserve Cloud/Local and null/startup distinctions | Observed mapping table, synthetic examples, independent review; supported raw lookup remains a gate |
| Consumers have an exact sanitised interface | Compile the documented types and positive/negative examples below |
| Missing data never becomes a proven zero or guessed icon | Type examples reject a numeric count without ready input and a classified unavailable machine |
| Downstream claims remain blocked where evidence is missing | Explicit release conditions for #28/#29 and live acceptance #9 |

Plausible regression: a consumer mistakes an unavailable source for zero or a null environment for Cloud. Existing plugin tests exercise synthetic presentation; they do not own this new documentation contract or prove its host inputs.

## Reproducible documentation proof

From the repository root after `cd wizbar && npm ci`, run:

```sh
python3 - <<'PY'
from pathlib import Path
import re, subprocess, tempfile
contract = Path('wizbar/contracts/host-observation.v1.md')
if not contract.is_file():
    print('FAIL N0: host-observation contract absent')
    raise SystemExit(1)
blocks = re.findall(r'```typescript\n(.*?)\n```', contract.read_text(), re.S)
assert len(blocks) == 2, 'Expected interface and synthetic type examples'
with tempfile.TemporaryDirectory() as folder:
    source = Path(folder) / 'contract.ts'
    source.write_text('\n'.join(blocks))
    result = subprocess.run([
        'wizbar/node_modules/.bin/tsc', '--ignoreConfig', '--strict',
        '--noEmit', '--skipLibCheck', '--target', 'es2022', str(source)
    ], capture_output=True, text=True)
    if result.returncode:
        print((result.stdout + result.stderr).replace(str(source), 'contract.ts'))
        raise SystemExit(result.returncode)
print('PASS N0: interface and synthetic type examples compile; host behavior unverified')
PY
```

This checks the consumer type boundary, including rejected unavailable values. It does not validate a transport, runtime payload, live mapping or global completeness.

## Failing-first record

Before adding the contract, the documentation proof above returned exit 1:

```text
FAIL N0: host-observation contract absent
```

The red record is committed before the contract. Independent review, scoped checks and required CI still gate hand-back.
