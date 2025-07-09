import asyncio
import json
from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import LLMExtractionStrategy
from pydantic import BaseModel

# 🔧 Configuration
TARGET_URL = "https://news.sina.com.cn"        # ← Replace with your starting URL
MAX_DEPTH = 2                             # Controls how deep to crawl
DEEPSEEK_API_URL = "http://40.83.55.66:8000/v1"  # Your self-hosted DeepSeek-compatible API endpoint
DEEPSEEK_API_KEY = "123"         # If authentication is required; leave empty if not

# 🧠 Define structure for extracted content
class Page(BaseModel):
    url: str
    content: str

# 📚 Build extraction strategy using your LLM
def get_strategy():
    return LLMExtractionStrategy(
        provider="openai/compatible",       # Use compatible mode for self-hosted models
        api_token=DEEPSEEK_API_KEY,
        api_base=DEEPSEEK_API_URL,
        schema=Page.schema(),
        instruction="Extract the main textual content of this page. Skip headers, footers, navigation menus, and any repetitive layout elements. Return only clean readable text."
    )

# 🕸️ Crawling logic
async def run():
    async with AsyncWebCrawler(verbose=True) as crawler:
        strategy = get_strategy()
        result = await crawler.arun(
            url=TARGET_URL,
            max_depth=MAX_DEPTH,
            extraction_strategy=strategy
        )

        # Save output in JSON format — each item has 'url' and 'content'
        output_data = [
            {
                "url": page.url,
                "content": page.content
            }
            for page in result.extracted_items
        ]

        with open("crawl_output.json", "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"✅ Crawl finished. Saved {len(output_data)} pages to crawl_output.json")

# 🚀 Script entrypoint
if __name__ == "__main__":
    asyncio.run(run())