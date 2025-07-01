import openai
import httpx
client = openai.Client(
       base_url="http://4.151.212.118:30000/v1",
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
    model="default",
        messages=[
                    {"role": "system", "content": "You are a helpful AI assistant"},
                    {"role": "user", "content": "List 3 countries and their capitals."},
            ],
        temperature=0,
        max_tokens=6400,
        )
print(response)

