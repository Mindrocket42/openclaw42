import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { describe, it } from "vitest";
import { CODE_MODE_CONTROLLER_SOURCE } from "./code-mode-controller-source.js";

function harness(completions: Record<string, unknown>[], readAvailable = true, mismatch: boolean | "truncated" = false) {
  const calls: { method: string; args: unknown[] }[] = [];
  const pending: { method: string; id: string }[] = [];
  let count = 0;
  const ctx = createContext({
    __openclawSwarmEnabled: true,
    __openclawCatalog: readAvailable ? [{callableName:"nativeRead",name:"read",source:"openclaw"}] : [],
    savedBytes: "",
    __openclawMaxPendingToolCalls: 4,
    __openclawHostRequest: (method: string, payload: string, id: string) => {
      calls.push({ method, args: JSON.parse(payload) });
      pending.push({ method, id });
    },
    __openclawHostCancelRequest: () => {},
  });
  runInContext(CODE_MODE_CONTROLLER_SOURCE, ctx);
  const execute = async (extra = "") => {
    const promise = runInContext(`agents.juggle({
      request: "Fix the actual outcome", reviewerAgentId:"reviewer", acceptance: "Evidence supports original intent",
      lanes: [{id:"repair", owner:"implementer", prompt:"Resolve", method:"first", resources:["src/repair"]}],
      retain: async (bytes) => {savedBytes=bytes; return "PROCEDURES.md";},
      ${extra}
    })`, ctx);
    let done = false;
    void promise.then(() => { done = true; }, () => { done = true; });
    for (let turn = 0; !done && turn < 200; turn++) {
      runInContext("__openclawDrainQueuedRequests()", ctx);
      for (const request of pending.splice(0)) {
        const value = request.method === "agentSpawn" ? { runId: "run-" + (++count) } :
          request.method === "callValue" ? {kind:mismatch === "truncated" ? "truncated" : "text",content:mismatch === true ? "forged" : ctx.savedBytes} :
            (() => { const completion = completions.shift(); return completion ?
              {runId:"run-" + count,sessionKey:"agent:worker:" + count,...completion} : undefined; })();
        assert.ok(value, "unexpected collector request");
        ctx.__openclawSettleBridge(request.id, true, JSON.stringify(value));
      }
      await Promise.resolve();
    }
    assert.ok(done, "controller did not terminate within bounded microtasks");
    return await promise;
  };
  return { execute, calls };
}
const worker = (overrides: Record<string, unknown> = {}) => ({
  status: "done", result: "Changed and verified", usage: {inputTokens: 10, outputTokens: 5}, ...overrides,
});
const reviewer = (decision: string, repairs: Record<string, unknown>[] = [], extra = {}) => worker({
  structured: {decision, reason:"Concrete evidence", repairs, ...extra},
});

describe("registered Code Mode agents.juggle", () => {
  it("reviews original intent, corrects drift, and retains the proven procedure", async () => {
    const { execute, calls } = harness([
      worker(), reviewer("repair", [{id:"repair", prompt:"Fix drift", method:"second"}]),
      worker(), reviewer("satisfied"),
    ]);
    const result = await execute();
    assert.equal(result.status, "satisfied");
    assert.equal(result.tokens, 60);
    assert.equal(result.launches, 4);
    assert.equal(result.procedure.verified, true);
    const reviews = calls.filter((call) => call.method === "agentSpawn" &&
      String(call.args[0]).startsWith("Act as an independent"));
    assert.equal(reviews.length, 2);
    assert.ok(reviews.every((call) => (call.args[1] as Record<string, unknown>).readOnly === true));
    assert.ok(reviews.every((call) => String(call.args[0]).includes("Fix the actual outcome")));
  });
  it("rejects overlapping resources before spawning", async () => {
    const { execute, calls } = harness([]);
    await assert.rejects(execute(`lanes:[
      {id:"a",owner:"a",prompt:"a",method:"a",resources:["src"]},
      {id:"b",owner:"b",prompt:"b",method:"b",resources:["src/repair"]}]`), /disjoint resources/);
    assert.equal(calls.length, 0);
  });
  it("rejects aliases and overlaps inside a lane without creating children", async () => {
    for (const resources of [["a/../b"], ["./b"], ["b/"], ["a", "a/b"], ["b", "b"]]) {
      const { execute, calls } = harness([]);
      await assert.rejects(execute(`lanes:[{id:"a",owner:"a",prompt:"a",method:"a",resources:${JSON.stringify(resources)}}]`), /canonical disjoint/);
      assert.equal(calls.length, 0);
    }
  });
  it("requires a reviewer and bounds retained UTF-8 procedure bytes", async () => {
    const missing = harness([]);
    await assert.rejects(missing.execute("reviewerAgentId:undefined"), /reviewerAgentId/);
    assert.equal(missing.calls.length, 0);
    const oversized = harness([worker(), reviewer("satisfied")]);
    assert.equal((await oversized.execute('request:"あ".repeat(12000)')).reason, "procedure_size_limit");
    assert.equal(oversized.calls.filter((call) => call.method === "callValue").length, 0);
  });
  it("stops new admission at budget exhaustion or missing usage", async () => {
    for (const completion of [worker(), worker({usage:undefined})]) {
      const { execute, calls } = harness([completion]);
      const result = await execute("tokenBudget: 15");
      assert.equal(result.status, "blocked");
      assert.equal(calls.filter((call) => call.method === "agentSpawn").length, 1);
      assert.ok(["token_budget", "usage_unavailable"].includes(result.reason));
    }
  });
  it("halts two failed same-method attempts instead of manufacturing retries", async () => {
    const repair = {id:"repair",prompt:"Again",method:"first"};
    const { execute } = harness([
      worker({status:"failed"}), reviewer("repair", [repair]),
      worker({status:"failed"}), reviewer("repair", [repair]),
      reviewer("repair", [repair]), reviewer("repair", [repair]),
    ]);
    const result = await execute();
    assert.equal(result.reason, "method_change_required");
    assert.equal(result.launches, 6);
  });
  it("uses bounded reviewer diagnostics to change a failed method autonomously", async () => {
    const repair = {id:"repair",prompt:"Again",method:"first"};
    const { execute } = harness([
      worker({status:"failed"}), reviewer("repair", [repair]),
      worker({status:"failed"}), reviewer("repair", [repair]),
      reviewer("repair", [{...repair,method:"changed"}]), worker(), reviewer("satisfied"),
    ]);
    const result = await execute();
    assert.equal(result.status, "satisfied");
    assert.equal(result.launches, 7);
    assert.equal(result.evidence.at(-1).method, "changed");
  });
  it("repairs retention once without repeating successful workers", async () => {
    const { execute } = harness([worker(), reviewer("satisfied")]);
    const result = await execute(`retain: (() => {let attempts=0; return async (bytes) => {
      if (++attempts === 1) throw new Error("temporary write failure");
      savedBytes=bytes; return "PROCEDURES.md";
    };})()`);
    assert.equal(result.status, "satisfied");
    assert.equal(result.launches, 2);
  });
  it("propagates retention cancellation rather than retrying it", async () => {
    const { execute } = harness([worker(), reviewer("satisfied")]);
    await assert.rejects(execute(`retain:async()=>{const error=new Error("cancelled");error.name="AbortError";throw error;}`), /cancelled/);
  });
  it("never reports success without verified retention", async () => {
    const { execute } = harness([worker(), reviewer("satisfied")]);
    assert.equal((await execute("retain:async()=>({path:'PROCEDURES.md'})")).reason, "procedure_retention_failed");
  });
  it("independently rejects forged retention, mismatched bytes, and missing native read", async () => {
    for (const [readAvailable, mismatch] of [[true, true], [true, "truncated"], [false, false]] as const) {
      const { execute } = harness([worker(), reviewer("satisfied")], readAvailable, mismatch);
      const result = await execute();
      assert.equal(result.status, "blocked");
      assert.equal(result.reason, readAvailable ? "procedure_retention_failed" : "procedure_read_unavailable");
    }
  });
  it("requires classified missing authority/material input for human escalation", async () => {
    for (const classified of [false, true]) {
      const { execute } = harness([worker(), reviewer("needs_human", [], classified ? {humanNeed:"authority"} : {})]);
      assert.equal((await execute()).status, classified ? "needs_human" : "blocked");
    }
  });
});
