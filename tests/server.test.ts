import assert from "node:assert/strict";
import test from "node:test";

import { hostnameIsAllowed } from "../src/web/server.js";

test("hostnameIsAllowed accepts local and configured public hosts", () => {
  const previousAllowedHosts = process.env.LUDIARS_ALLOWED_HOSTS;
  process.env.LUDIARS_ALLOWED_HOSTS = "sartor.example.com, .preview.example.com";
  try {
    assert.ok(hostnameIsAllowed("localhost"));
    assert.ok(hostnameIsAllowed("127.0.0.1"));
    assert.ok(hostnameIsAllowed("sartor.example.com"));
    assert.ok(hostnameIsAllowed("sartor.preview.example.com"));
    assert.ok(hostnameIsAllowed("preview.example.com"));
    assert.ok(!hostnameIsAllowed("untrusted.example.com"));
    assert.ok(!hostnameIsAllowed("preview.example.com.attacker.test"));
  } finally {
    if (previousAllowedHosts === undefined) {
      delete process.env.LUDIARS_ALLOWED_HOSTS;
    } else {
      process.env.LUDIARS_ALLOWED_HOSTS = previousAllowedHosts;
    }
  }
});
