from openai import OpenAI

client = OpenAI(
    api_key="dummy-key",                              # 上游 LiteLLM 的 key
    base_url="http://48.214.163.101:4000/v1",         # OpenAI 兼容端点
    default_headers={
        "x-lucia-sessionid": "session-1234",
        "x-lucia-traceid": "trace-5678",
        "x-lucia-agenttype": "agent-xyz"
    },
)

print("Testing simple completion...")
completion = client.chat.completions.create(
    model="azure/gpt-4.1",                            # 与 /v1/models 返回一致
    messages=[{"role": "user", "content": "why 2+2 is 4?"}],
)
print(completion)

