---
name: knowledge-category
user-invocable: false
description: "Use when: categorizing documents from Shang Raw into durable knowledge category pages with summaries, hashes, and source grounding."
---

# Knowledge Category Skill

Use this skill when documents from `Raw/` need to be organized into durable knowledge categories.

The current prototype still performs local rule-based category assignment in code. This skill captures the intended behavior for the future LLM-backed categorizer: classify documents by purpose, summarize them, preserve file hashes, and keep generated category pages source-grounded.
