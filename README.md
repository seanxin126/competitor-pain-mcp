# competitor-pain-mcp

**Give Claude, Cursor, Windsurf, or Antigravity a live B2B Buying Intent Radar.**

Ask your AI assistant:
> *"Who is complaining about HubSpot or Datadog pricing this week, and what should I reply?"*

In seconds, this MCP server scans **Hacker News, Reddit, GitHub Issues, and Dev.to**, filters out noise and job spam, scores each thread **1–5 for buying intent**, and returns verbatim pain quotes, direct URLs, and a non-spam `safeReplyAngle`.

Powered by [SignalRadar on Apify Store](https://apify.com/seanxin/b2b-buying-intent-pain-radar) (`$0.015` per qualified signal — Apify's `$5` free tier covers ~330 clean leads).

## Quick Install (Claude Desktop / Cursor)

1. Get your Apify API token at [console.apify.com](https://console.apify.com/account/integrations).
2. Add to your `mcpServers` config:

```json
{
  "mcpServers": {
    "competitor-pain-radar": {
      "command": "node",
      "args": ["/path/to/competitor-pain-mcp/index.js"],
      "env": {
        "APIFY_TOKEN": "apify_api_YOUR_TOKEN"
      }
    }
  }
}
```

## Available Tool
- `scan_competitor_pain`: Monitors specified `competitors` and `nicheKeywords` across Hacker News, Reddit, GitHub Issues, and Dev.to, returning noise-filtered leads with `intentScore` (1–5), `painCategory`, `url`, `snippet`, and `safeReplyAngle`.
