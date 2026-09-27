// Resolves per-agent runtime limits from config.
import os from "node:os";
import { resolveOptionalIntegerOption } from "@openclaw/normalization-core/number-coercion";
import type { OpenClawConfig } from "./types.js";

const MIN_AGENT_MAX_CONCURRENT = 4;
const MAX_AGENT_MAX_CONCURRENT = 8;
const MAX_CONFIGURED_AGENT_MAX_CONCURRENT = 16;
const MAX_CONFIGURED_SUBAGENT_MAX_CONCURRENT = 8;
let defaultAgentMaxConcurrent: number | undefined;

function resolveDefaultAgentMaxConcurrent(): number {
  if (defaultAgentMaxConcurrent === undefined) {
    // Prefer the quota-aware count on modern Node; retain the CPU-list fallback
    // for runtimes where availableParallelism is absent.
    const availableParallelism =
      typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
    defaultAgentMaxConcurrent = Math.min(
      MAX_AGENT_MAX_CONCURRENT,
      Math.max(MIN_AGENT_MAX_CONCURRENT, availableParallelism),
    );
  }
  return defaultAgentMaxConcurrent;
}

/** Default maximum concurrent child-agent runs per immediate spawning/controller session. */
export const DEFAULT_SUBAGENT_MAX_CONCURRENT = 4;
/** Default maximum direct children a single agent run may spawn. */
export const DEFAULT_SUBAGENT_MAX_CHILDREN_PER_AGENT = 4;
/** Default age before completed subagent state is archived. */
export const DEFAULT_SUBAGENT_ARCHIVE_AFTER_MINUTES = 60;
// Direct children are leaves by default; explicit config may opt into deeper delegation.
export const DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH = 1;
export function isSubagentSpawnDepthAllowed(
  depth: number,
  maxSpawnDepth = DEFAULT_SUBAGENT_MAX_SPAWN_DEPTH,
): boolean {
  return depth < maxSpawnDepth;
}

/** Resolves top-level agent concurrency, flooring finite values and clamping to at least one. */
export function resolveAgentMaxConcurrent(cfg?: OpenClawConfig): number {
  const configured = resolveOptionalIntegerOption(cfg?.agents?.defaults?.maxConcurrent, { min: 1 });
  return configured === undefined
    ? resolveDefaultAgentMaxConcurrent()
    : Math.min(configured, MAX_CONFIGURED_AGENT_MAX_CONCURRENT);
}

/** Resolves per-session subagent concurrency, flooring finite values and clamping to at least one. */
export function resolveSubagentMaxConcurrent(cfg?: OpenClawConfig): number {
  const configured = resolveOptionalIntegerOption(
    cfg?.agents?.defaults?.subagents?.maxConcurrent,
    { min: 1 },
  );
  return configured === undefined
    ? DEFAULT_SUBAGENT_MAX_CONCURRENT
    : Math.min(configured, MAX_CONFIGURED_SUBAGENT_MAX_CONCURRENT);
}
