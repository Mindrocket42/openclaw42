---
summary: "Prepared isolated Ironhead configuration and its activation boundaries"
title: "Ironhead restricted profile"
---

The adjacent `restricted-config.json` is a prepared source configuration, not a
change to a running Gateway. Use a dedicated OpenClaw profile/state directory;
do not overwrite an existing configuration or import its secrets automatically.
Replace all `provider/model` placeholders with the same already
configured supported model. Configure provider authentication through the normal
secret owner and Gateway authentication through the normal setup flow. No token
or credential is embedded in this file.

The profile requires Docker and the existing sandbox image. It selects all-session
tool sandboxing, an isolated per-session workspace, no container network, a
read-only root, dropped capabilities, and CPU/memory/process limits. Elevated
execution is disabled; shell operations target the sandbox. Filesystem tools stay
within their workspace. The explicit tool allowlist omits external messaging,
browser, node control, Gateway configuration, and arbitrary plugin tools.
OpenClaw Code Mode selects QuickJS, which fails closed if unavailable. Node's
trusted `vm` executor is not a security boundary.

Both the coordinator and Consigliere use explicit native OpenClaw model routes.
The Consigliere has only the `read` tool. Juggle reviews require this restricted
reviewer configuration; a role name
or prompt does not create a read-only tool grant. Ordinary task workers retain
the profile's sandboxed execution capability.

This profile intentionally cannot edit arbitrary host projects or browse the web.
Bring only task material into its isolated workspace. A successful procedure is
written and independently read back through permitted file tools in that workspace;
export it through the normal artifact path before removing the sandbox workspace.
Never mount a host Docker socket into an agent sandbox. A Gateway with daemon
access still has host authority; a dedicated VM/daemon is needed to isolate a
compromised Gateway from the host.

Tool restrictions do not stop provider requests: supplied task context is sent to
the configured model provider. Provider endpoints, inherited configuration, plugin
code, operating-system isolation, and existing secrets remain separate boundaries.
Do not merge this profile with unrestricted agent overrides and assume the same
posture survives.

Verification: JSON syntax and field contracts inspected against the existing
configuration schemas and sandbox documentation. Full schema admission, QuickJS,
Docker, provider, and Gateway execution remain unverified because checkout
dependencies and the user's machine are unavailable. Run normal configuration
validation and `openclaw sandbox explain --agent ironhead` in the dedicated
profile before starting real work; verify the effective tools and mounted paths.
