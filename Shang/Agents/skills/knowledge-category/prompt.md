# Knowledge Category Prompt

Agent: {{agentName}}
Date: {{date}}

Document path:
{{path}}

Document excerpt:
{{excerpt}}

Choose the best category for this document and explain why.

Allowed categories:

- code
- product
- research
- personal
- writing
- uncategorized

Return a concise JSON object with `category`, `confidence`, `summary`, and `reason`.
