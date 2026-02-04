import os
import asyncio
import json
from pydantic import BaseModel, Field
from typing import List
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, LLMConfig
from crawl4ai.extraction_strategy import LLMExtractionStrategy

# 🔧 Configuration
TARGET_URL = "https://baike.baidu.com/item/%E6%98%8E%E6%9C%9D%E5%B9%B4%E5%8F%B7/1680052"        # ← Replace with your starting URL
MAX_DEPTH = 2                             # Controls how deep to crawl
DEEPSEEK_API_URL = "http://40.83.55.66:8000/v1"  # Your self-hosted DeepSeek-compatible API endpoint
DEEPSEEK_API_KEY = "123"         # If authentication is required; leave empty if not

class Entity(BaseModel):
    name: str
    description: str

class Relationship(BaseModel):
    entity1: Entity
    entity2: Entity
    description: str
    relation_type: str

class KnowledgeGraph(BaseModel):
    entities: List[Entity]
    relationships: List[Relationship]


# 🕸️ Crawling logic
async def run():
    async with AsyncWebCrawler(verbose=True) as crawler:
        
        llm_strategy = LLMExtractionStrategy(
            llm_config = LLMConfig(provider="openai/compatible", api_token=DEEPSEEK_API_KEY, base_url=DEEPSEEK_API_URL),
            schema=KnowledgeGraph.model_json_schema(),
            extraction_type="schema",
            instruction="Extract entities and relationships from the content. Return valid JSON.",
            chunk_token_threshold=5000,
            overlap_rate=0.0,
            apply_chunking=True,
            input_format="html",   # or "html", "fit_markdown"
            extra_args={"temperature": 0.0, "max_tokens": 8000}
        )

        crawl_config = CrawlerRunConfig(
            extraction_strategy=llm_strategy,
            cache_mode=CacheMode.BYPASS
        )
        result = await crawler.arun(
            url=TARGET_URL,     
            config= crawl_config
        )

        if result.success:
            output_data = json.loads(result.extracted_content)

            llm_strategy.show_usage();


        with open("crawl_output.json", "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"✅ Crawl finished. Saved {len(output_data)} pages to crawl_output.json")

# 🚀 Script entrypoint
if __name__ == "__main__":
    asyncio.run(run())


