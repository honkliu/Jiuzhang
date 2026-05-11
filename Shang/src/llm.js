export function hasLlmConfig(config) {
  return Boolean(config.llm?.baseUrl && config.llm?.apiKey && config.llm?.model);
}

export async function completeWithLlm(config, messages) {
  if (!hasLlmConfig(config)) {
    return null;
  }

  const endpoint = `${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.llm.apiKey}`
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: 0.2,
      stream: false
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed ${response.status}: ${body}`);
  }

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content ?? '';
}
