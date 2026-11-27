---
name: competitor-pain-radar
description: Find live B2B buyers complaining about competitors, hitting pricing walls, or asking for alternatives across Hacker News, Reddit, GitHub Issues, and Dev.to, with 1-5 intent scoring and safe reply angles.
---

# Competitor Pain Radar Skill

When the user asks to find customers switching from a competitor, monitor competitor complaints, or generate high-intent B2B leads:

1. Call the `scan_competitor_pain` MCP tool (backed by Apify Actor `seanxin/b2b-buying-intent-pain-radar`).
2. Pass `competitors` (e.g., `["HubSpot", "Apollo.io", "Datadog"]`), `daysBack` (default `30`), and `minIntentScore` (`4` for urgent switching signals).
3. Present each result with:
   - Intent Score (`1-5`) and `painCategory`
   - Verbatim quote (`snippet`)
   - Direct clickable `url`
   - Recommended value-first `safeReplyAngle` (never spam links).
