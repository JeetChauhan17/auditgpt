"""
scripts/precompute.py
Pre-computes all quantitative scores for every cached company and writes:
  - backend/data/reports/{company_id}.json  (full forensic score)
  - backend/data/sector_summary.json        (sector-level aggregates)

Run from project root:
    python scripts/precompute.py
"""

import json
import os
import sys
import time
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.engine.scoring import score_company

COMPANIES_DIR = Path("backend/data/companies")
REPORTS_DIR   = Path("backend/data/reports")
SECTOR_FILE   = Path("backend/data/sector_summary.json")

REPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

def load_all_companies() -> dict[str, dict]:
    """Load every company JSON. Returns {company_id: data}."""
    companies = {}
    for path in sorted(COMPANIES_DIR.glob("*.json")):
        company_id = path.stem
        try:
            with open(path, encoding="utf-8") as f:
                companies[company_id] = json.load(f)
        except Exception as e:
            print(f"  [WARN] Could not load {path.name}: {e}")
    return companies


def get_peers(company_id: str, company_data: dict, all_companies: dict[str, dict]) -> list[dict]:
    """Return all companies in the same sector, excluding the company itself."""
    sector = company_data.get("sector", "")
    return [
        data for cid, data in all_companies.items()
        if cid != company_id and data.get("sector", "") == sector
    ]


def risk_level_to_int(level: str) -> int:
    return {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}.get(level, 0)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== AuditGPT Pre-computation ===\n")

    all_companies = load_all_companies()
    total = len(all_companies)
    print(f"Loaded {total} companies from {COMPANIES_DIR}\n")

    if total == 0:
        print("No companies found. Run fetch_data.py first.")
        sys.exit(1)

    # Track per-sector stats for sector_summary.json
    sector_scores: dict[str, list[float]] = {}
    sector_companies: dict[str, list[str]] = {}

    errors = 0
    start = time.time()

    for i, (company_id, company_data) in enumerate(all_companies.items(), 1):
        name   = company_data.get("company_name", company_id)
        sector = company_data.get("sector", "Unknown")
        report_path = REPORTS_DIR / f"{company_id}.json"

        print(f"[{i:3}/{total}] {name:<40} sector={sector}")

        try:
            peers  = get_peers(company_id, company_data, all_companies)
            result = score_company(company_data, peers)

            # Attach metadata
            result["company_id"]   = company_id
            result["company_name"] = name
            result["sector"]       = sector

            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)

            score = result["composite_score"]
            level = result["risk_level"]
            print(f"         → score={score:.1f}  risk={level}")

            # Accumulate for sector summary
            sector_scores.setdefault(sector, []).append(score)
            sector_companies.setdefault(sector, []).append(company_id)

        except Exception as e:
            print(f"         [ERROR] {e}")
            errors += 1

    elapsed = time.time() - start
    print(f"\nDone: {total - errors}/{total} succeeded in {elapsed:.1f}s")

    # ── Sector summary ────────────────────────────────────────────────────────
    summary = []
    for sector, scores in sector_scores.items():
        avg = sum(scores) / len(scores)
        if avg <= 25:
            risk_level = "Low"
        elif avg <= 50:
            risk_level = "Medium"
        elif avg <= 75:
            risk_level = "High"
        else:
            risk_level = "Critical"

        summary.append({
            "sector_name":     sector,
            "avg_risk_score":  round(avg, 2),
            "company_count":   len(scores),
            "risk_level":      risk_level,
            "companies":       sector_companies[sector],
        })

    # Sort by risk descending (for the Fraud Radar landing page)
    summary.sort(key=lambda s: s["avg_risk_score"], reverse=True)

    with open(SECTOR_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\nSector summary written → {SECTOR_FILE}")
    print(f"  {len(summary)} sectors found\n")

    for s in summary:
        bar = "█" * int(s["avg_risk_score"] / 5)
        print(f"  {s['sector_name']:<30} {bar:<20} {s['avg_risk_score']:.1f} ({s['risk_level']})")

    print()


if __name__ == "__main__":
    main()