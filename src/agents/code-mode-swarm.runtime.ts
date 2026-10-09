import { createHash } from "node:crypto";
import { stableStringify } from "@openclaw/normalization-core";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { emitSessionLifecycleEvent } from "../sessions/session-lifecycle-events.js";
import {
  captureAgentToolSourceExecutionGuard,
  runAgentToolSourceExecutionGuard,
} from "./agent-tool-source-execution-guard.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import { resolveAgentConfig } from "./agent-scope-config.js";
import { resolveConfiguredSubagentSpawnModelSelection } from "./model-selection.js";
import { resolveModelRuntimePolicy } from "./model-runtime-policy.js";
import type { PendingBridgeRequest } from "./code-mode-worker-types.js";
import type { AgentToolUpdateCallback } from "./runtime/index.js";
import {
  getSwarmRunByLaunchReplayKey,
  initSubagentRegistry,
} from "./subagents/registry/subagent-registry.js";
import type { SubagentRunRecord } from "./subagents/registry/subagent-registry.types.js";
import {
  SWARM_CODE_MODE_IDEMPOTENCY_KEY,
  SWARM_CODE_MODE_REQUEST_FINGERPRINT,
} from "./subagents/swarm/swarm-code-mode.js";
import {
  isCollectorSpawnTool,
  runWithJoinedCollectorSpawn,
} from "./subagents/swarm/swarm-collector-capability.js";
import { resolveSwarmConfig } from "./subagents/swarm/swarm-config.js";
import { isToolExecutionAllowed } from "./tool-policy-shared.js";
import type { ToolSearchRuntime } from "./tool-search-runtime.js";
import type { ToolSearchToolContext } from "./tool-search-types.js";
import {
  waitForCollectorCompletion,
  type CollectorCompletionResult,
} from "./tools/agents-wait-tool.js";
import { ToolInputError } from "./tools/common.js";
import { resolveInternalSessionKey, resolveMainSessionAlias } from "./tools/sessions-resolution.js";

function resolveCodeModeRequesterSessionKey(ctx: ToolSearchToolContext): string {
  const sessionKey = ctx.sessionKey?.trim();
  if (!sessionKey) {
    throw new ToolInputError("code mode swarm globals require session and run identity.");
  }
  const { mainKey, alias } = resolveMainSessionAlias(ctx.runtimeConfig ?? ctx.config ?? {});
  return resolveInternalSessionKey({ key: sessionKey, alias, mainKey });
}

function resolveCodeModeSwarmGroupId(ctx: ToolSearchToolContext): string {
  const sessionKey = resolveCodeModeRequesterSessionKey(ctx);
  const runId = ctx.runId?.trim();
  if (!runId) {
    throw new ToolInputError("code mode swarm globals require session and run identity.");
  }
  return `swarm:${sessionKey}:${runId}`;
}

function replayedSpawnResult(entry: SubagentRunRecord) {
  return {
    status: "accepted",
    runId: entry.swarmRunId ?? entry.runId,
    sessionKey: entry.childSessionKey,
    ...(entry.label ? { label: entry.label } : {}),
  };
}

function readOptionalStringOption(
  options: Record<string, unknown>,
  key: "label" | "model" | "thinking" | "agentId",
): string | undefined {
  const value = options[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolInputError(`agents.run ${key} must be a non-empty string.`);
  }
  return value.trim();
}

// Admission checks the configured agent's ordinary tool policy; the guest cannot
// create authority by calling a worker "read only" in its prompt or options.
// session_status is excluded because its model option mutates session state.
function assertReadOnlyReviewer(
  ctx: ToolSearchToolContext,
  agentId: string | undefined,
  modelOverride?: string,
): string {
  const cfg = ctx.runtimeConfig ?? ctx.config;
  if (!cfg || !agentId) {
    throw new ToolInputError("Read-only reviewer requires an explicit configured agentId and config.");
  }
  const agent = resolveAgentConfig(cfg, agentId);
  const tools = agent?.tools;
  const codeMode = tools?.codeMode;
  const codeModeDisabled = codeMode === false || (isRecord(codeMode) && codeMode.enabled === false);
  if (
    !tools ||
    !resolveAgentModelPrimaryValue(agent?.model) ||
    agent?.runtime?.type === "acp" ||
    Object.values(agent?.models ?? {}).some(
      (entry) => entry.codeMode !== undefined && entry.codeMode !== false,
    ) ||
    !Array.isArray(tools.allow) ||
    tools.allow.length === 0 ||
    tools.allow.some((name) => name !== "read") ||
    (tools.alsoAllow?.length ?? 0) > 0 ||
    Object.keys(tools.byProvider ?? {}).length > 0 ||
    (cfg?.tools?.alsoAllow?.length ?? 0) > 0 ||
    Object.keys(cfg?.tools?.byProvider ?? {}).length > 0 ||
    !codeModeDisabled ||
    tools.elevated?.enabled !== false
  ) {
    throw new ToolInputError(
      "Read-only reviewer requires an explicit configured agentId and primary model, a nonempty tools.allow limited to read, codeMode and elevated disabled, and no alsoAllow or byProvider expansions.",
    );
  }
  const selection = resolveConfiguredSubagentSpawnModelSelection({
    cfg,
    agentId,
    modelOverride,
    includeAgentPrimary: true,
  });
  const slash = selection?.indexOf("/") ?? -1;
  const policy =
    selection && slash > 0
      ? resolveModelRuntimePolicy({
          config: cfg,
          agentId,
          provider: selection.slice(0, slash),
          modelId: selection.slice(slash + 1),
        })
      : undefined;
  if (!selection || policy?.policy?.id !== "openclaw") {
    throw new ToolInputError("Read-only reviewer requires an explicitly configured openclaw model runtime.");
  }
  return selection;
}

async function runAgentSpawnBridge(params: {
  runtime: ToolSearchRuntime;
  parentToolCallId: string;
  request: PendingBridgeRequest;
  codeModeRunId: string;
  ctx: ToolSearchToolContext;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback;
}) {
  const prompt = params.request.args[0];
  const options = isRecord(params.request.args[1]) ? params.request.args[1] : {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new ToolInputError("agents.run prompt must be a non-empty string.");
  }
  const readOnly = options.readOnly;
  if (readOnly !== undefined && typeof readOnly !== "boolean") {
    throw new ToolInputError("agents.run readOnly must be boolean.");
  }
  const fastMode = options.fastMode;
  if (fastMode !== undefined && fastMode !== true && fastMode !== false && fastMode !== "auto") {
    throw new ToolInputError('agents.run fastMode must be boolean or "auto".');
  }
  const schema = options.schema;
  if (schema !== undefined && !isRecord(schema)) {
    throw new ToolInputError("agents.run schema must be a JSON schema object.");
  }
  const label = readOptionalStringOption(options, "label");
  const model = readOptionalStringOption(options, "model");
  const thinking = readOptionalStringOption(options, "thinking");
  const agentId = readOptionalStringOption(options, "agentId");
  const reviewerModel = readOnly === true ? assertReadOnlyReviewer(params.ctx, agentId, model) : undefined;
  const catalog = params.ctx.catalogRef?.current;
  const spawnEntry = catalog?.entries.find(
    (entry) => entry.name === "sessions_spawn" && isCollectorSpawnTool(entry.tool),
  );
  if (!catalog || !spawnEntry || !isCollectorSpawnTool(spawnEntry.tool)) {
    throw new ToolInputError("agents.run requires the native sessions_spawn tool.");
  }
  const spawnTool = spawnEntry.tool;
  const assertSourceActive = captureAgentToolSourceExecutionGuard(params.signal);
  const assertCurrent = () => {
    assertSourceActive();
    params.ctx.abortSignal?.throwIfAborted();
    if (
      params.ctx.catalogRef?.current !== catalog ||
      !catalog.entries.includes(spawnEntry) ||
      !resolveSwarmConfig(params.ctx.runtimeConfig ?? params.ctx.config, params.ctx.agentId)
        .enabled ||
      (params.ctx.toolExecutionAllow &&
        !isToolExecutionAllowed(params.ctx.toolExecutionAllow, "sessions_spawn"))
    ) {
      throw new ToolInputError("Joined collector spawn catalog is no longer active.");
    }
    if (readOnly === true) {
      if (assertReadOnlyReviewer(params.ctx, agentId, model) !== reviewerModel) {
        throw new ToolInputError("Read-only reviewer model changed during spawn.");
      }
    }
    runAgentToolSourceExecutionGuard(spawnTool);
  };
  assertCurrent();
  const spawnInput: Record<PropertyKey, unknown> = {
    task: prompt.trim(),
    collect: true,
    groupId: resolveCodeModeSwarmGroupId(params.ctx),
    ...(label ? { label } : {}),
    ...((reviewerModel ?? model) ? { model: reviewerModel ?? model } : {}),
    ...(thinking ? { thinking } : {}),
    ...(agentId ? { agentId } : {}),
    ...(fastMode !== undefined ? { fastMode } : {}),
    ...(schema ? { outputSchema: schema } : {}),
  };
  const requestFingerprint = `sha256:${createHash("sha256")
    .update(stableStringify(readOnly === true ? { ...spawnInput, readOnly: true } : spawnInput))
    .digest("hex")}`;
  // The registry persists this exact tuple and payload hash before launch.
  const idempotencyKey = `${params.codeModeRunId}:${params.request.id}`;
  const requesterSessionKey = resolveCodeModeRequesterSessionKey(params.ctx);
  let existing = getSwarmRunByLaunchReplayKey(
    idempotencyKey,
    requesterSessionKey,
    params.ctx.agentId,
  );
  if (existing) {
    if (existing.swarmLaunchRequestFingerprint !== requestFingerprint) {
      throw new ToolInputError("agents.run replay request does not match the persisted collector.");
    }
    if (existing.swarmLaunchPending === true) {
      if (!existing.queuedLaunch) {
        throw new ToolInputError("agents.run persisted launch reservation cannot be recovered.");
      }
      // Cold-start restore idempotently re-enqueues this durable launch before agentWait parks.
      initSubagentRegistry();
      existing =
        getSwarmRunByLaunchReplayKey(idempotencyKey, requesterSessionKey, params.ctx.agentId) ??
        existing;
      if (existing.swarmLaunchPending === true && !existing.queuedLaunch) {
        throw new ToolInputError("agents.run persisted launch reservation cannot be recovered.");
      }
    }
    assertCurrent();
    return replayedSpawnResult(existing);
  }
  Object.defineProperty(spawnInput, SWARM_CODE_MODE_IDEMPOTENCY_KEY, {
    value: idempotencyKey,
  });
  Object.defineProperty(spawnInput, SWARM_CODE_MODE_REQUEST_FINGERPRINT, {
    value: requestFingerprint,
  });
  const called = await runWithJoinedCollectorSpawn(
    spawnEntry.tool,
    assertCurrent,
    () => params.runtime.callExactId(spawnEntry.id, spawnInput, {
      parentToolCallId: params.parentToolCallId,
      signal: params.signal,
      onUpdate: params.onUpdate,
    }),
    readOnly === true ? (prepared) => {
      if (prepared.agentId !== agentId || prepared.model !== reviewerModel || prepared.collect !== true || prepared.runtime === "acp") {
        throw new ToolInputError("Read-only reviewer prepared spawn must retain its native agentId and collector mode.");
      }
      assertCurrent();
    } : undefined,
  );
  assertCurrent();
  const value =
    isRecord(called.result) && "details" in called.result ? called.result.details : called.result;
  if (!isRecord(value) || value.status !== "accepted" || typeof value.runId !== "string") {
    const detail =
      isRecord(value) && typeof value.error === "string"
        ? value.error
        : "collector spawn was not accepted";
    throw new ToolInputError(`agents.run spawn failed: ${detail}`);
  }
  return value;
}

async function runAgentWaitBridge(params: {
  request: PendingBridgeRequest;
  ctx: ToolSearchToolContext;
  signal?: AbortSignal;
}): Promise<CollectorCompletionResult> {
  const runId = params.request.args[0];
  if (typeof runId !== "string" || !runId.trim()) {
    throw new ToolInputError("agentWait run id must be a non-empty string.");
  }
  const rawSessionKey = params.ctx.sessionKey?.trim();
  if (!rawSessionKey) {
    throw new ToolInputError("agents.run wait requires session identity.");
  }
  const requesterSessionKey = resolveCodeModeRequesterSessionKey(params.ctx);
  return await waitForCollectorCompletion({
    runId: runId.trim(),
    currentSessionKeys: new Set([rawSessionKey, requesterSessionKey]),
    currentAgentId: params.ctx.agentId,
    config: params.ctx.runtimeConfig ?? params.ctx.config,
    signal: params.signal,
  });
}

function runSwarmNoteBridge(params: {
  request: PendingBridgeRequest;
  ctx: ToolSearchToolContext;
}): { ok: true } {
  const note = isRecord(params.request.args[0]) ? params.request.args[0] : undefined;
  const kind = note?.kind;
  const text = note?.text;
  if ((kind !== "phase" && kind !== "log") || typeof text !== "string" || !text.trim()) {
    throw new ToolInputError("swarmNote requires phase/log kind and non-empty text.");
  }
  const sessionKey = params.ctx.sessionKey?.trim();
  if (!sessionKey) {
    throw new ToolInputError("swarmNote requires session identity.");
  }
  emitSessionLifecycleEvent({
    sessionKey,
    reason: "swarm-note",
    scope: "runtime",
    swarmGroupId: resolveCodeModeSwarmGroupId(params.ctx),
    kind,
    text: text.trim(),
  });
  return { ok: true };
}

export const codeModeSwarmHandlers = {
  agentSpawn: runAgentSpawnBridge,
  agentWait: runAgentWaitBridge,
  swarmNote: runSwarmNoteBridge,
};
