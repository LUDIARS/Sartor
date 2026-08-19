import assert from "node:assert/strict";
import test from "node:test";

import {
  ClaudeCliExecutionError,
  resolveClaudeCliModel,
} from "../src/llm/claude-cli-runner.js";

test("resolveClaudeCliModel uses the default for an empty setting", () => {
  assert.equal(resolveClaudeCliModel("  "), "claude-opus-5");
});

test("resolveClaudeCliModel rejects shell metacharacters", () => {
  assert.throws(
    () => resolveClaudeCliModel("claude-opus-5 & whoami"),
    ClaudeCliExecutionError,
  );
});

test("resolveClaudeCliModel rejects values that could become CLI options", () => {
  assert.throws(
    () => resolveClaudeCliModel("--dangerous-option"),
    ClaudeCliExecutionError,
  );
});
