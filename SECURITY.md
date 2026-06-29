# Security model

The atomipy web-module is a **code-generation tool**: the React frontend builds a node
graph, the codegen (`src/components/graph/graphExecution.ts`) emits a Python script that
uses `atomipy`, and the backend **executes that script** to produce the result bundle.
Executing a generated script is therefore the app's core function — but the script arrives
from the client, so the backend treats it as **untrusted**.

## Threat model

- The `/api/build-stream` body contains a `script` string. A client can send *any* Python,
  not only what the UI generated. So the build script must be assumed hostile.
- The build runs on the server (Cloud Run for atomipy.io, or the user's machine locally).
- We never store users' structures/coordinates/results beyond the transient build dir and
  the short-lived result zip; analytics are cookieless and aggregate (see the footer note).

## Controls in this repo

### 1. Sandboxed execution (process isolation)
The generated script runs in a **separate subprocess**, never in the web server's
interpreter (`backend/core/build_runner.py` + `build_runtime.py`, spawned by
`build_stream`). This gives:
- **Scrubbed environment** (`_sandbox_env`): credentials/secrets are stripped from the
  child's env (any var whose name contains `SECRET`/`TOKEN`/`PASSWORD`/`CREDENTIAL`/
  `API_KEY`/`ACCESS_KEY`/`_AUTH`/`SESSION`, plus an explicit GCP/AWS/LLM-key denylist).
  Conda/OpenMM/GROMACS vars are preserved so simulations still work.
- **Process-group kill** (`_terminate_proc`): the child is its own session
  (`start_new_session=True`), so a timeout or `/api/stop-build` kills the whole tree
  (including `gmx`/OpenMM children) reliably — no more best-effort thread-killing.
- **Optional resource limits** (`_set_rlimits`, POSIX `preexec_fn`), opt-in via env:
  - `BUILD_RLIMIT_CPU_SECONDS` — CPU-time cap (e.g. `120`)
  - `BUILD_RLIMIT_AS_MB` — address-space/memory cap (e.g. `4096`)
  - `BUILD_RLIMIT_FSIZE_MB` — max output file size (e.g. `512`)
  - `BUILD_TIMEOUT_SECONDS` — wall-clock cap (default `600`)

### 2. CORS allowlist
`allow_origins` is an explicit list (`ALLOWED_ORIGINS` env), `allow_credentials=False` —
no more `*`+credentials. Prod and local dev are same-origin, so normal use is unaffected.

### 3. Path-traversal confinement
`_safe_join` (realpath-confined) guards every endpoint that joins a client-supplied
filename onto a base dir (`/inorganic/scan`, `/organic/parametrize`); the SPA catch-all is
confined to the dist root; `/upload` basenames the client filename.

### 4. Codegen string escaping
All user strings interpolated into the generated Python go through `pyEscape` (escapes
`\`, `'`, CR, LF), preventing a crafted atom-type/resname/filename from breaking out of a
string literal and injecting code (defense-in-depth behind the sandbox).

## Infra controls to apply on the public deployment (atomipy.io)

The in-repo controls shrink the blast radius; **complete the sandbox at the infra layer**:

1. **Restrict network egress** on the Cloud Run service so the build process cannot reach
   the instance **metadata server** (`169.254.169.254`) or make arbitrary outbound calls.
   Use a VPC connector with egress = all traffic + a firewall/NAT that denies metadata and
   limits egress to what's needed (e.g. the OpenFF worker URL). This is the key control
   that stops a hostile script from stealing the service account's tokens.
2. **Minimal service account**: run the service with a dedicated SA that has *no* IAM
   permissions beyond what the app needs, so even a token leak is low-value.
3. **No secrets in env**: keep credentials out of the container environment (the scrubber
   covers env, but metadata/egress restriction is what covers instance credentials).
4. **Set the resource limits** above (`BUILD_RLIMIT_*`) on the public instance.
5. The container already runs as **non-root** (`$MAMBA_USER`); keep it that way.

> Residual risk after the above: a build can still consume its allotted CPU/memory and
> reach explicitly-allowed hosts. For stronger isolation (per-build gVisor/nsjail, network
> namespaces) run builds in a dedicated, locked-down worker service.
