"""
VisaPath Pro — Real-Time Embassy Data Scraper
Scrapes official embassy/immigration websites for latest processing times and requirements.
Run: python scraper.py
Schedule: python scraper.py --schedule (runs every 24 hours)
"""

import requests
from bs4 import BeautifulSoup
import json, time, re, argparse, schedule
from datetime import datetime
from typing import Optional
import firebase_admin
from firebase_admin import credentials, firestore
import os
from dotenv import load_dotenv

load_dotenv()

# Init Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate("firebase-service-account.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

# ── Scrapers ──────────────────────────────────────────────────────────────

def scrape_canada_ircc():
    """Scrapes IRCC for Canadian visa processing times."""
    results = {}
    try:
        url = "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract processing time tables
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    label = cells[0].get_text(strip=True)
                    value = cells[1].get_text(strip=True) if len(cells) > 1 else ""
                    if any(kw in label.lower() for kw in ["study", "work", "visitor", "permit"]):
                        results[label] = value

        results["scraped_at"] = datetime.utcnow().isoformat()
        results["source"] = url
        results["status"] = "success"
    except Exception as e:
        results = {"status": "error", "error": str(e), "scraped_at": datetime.utcnow().isoformat()}

    save_live_data("Canada", "processing_times", results)
    print(f"  ✅ Canada IRCC: {len(results)} data points")
    return results


def scrape_uk_visa_fees():
    """Scrapes UK gov.uk for visa fees and processing times."""
    results = {}
    try:
        url = "https://www.gov.uk/government/publications/visa-fees"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Find fee tables
        tables = soup.find_all("table")
        for table in tables[:3]:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    label = cells[0].get_text(strip=True)
                    value = cells[-1].get_text(strip=True)
                    if label and value and label != value:
                        results[label[:100]] = value

        results["scraped_at"] = datetime.utcnow().isoformat()
        results["source"] = url
        results["status"] = "success"
    except Exception as e:
        results = {"status": "error", "error": str(e), "scraped_at": datetime.utcnow().isoformat()}

    save_live_data("United Kingdom", "visa_fees", results)
    print(f"  ✅ UK Visa Fees: {len(results)} data points")
    return results


def scrape_uk_processing_times():
    """Scrapes UK processing times page."""
    results = {}
    try:
        url = "https://www.gov.uk/visa-processing-times"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        for row in soup.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True)
                value = cells[1].get_text(strip=True)
                if label:
                    results[label[:100]] = value

        results["scraped_at"] = datetime.utcnow().isoformat()
        results["source"] = url
        results["status"] = "success"
    except Exception as e:
        results = {"status": "error", "error": str(e), "scraped_at": datetime.utcnow().isoformat()}

    save_live_data("United Kingdom", "processing_times", results)
    print(f"  ✅ UK Processing Times: scraped")
    return results


def scrape_australia_immi():
    """Scrapes Australia Department of Home Affairs for visa info."""
    results = {}
    try:
        url = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Find processing time info
        content_divs = soup.find_all(["p", "li", "td"])
        for div in content_divs:
            text = div.get_text(strip=True)
            if any(kw in text.lower() for kw in ["month", "week", "day", "processing"]) and len(text) < 200:
                results[f"info_{len(results)}"] = text

        results["scraped_at"] = datetime.utcnow().isoformat()
        results["source"] = url
        results["status"] = "success"
    except Exception as e:
        results = {"status": "error", "error": str(e), "scraped_at": datetime.utcnow().isoformat()}

    save_live_data("Australia", "processing_times", results)
    print(f"  ✅ Australia IMMI: scraped")
    return results


def scrape_germany_visa():
    """Scrapes Germany's make-it-in-germany.com for work/study info."""
    results = {}
    try:
        url = "https://www.make-it-in-germany.com/en/study-in-germany"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract key info sections
        sections = soup.find_all(["h2", "h3", "p"])
        current_section = "general"
        for elem in sections[:30]:
            text = elem.get_text(strip=True)
            if elem.name in ["h2", "h3"] and text:
                current_section = text[:60]
            elif elem.name == "p" and text and len(text) > 50:
                results[current_section] = text[:300]

        results["scraped_at"] = datetime.utcnow().isoformat()
        results["source"] = url
        results["status"] = "success"
    except Exception as e:
        results = {"status": "error", "error": str(e), "scraped_at": datetime.utcnow().isoformat()}

    save_live_data("Germany", "study_info", results)
    print(f"  ✅ Germany Make-it-in-Germany: scraped")
    return results


def scrape_uae_visa():
    """Scrapes UAE ICA for visa info."""
    results = {}
    try:
        url = "https://u.ae/en/information-and-services/visa-and-emirates-id"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        links = soup.find_all("a", href=True)
        visa_links = []
        for link in links:
            text = link.get_text(strip=True)
            if any(kw in text.lower() for kw in ["visa", "permit", "residence", "golden"]):
                visa_links.append({"text": text, "href": link["href"]})

        results["visa_categories"] = visa_links[:20]
        results["scraped_at"] = datetime.utcnow().isoformat()
        results["source"] = url
        results["status"] = "success"
    except Exception as e:
        results = {"status": "error", "error": str(e), "scraped_at": datetime.utcnow().isoformat()}

    save_live_data("UAE", "visa_categories", results)
    print(f"  ✅ UAE ICA: scraped")
    return results


def scrape_nz_visa():
    """Scrapes NZ Immigration for processing times."""
    results = {}
    try:
        url = "https://www.immigration.govt.nz/about-us/research-and-statistics/visa-statistics"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")

        paras = soup.find_all("p")
        for p in paras[:20]:
            text = p.get_text(strip=True)
            if text and len(text) > 30:
                results[f"info_{len(results)}"] = text[:200]

        results["scraped_at"] = datetime.utcnow().isoformat()
        results["source"] = url
        results["status"] = "success"
    except Exception as e:
        results = {"status": "error", "error": str(e), "scraped_at": datetime.utcnow().isoformat()}

    save_live_data("New Zealand", "stats", results)
    print(f"  ✅ NZ Immigration: scraped")
    return results


# ── Firebase save ──────────────────────────────────────────────────────────

def save_live_data(country: str, data_type: str, data: dict):
    """Saves scraped data to Firestore."""
    doc_id = f"{country.replace(' ', '_')}_{data_type}"
    db.collection("live_data").document(doc_id).set({
        "country": country,
        "data_type": data_type,
        "data": data,
        "updated_at": datetime.utcnow().isoformat(),
    })
    # Also keep history
    db.collection("live_data_history").add({
        "country": country,
        "data_type": data_type,
        "data": data,
        "timestamp": datetime.utcnow().isoformat(),
    })


# ── Main scrape job ────────────────────────────────────────────────────────

def run_all_scrapers():
    print(f"\n🔄 VisaPath Scraper starting — {datetime.utcnow().isoformat()}")
    print("Scraping official embassy and immigration websites...\n")

    scrapers = [
        ("Canada IRCC", scrape_canada_ircc),
        ("UK Visa Fees", scrape_uk_visa_fees),
        ("UK Processing Times", scrape_uk_processing_times),
        ("Australia Home Affairs", scrape_australia_immi),
        ("Germany Make-it-in-Germany", scrape_germany_visa),
        ("UAE ICA", scrape_uae_visa),
        ("New Zealand INZ", scrape_nz_visa),
    ]

    results_summary = {}
    for name, fn in scrapers:
        try:
            result = fn()
            results_summary[name] = "✅ Success"
        except Exception as e:
            results_summary[name] = f"❌ Error: {e}"
        time.sleep(2)  # Be polite to servers

    # Save summary
    db.collection("scraper_runs").add({
        "timestamp": datetime.utcnow().isoformat(),
        "results": results_summary,
        "countries_updated": len(scrapers)
    })

    print(f"\n✅ Scrape complete. {len(scrapers)} sources processed.")
    print("Summary:")
    for name, status in results_summary.items():
        print(f"  {status} {name}")
    print()


def run_scheduled():
    """Run scraper on a schedule (every 24 hours)."""
    print("📅 VisaPath Scraper — Scheduled mode (every 24 hours)")
    run_all_scrapers()
    schedule.every(24).hours.do(run_all_scrapers)
    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--schedule", action="store_true", help="Run on schedule")
    args = parser.parse_args()

    if args.schedule:
        run_scheduled()
    else:
        run_all_scrapers()
