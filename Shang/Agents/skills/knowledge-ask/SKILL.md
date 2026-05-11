---
name: knowledge-ask
user-invocable: false
description: "Use when: answering questions about documents in Shang Raw using retrieved local excerpts, source grounding, and optional LLM summarization."
---

# Knowledge Ask Skill

Use this skill when the user asks a question about documents stored under `Raw/`.

The skill must answer only from the supplied local source excerpts. If the excerpts are insufficient, say what is missing instead of guessing. Prefer concise answers with source file names inline.

The retrieval step is handled by Shang before this skill runs. This skill is responsible for reading the retrieved excerpts, judging relevance, summarizing the answer, and preserving source grounding.
