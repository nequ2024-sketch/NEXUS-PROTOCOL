---
name: GitHub upload authentication
description: This workspace's Replit GitHub integration and Git CLI authentication behavior.
---

An integration attachment alone may not authenticate Git CLI operations. Before staging or committing for a GitHub upload, verify that the configured remote can be read; if authentication fails, use Replit's Git pane to reconnect rather than repeating pushes.

**Why:** GitHub access was reported healthy by the integration tools, but the Git remote still rejected authentication and the integration status remained `not_added`.

**How to apply:** Confirm `git ls-remote` succeeds against the selected remote before preparing a commit or pushing any project files.
