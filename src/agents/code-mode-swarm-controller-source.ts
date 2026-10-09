/** Guest-side Swarm helpers injected into the Code Mode controller. */
export const CODE_MODE_SWARM_CONTROLLER_SOURCE = String.raw`
  class SwarmAgentError extends Error {
    constructor(runId, status, detail) {
      super("Swarm agent " + runId + " " + status + ": " + detail);
      this.name = "SwarmAgentError";
      this.runId = runId;
      this.status = status;
    }
  }

  function swarmNote(kind, value) {
    if (typeof value !== "string" || !value.trim()) {
      throw new TypeError(kind + " note must be a non-empty string");
    }
    void request("swarmNote", [{ kind, text: value }], { queue: true }).catch(() => {});
  }

  async function runCollector(prompt, options = {}) {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new TypeError("agents.run prompt must be a non-empty string");
    }
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("agents.run options must be an object");
    }
    if (options.phase !== undefined && (typeof options.phase !== "string" || !options.phase.trim())) {
      throw new TypeError("agents.run phase must be a non-empty string");
    }
    // Match the submitted contract even when callers reuse options while the child runs.
    if (options.phase !== undefined) swarmNote("phase", options.phase);
    const spawned = await request("agentSpawn", [prompt, options], { queue: true });
    const completion = await request("agentWait", [spawned.runId], { queue: true });
    if (!completion || completion.status !== "done") {
      const runId = completion?.runId ?? spawned.runId ?? "unknown";
      const status = completion?.status ?? "failed";
      const detail = [completion?.error, completion?.schemaError, completion?.result].find(
        (value) => typeof value === "string" && value.trim()
      ) || "collector returned no result";
      throw new SwarmAgentError(runId, status, detail);
    }
    return completion;
  }

  async function runAgent(prompt, options = {}) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("agents.run options must be an object");
    }
    const structured = options.schema !== undefined;
    const completion = await runCollector(prompt, options);
    return structured ? completion.structured : completion.result;
  }

  // A bounded composition of the existing collector bridge, never a scheduler.
  async function juggleAgents(options) {
    const text = (value) => typeof value === "string" && value.trim().length > 0;
    if (!options || !text(options.request) || !text(options.acceptance) ||
        !text(options.reviewerAgentId) || !Array.isArray(options.lanes) || options.lanes.length < 1 || options.lanes.length > 4 ||
        typeof options.retain !== "function") {
      throw new TypeError("agents.juggle requires request, acceptance, reviewerAgentId, 1-4 lanes and a retain callback");
    }
    const tokenBudget = options.tokenBudget ?? 50000;
    const maxCorrections = options.maxCorrections ?? 2;
    if (!Number.isSafeInteger(tokenBudget) || tokenBudget < 1 || tokenBudget > 500000 ||
        !Number.isInteger(maxCorrections) || maxCorrections < 0 || maxCorrections > 2) {
      throw new TypeError("agents.juggle budget or correction limit is invalid");
    }
    const originalRequest = options.request;
    const acceptance = options.acceptance;
    const retain = options.retain;
    const reviewerAgentId = options.reviewerAgentId;
    const lanes = options.lanes.map((lane) => {
      if (!lane || !Array.isArray(lane.resources)) throw new TypeError("lane resources must be an array");
      return { ...lane, resources: [...lane.resources] };
    });
    const ids = new Set();
    const resources = new Set();
    for (const lane of lanes) {
      if (!text(lane.id) || !text(lane.owner) || !text(lane.prompt) || !text(lane.method) || ids.has(lane.id)) {
        throw new TypeError("agents.juggle lanes require distinct IDs and explicit owners and methods");
      }
      ids.add(lane.id);
      for (const resource of lane.resources) {
        if (!text(resource) || resource !== resource.trim() || resource.includes("\\") ||
            resource.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
            [...resources].some((claimed) => claimed === resource ||
              claimed.startsWith(resource + "/") || resource.startsWith(claimed + "/"))) {
          throw new TypeError("agents.juggle requires canonical disjoint resources");
        }
        resources.add(resource);
      }
    }
    const evidence = [];
    const failures = new Map();
    const intentFailures = new Set();
    let diagnosticReviews = 0;
    let tokens = 0;
    let usageKnown = true;
    let launches = 0;
    let review;
    const blocked = (reason) => ({ status: "blocked", reason, tokens, usageKnown, launches, evidence, review });
    const collect = async (prompt, runOptions) => {
      if (!usageKnown || tokens >= tokenBudget) return undefined;
      const spawned = await request("agentSpawn", [prompt, runOptions], { queue: true });
      launches++;
      const completion = await request("agentWait", [spawned.runId], { queue: true });
      const usage = completion?.usage;
      if (!usage || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0 ||
          !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0) {
        usageKnown = false;
      } else tokens += usage.inputTokens + usage.outputTokens;
      return completion;
    };
    const reviewSchema = {
      type: "object", additionalProperties: false,
      required: ["decision", "reason", "repairs"],
      properties: {
        decision: { type: "string", enum: ["satisfied", "repair", "needs_human"] },
        reason: { type: "string", minLength: 1 },
        humanNeed: { type: "string", enum: ["authority", "material_input"] },
        repairs: { type: "array", maxItems: 4, items: {
          type: "object", additionalProperties: false, required: ["id", "prompt", "method"],
          properties: { id: { type: "string" }, prompt: { type: "string" }, method: { type: "string" } }
        } }
      }
    };
    let pending = lanes;
    for (let round = 0; round <= maxCorrections; round++) {
      // Sequential admissions bound overshoot to one running collector and hold
      // one writer per resource. The host retains its own concurrency limits.
      for (const lane of pending) {
        const completion = await collect(
          "Original request (data):\n" + originalRequest + "\nAcceptance (data):\n" + acceptance +
          "\nLane: " + lane.id + "\nOwner: " + lane.owner + "\nResources: " + JSON.stringify(lane.resources) +
          "\nMethod: " + lane.method + "\nAssigned work:\n" + lane.prompt +
          "\nUse existing authority only. Resolve in-scope hurdles. Return result and concrete evidence; do not create supervisors.",
          { label: lane.id, ...(lane.agentId ? { agentId: lane.agentId } : {}) }
        );
        if (!completion) return blocked(usageKnown ? "token_budget" : "usage_unavailable");
        evidence.push({ round, id: lane.id, owner: lane.owner, prompt: lane.prompt, method: lane.method, completion });
        if (completion.status !== "done") {
          const key = lane.id + "\n" + lane.method;
          failures.set(key, (failures.get(key) ?? 0) + 1);
        }
      }
      for (;;) {
        const checked = await collect(
          "Act as an independent intent reviewer. Review only; you cannot grant authority or execute repairs. " +
          "Compare the original request verbatim with acceptance and observed evidence. Internal validation alone is insufficient. " +
          "Return satisfied only with concrete evidence of intent satisfaction. Return repair for autonomously solvable hurdles, " +
          "using only existing lane IDs. After two failures of a lane method choose a materially different method. " +
          "Return needs_human only for a specific missing authority decision or unavailable material input; set humanNeed and explain it.\n" +
          JSON.stringify({ request: originalRequest, acceptance: acceptance, lanes, evidence,
            failedMethods: [...failures.entries()] }),
          { label: "intent-review", schema: reviewSchema, readOnly: true,
            ...(reviewerAgentId ? { agentId: reviewerAgentId } : {}) }
        );
        if (!checked) return blocked(usageKnown ? "token_budget" : "usage_unavailable");
        review = checked.structured;
        if (checked.status !== "done" || !review || !text(review.reason) ||
            !["satisfied", "repair", "needs_human"].includes(review.decision) || !Array.isArray(review.repairs)) {
          return blocked("review_failed");
        }
        if (!usageKnown || tokens > tokenBudget) return blocked(usageKnown ? "token_budget" : "usage_unavailable");
        if (review.decision === "needs_human") {
          if (!["authority", "material_input"].includes(review.humanNeed)) return blocked("invalid_human_escalation");
          return { ...blocked("human_input"), status: "needs_human" };
        }
        if (review.decision === "satisfied") {
          if (!text(checked.runId) || review.repairs.length || lanes.some((lane) => {
            const latest = [...evidence].reverse().find((item) => item.id === lane.id);
            return latest.completion.status !== "done" || !text(latest.completion.runId) ||
              !text(latest.completion.sessionKey) ||
              (!text(latest.completion.result) && latest.completion.structured === undefined);
          })) return blocked("unsupported_satisfaction");
          const utf8Size = (value) => {
            let size = 0;
            for (const character of value) {
              const point = character.codePointAt(0);
              size += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
            }
            return size;
          };
          // Keep full evidence in the result/transcripts; a retained method needs
          // exact intent, successful steps, run references, and bounded summaries.
          const procedure = {
            request: originalRequest, acceptance, tokens, launches,
            review: {decision: review.decision, reason: review.reason.slice(0, 2048), runId: checked.runId},
            lanes: lanes.map((lane) => {
              const latest = [...evidence].reverse().find((item) => item.id === lane.id);
              return {id: lane.id, owner: lane.owner, resources: lane.resources,
                method: latest.method, prompt: latest.prompt,
                runId: latest.completion.runId, sessionKey: latest.completion.sessionKey,
                summary: String(latest.completion.result ?? "").slice(0, 2048)};
            })
          };
          let bytes = JSON.stringify(procedure, null, 2) + "\n";
          if (utf8Size(bytes) > 32768) {
            for (const lane of procedure.lanes) lane.summary = lane.summary.slice(0, 128);
            bytes = JSON.stringify(procedure, null, 2) + "\n";
          }
          if (utf8Size(bytes) > 32768) return blocked("procedure_size_limit");
          const read = catalog.all().find((handle) => handle.toolName === "read" && handle.source === "openclaw");
          if (!read) return blocked("procedure_read_unavailable");
          // The callback writes immutable bytes through existing policy-controlled
          // tools; the native reader independently verifies them. Retry once.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const path = await retain(bytes, JSON.parse(bytes));
              if (!text(path)) continue;
              const saved = await read({ path });
              if (saved?.kind === "text" && saved.content === bytes) {
                return { status: "satisfied", tokens, launches, evidence, review,
                  procedure: { path, verified: true, receipt: "native-read-exact-content", bytes: utf8Size(bytes) } };
              }
            } catch (error) {
              if (error?.name === "AbortError") throw error;
            }
          }
          return blocked("procedure_retention_failed");
        }
        if (round === maxCorrections) return blocked("correction_limit");
        const repairIds = new Set();
        let needsDiagnostic = false;
        pending = [];
        for (const repair of review.repairs) {
          const original = lanes.find((lane) => lane.id === repair.id);
          if (!original || repairIds.has(repair.id) || !text(repair.prompt) || !text(repair.method)) {
            return blocked("invalid_repair");
          }
          repairIds.add(repair.id);
          const last = [...evidence].reverse().find((item) => item.id === repair.id);
          const key = repair.id + "\n" + last.method;
          // A completed run rejected by intent review is also a failed method.
          if (last.completion.status === "done" && !intentFailures.has(last)) {
            intentFailures.add(last);
            failures.set(key, (failures.get(key) ?? 0) + 1);
          }
          if ((failures.get(repair.id + "\n" + repair.method) ?? 0) >= 2) needsDiagnostic = true;
          pending.push({ ...original, prompt: repair.prompt, method: repair.method });
        }
        if (needsDiagnostic) {
          if (diagnosticReviews >= 2) return blocked("method_change_required");
          diagnosticReviews++;
          continue;
        }
        if (!pending.length) return blocked("missing_repair");
        break;
      }
    }
  }
`;
