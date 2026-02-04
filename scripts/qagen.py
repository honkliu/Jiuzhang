
import openai
from pathlib import Path

client = openai.Client(
    base_url="http://52.171.138.19:8001/v1",
    api_key="123",
)

def generate_alpaca(chunk_text):
    prompt = f"""

You are generating expert-level troubleshooting and architecture Q&A.

Source text:
{chunk_text}

Instructions:
- English only
- Reason internally in detail, but do NOT reveal chain-of-thought
- Each answer must be deep, multi-paragraph, and expert-level
- Focus on mechanisms, tradeoffs, failure modes, and recovery
- Avoid surface-level or definition-only answers
- input must be ""
- Output ONLY Alpaca JSON, one QA will be in one single line like {{"instruction:":... "input":"", "output":"..."}}
- Output should have "instruction", "input" and "output", input should be always ""
- Each Q&A must be ONE valid JSON object per line
- Generate between 5 and 20 Q&A pairs (quality over quantity), overlap is not a concern
- No important info will be ignored from the Q&A
"""


    resp = client.chat.completions.create(
        model="default",
        temperature=0.9,
        max_tokens=120000,
        messages=[
            {"role": "system", 
             "content": (
                    "You are a senior Ads infrastructure engineer.\n"
                    "You may reason internally, but you must NOT reveal chain-of-thought.\n"
                    "Do NOT emit <think>, analysis, or reasoning traces.\n"
                    "Provide only final answers with depth and technical precision.\n"
                    "Answers should read like production TSG documentation."

              )},
            {"role": "user", "content": prompt}
        ]
    )

    return resp.choices[0].message.content


# ----------------------
# File iteration + append
# ----------------------
root_dir = Path(r"Q:/src")
#MAX_CHARS = 8000
#MIN_CHARS = 300

files_num = 0
block = 0
output_file = Path(f"ads_alpaca.{block}.json")
output_dir = Path(f"ads_alpaca_dir.{block}.json")
for md_path in root_dir.rglob("*.md"):
    try:
        text = md_path.read_text(encoding="utf-8")

#        if len(text) < MIN_CHARS:
#            continue

#        text = text[:MAX_CHARS]

        print(f"Processing: {md_path}")

        response_ = f"{md_path} --- Processed"
        response = generate_alpaca(text)

        with open(output_dir, "a", encoding="utf-8") as f:
            f.write(response_)
            if not response_.endswith("\n"):
                f.write("\n")

        with open(output_file, "a", encoding="utf-8") as f:
            f.write(response)
            if not response.endswith("\n"):
                f.write("\n")
        files_num += 1
        if files_num >= 1000:
            files_num = 0
            block += 1
            output_file = Path(f"flighter_alpaca.{block}.json")
            output_dir = Path(f"ads_alpaca_dir.{block}.json")

    except Exception as e:
        print(f"ERROR processing {md_path}: {e}")
