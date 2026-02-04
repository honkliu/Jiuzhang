
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
- Output ONLY Alpaca JSONL
- Each Q&A must be ONE valid JSON object per line
- Generate between 8 and 20 Q&A pairs (quality over quantity)
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
root_dir = Path(r"C:/gitroot/RnR-ExperimentationTools/documentation")
output_file = Path("flighter_alpaca.jsonl")

#MAX_CHARS = 8000
#MIN_CHARS = 300

for md_path in root_dir.rglob("*.md"):
    try:
        text = md_path.read_text(encoding="utf-8")

#        if len(text) < MIN_CHARS:
#            continue

#        text = text[:MAX_CHARS]

        print(f"Processing: {md_path}")

        response = generate_alpaca(text)

        with open(output_file, "a", encoding="utf-8") as f:
            f.write(response)
            if not response.endswith("\n"):
                f.write("\n")

    except Exception as e:
        print(f"ERROR processing {md_path}: {e}")
