#!/usr/bin/env node
/**
 * competitor-pain-mcp — zero-dependency stdio MCP server.
 *
 * Wraps the Apify actor `seanxin/b2b-buying-intent-pain-radar` and exposes a
 * single tool, `scan_competitor_pain`, to MCP clients over JSON-RPC 2.0 on
 * stdin/stdout. No runtime dependencies; uses the built-in fetch (Node >= 18).
 */

import { createInterface } from "node:readline";

const SERVER_NAME = "competitor-pain-mcp";
const SERVER_VERSION = "1.0.0";
const APIFY_ACTOR = "seanxin/b2b-buying-intent-pain-radar";
const APIFY_ENDPOINT =
  "https://api.apify.com/v2/acts/seanxin~b2b-buying-intent-pain-radar/run-sync-get-dataset-items";
const APIFY_ACTOR_PAGE = "https://apify.com/seanxin/b2b-buying-intent-pain-radar";

// Defaults mirror the actor's input schema (.actor/input_schema.json).
const DEFAULT_INPUT = {
  competitors: ["Instantly", "Apollo.io", "Lemlist", "Smartlead"],
  nicheKeywords: ["cold email", "cold outreach", "deliverability"],
  sources: ["hackernews", "reddit_rss", "github_issues", "devto"],
  subreddits: ["coldemail", "sales", "SaaS"],
  daysBack: 30,
  minIntentScore: 3,
  maxResults: 50,
};

const TOOL = {
  name: "scan_competitor_pain",
  description:
    "Scan HackerNews, Reddit, GitHub Issues, and Dev.to for B2B buying/switching " +
    "intent signals about the competitors you are tracking. Returns qualified leads " +
    "with an intent score, pain category, a verbatim snippet, a source URL, and a " +
    "non-spam safe reply angle.",
  inputSchema: {
    type: "object",
    properties: {
      competitors: {
        type: "array",
        items: { type: "string" },
        description:
          "Competitor / brand names to monitor for complaints and switching intent.",
      },
      nicheKeywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Category keywords to catch buyers asking for tool recommendations without naming a brand.",
      },
      sources: {
        type: "array",
        items: {
          type: "string",
          enum: ["hackernews", "reddit_rss", "github_issues", "devto"],
        },
        description: "Platforms to scan for buying intent signals.",
      },
      daysBack: {
        type: "integer",
        minimum: 1,
        maximum: 90,
        default: 30,
        description: "Only include discussions published within the last N days.",
      },
      minIntentScore: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        default: 3,
        description: "Filter out low-signal noise; 3+ indicates active pain or switching evaluation.",
      },
      maxResults: {
        type: "integer",
        minimum: 5,
        maximum: 500,
        default: 50,
        description: "Cap the number of returned signals.",
      },
    },
    required: ["competitors"],
    additionalProperties: false,
  },
};

function missingTokenMessage() {
  return (
 "Missing APIFY_TOKEN environment variable.\n\n" +
 "The `scan_competitor_pain` tool needs an Apify API token to call the " +
 `b2b-buying-intent-pain-radar actor. To fix:\n\n` +
 `  1. Create a personal access token at https://apify.com/account/integrations\n` +
 `  2. Export it in the environment that starts this server:\n` +
 `       export APIFY_TOKEN=apify_api_xxx\n` +
 `  3. Re-run the tool call.\n\n` +
 `Actor details: ${APIFY_ACTOR_PAGE}\n` +
 "Docs: https://docs.apify.com/api#section/Authentication"
  );
}

function toolText(text, isError = false) {
  return {
    content: [{ type: "text", text }],
    isError,
  };
}

function buildBody(args = {}) {
  return {
    competitors:
      Array.isArray(args.competitors) && args.competitors.length
        ? args.competitors
        : DEFAULT_INPUT.competitors,
    nicheKeywords: args.nicheKeywords ?? DEFAULT_INPUT.nicheKeywords,
    sources: args.sources ?? DEFAULT_INPUT.sources,
    subreddits: args.subreddits ?? DEFAULT_INPUT.subreddits,
    daysBack: args.daysBack ?? DEFAULT_INPUT.daysBack,
    minIntentScore: args.minIntentScore ?? DEFAULT_INPUT.minIntentScore,
    maxResults: args.maxResults ?? DEFAULT_INPUT.maxResults,
  };
}

function formatResults(items) {
  if (!items.length) {
    return (
 "No qualified buying-intent signals matched the given filters.\n" +
 "Try widening `daysBack`, lowering `minIntentScore`, or adding niche keywords."
    );
  }
  const lines = [`Found ${items.length} qualified buying-intent signal(s).`];
  items.forEach((it, i) => {
    lines.push("");
    lines.push(`#${i + 1}  [intent=${it.intentScore ?? "?"}] (${it.source ?? "unknown"}) ${it.title ?? ""}`);
    lines.push(`    url:        ${it.url ?? ""}`);
    lines.push(`    pain:       ${it.painCategory ?? ""}`);
    lines.push(`    keywords:   ${(Array.isArray(it.matchedKeywords) ? it.matchedKeywords : []).join(", ")}`);
    lines.push(`    published:  ${it.publishedAt ?? ""}   author: ${it.author ?? ""}`);
    lines.push(`    safe reply: ${it.safeReplyAngle ?? ""}`);
    lines.push(`    snippet:    ${JSON.stringify(it.snippet ?? "")}`);
  });
  return lines.join("\n");
}

async function scanCompetitorPain(args) {
  const token = (process.env.APIFY_TOKEN || "").trim();
  if (!token) {
    return toolText(missingTokenMessage(), true);
  }

  const url = `${APIFY_ENDPOINT}?token=${encodeURIComponent(token)}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(args)),
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return toolText(`Apify request failed (network): ${msg}`, true);
  }

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const detail =
      parsed && parsed.error && parsed.error.message
        ? parsed.error.message
        : text || "unknown error";
    return toolText(`Apify API error ${res.status}: ${detail}`, true);
  }

  // run-sync-get-dataset-items returns { data: [items], total, ... }; be defensive.
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && Array.isArray(parsed.data)
      ? parsed.data
      : [];
  return toolText(formatResults(items), false);
}

async function dispatch(msg) {
  // A JSON-RPC message without an "id" is a notification: process, no response.
  const isNotification = !("id" in msg);
  const id = msg.id;

  switch (msg.method) {
    case "initialize": {
      const requested = msg.params && msg.params.protocolVersion;
      const protocolVersion = requested ?? "2024-11-05";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions: "Call scan_competitor_pain to find qualified B2B buying-intent signals.",
        },
      };
    }
    case "tools/list": {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: [TOOL] },
      };
    }
    case "tools/call": {
      const name = msg.params && msg.params.name;
      const args = (msg.params && msg.params.arguments) || {};
      if (name === "scan_competitor_pain") {
        try {
          const result = await scanCompetitorPain(args);
          return { jsonrpc: "2.0", id, result };
        } catch (err) {
          const msgText = err && err.message ? err.message : String(err);
          return {
            jsonrpc: "2.0",
            id,
            result: toolText(`Unexpected error: ${msgText}`, true),
          };
        }
      }
      if (isNotification) return undefined;
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Unknown tool: ${name}` },
      };
    }
    default: {
      if (isNotification) {
        // Known notification (e.g. notifications/initialized) and anything else: no response.
        return undefined;
      }
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      };
    }
  }
}

function send(obj) {
  if (obj === undefined) return;
  process.stdout.write(JSON.stringify(obj) + "\n");
}

async function main() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      process.stderr.write(`[competitor-pain-mcp] ignoring malformed line: ${trimmed.slice(0, 200)}\n`);
      continue;
    }
    const response = await dispatch(msg);
    send(response);
  }
}

main().catch((err) => {
  process.stderr.write(`[competitor-pain-mcp] fatal: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
