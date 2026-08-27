import openai
import httpx
client = openai.Client(
       base_url="https://72.146.43.227:8000/v1",
       api_key="123",
#      http_client=httpx.Client(headers={"Authorization": None}))
)

#client = openai.OpenAI(
#    base_url="http://localhost:8000/v1",
#    api_key="123",
#    http_client=httpx.Client(headers={})
#)
# Chat completion
response = client.chat.completions.create(
    model="Qwen3.8-Flash-Next",
    messages=[
        {"role": "system", "content": "You are a helpful AI assistant"},
        {"role": "user", "content": "what model are you? List 3 countries and their capitals."},
    ],
    temperature=0,
    max_tokens=6400,
)
print(f"Model: {response.model}")
print(response.choices[0].message.content)

