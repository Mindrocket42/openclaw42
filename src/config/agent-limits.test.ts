// Verifies bounded agent runtime limits.
import os from "node:os";
import { importFreshModule } from "openclaw/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";

async function importFreshAgentLimits(scope: string): Promise<typeof import("./agent-limits.js")> {
  return importFreshModule(import.meta.url, `./agent-limits.js?scope=${scope}`);
}

describe("resolveAgentMaxConcurrent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { availableParallelism: 1, expected: 4 },
    { availableParallelism: 2, expected: 4 },
    { availableParallelism: 8, expected: 8 },
    { availableParallelism: 12, expected: 8 },
    { availableParallelism: 48, expected: 8 },
  ])(
    "bounds the default for $availableParallelism available CPUs",
    async ({ availableParallelism, expected }) => {
      const availableParallelismSpy = vi
        .spyOn(os, "availableParallelism")
        .mockReturnValue(availableParallelism);
      const runtime = await importFreshAgentLimits(`parallelism-${availableParallelism}`);

      expect(runtime.resolveAgentMaxConcurrent()).toBe(expected);
      expect(runtime.resolveAgentMaxConcurrent()).toBe(expected);
      expect(availableParallelismSpy).toHaveBeenCalledOnce();
    },
  );

  it("falls back to the CPU list when availableParallelism is unavailable", async () => {
    const availableParallelismDescriptor = Object.getOwnPropertyDescriptor(
      os,
      "availableParallelism",
    );
    if (!availableParallelismDescriptor) {
      throw new Error("expected node:os.availableParallelism descriptor");
    }
    const cpu = {
      model: "test",
      speed: 0,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
    };
    const cpusSpy = vi.spyOn(os, "cpus").mockReturnValue(Array.from({ length: 6 }, () => cpu));
    Object.defineProperty(os, "availableParallelism", {
      ...availableParallelismDescriptor,
      value: undefined,
    });

    try {
      const runtime = await importFreshAgentLimits("cpus-fallback");
      expect(runtime.resolveAgentMaxConcurrent()).toBe(6);
      expect(cpusSpy).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(os, "availableParallelism", availableParallelismDescriptor);
    }
  });

  it.each([
    { limit: 3, expected: 3 },
    { limit: 256, expected: 16 },
  ])(
    "bounds an explicit limit of $limit to $expected without resolving the CPU default",
    async ({ limit, expected }) => {
      const availableParallelismSpy = vi.spyOn(os, "availableParallelism").mockReturnValue(48);
      const runtime = await importFreshAgentLimits(`explicit-override-${limit}`);

      expect(
        runtime.resolveAgentMaxConcurrent({ agents: { defaults: { maxConcurrent: limit } } }),
      ).toBe(expected);
      expect(availableParallelismSpy).not.toHaveBeenCalled();
    },
  );
});
