#!/usr/bin/env node
/**
 * Spawns `node index.js` over a stdio JSON-RPC pipe and verifies:
 *   1. initialize handshake
 *   2. tools/list returns scan_competitor_pain with the right schema
 *   3. missing-token error handling on tools/call
 *
 * Run: `node test_mcp.mjs`
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, "index.js");

function startServer(env) {
  const child = spawn(process.execPath, [SERVER], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map();
  const stderr = [];
  let buf = "";

  child.stdout.on("data", (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  child.stderr.on("data", (d) => stderr.push(d.toString()));

  let nextId = 0;
  const request = (method, params) => {
    const id = ++nextId;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout waiting for response to ${method}`));
        }
      }, 8000);
    });
  };
  const notify = (method, params) => {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  };
  return { child, request, notify, stderr };
}

const cleanEnv = { ...process.env, PATH: process.env.PATH };
delete cleanEnv.APIFY_TOKEN;

const { child, request, notify, stderr } = startServer(cleanEnv);

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (err) {
    results.push(`FAIL  ${name}: ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  }
}

try {
  // 1. initialize
  await check("initialize handshake", async () => {
    const res = await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0.0.0" },
    });
    assert.ok(res.result, "initialize returned no result");
    assert.equal(res.result.serverInfo.name, "competitor-pain-mcp");
    assert.ok(res.result.protocolVersion, "no protocolVersion echoed");
    assert.ok(res.result.capabilities.tools, "tools capability not advertised");
  });

  // 2. notifications/initialized should not produce a response; send it anyway.
  notify("notifications/initialized");

  // 3. tools/list
  await check("tools/list exposes scan_competitor_pain", async () => {
    const res = await request("tools/list", {});
    assert.ok(Array.isArray(res.result.tools), "tools missing");
    const tool = res.result.tools.find((t) => t.name === "scan_competitor_pain");
    assert.ok(tool, "scan_competitor_pain not listed");
    assert.ok(tool.inputSchema.properties, "no inputSchema.properties");
    for (const f of [
      "competitors",
      "nicheKeywords",
      "sources",
      "daysBack",
      "minIntentScore",
      "maxResults",
    ]) {
      assert.ok(tool.inputSchema.properties[f], `inputSchema missing ${f}`);
    }
    assert.deepEqual(
      tool.inputSchema.required,
      ["competitors"],
      "competitors must be the only required field"
    );
  });

  // 4. missing-token error handling
  await check("tools/call without APIFY_TOKEN returns clean error", async () => {
    const res = await request("tools/call", {
      name: "scan_competitor_pain",
      arguments: { competitors: ["Instantly"] },
    });
    assert.ok(res.result, "tools/call returned no result");
    assert.equal(res.result.isError, true, "expected isError=true when token missing");
    const text = (res.result.content || []).map((c) => c.text || "").join("");
    assert.ok(text.includes("APIFY_TOKEN"), "error text does not mention APIFY_TOKEN");
    assert.ok(
      text.includes("https://apify.com/seanxin/b2b-buying-intent-pain-radar"),
      "error text missing actor link"
    );
  });

  child.kill();
} catch (err) {
  results.push(`FAIL  unexpected: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 1;
  child.kill();
}

// Wait a beat for the child to flush + exit.
await new Promise((r) => setTimeout(r, 100));

console.log(results.join("\n"));
if (stderr.join("").trim()) {
  console.log("\n[server stderr]\n" + stderr.join("").trim());
}
console.log(process.exitCode ? "\nRESULT: FAILED" : "\nRESULT: PASSED");

process.on("exit", () => {
  if (!child.killed) child.kill();
});
