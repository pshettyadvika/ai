"""Prewarm disk cache in backend/cache/ for offline hackathon demo reliability."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.app.config import DATA_DIR  # noqa: E402
from backend.app.nim_client import (  # noqa: E402
    ask_grounded_question,
    describe_change_site,
    generate_flood_alert,
    triage_flagged_sites,
)
from backend.app.schemas import ResultsContract  # noqa: E402


def main() -> None:
    raw = json.loads((DATA_DIR / "results.json").read_text(encoding="utf-8"))
    results = ResultsContract(**raw)

    print("1/4 Prewarming flood alert...")
    alert = generate_flood_alert(results, demo_mode=False)
    print("  -> source:", alert["source"])

    print("2/4 Prewarming site VLM descriptions...")
    for site in results.change.sites:
        desc = describe_change_site(results, site_id=site.id, demo_mode=False)
        print(f"  -> {site.id}: {desc['source']}")

    print("3/4 Prewarming HAPS/drone triage ranking...")
    triage = triage_flagged_sites(results, demo_mode=False)
    print("  -> source:", triage.source)

    print("4/4 Prewarming starter Q&A responses...")
    starters = [
        "What is the estimated cropland loss and how is it calculated?",
        "Which settlements and critical infrastructure are most exposed to flooding?",
        "What are the validated Sen1Floods11 test and Bolivia metrics?",
    ]
    for q in starters:
        ans = ask_grounded_question(results, question=q, demo_mode=False)
        print(f"  -> Q cached ({ans['source']}): {q[:48]}...")


if __name__ == "__main__":
    main()
