#!/usr/bin/env python3
"""google-careers.py — local parser for Google's careers SPA (career-ops Level 0).

Google/Google Cloud have no public JSON job board, but the careers results page
server-renders each job card into the HTML (title in <h3 class="QJPWVe">, job id
in the ssk attribute, locations in spans of class r0wTof). This parser fetches a
few query pages and emits the jobs JSON array the local-parser provider expects.

Usage (wired via portals.yml):
  parser:
    command: python3
    script: parsers/google-careers.py
Args: [careers_url, company] are appended by the local-parser provider; the
careers_url's `q=` query is used as the first search, plus built-in sales
queries for coverage.

CSS class names are Google-generated and WILL rot eventually — the parser exits
with an error (nonzero) when a page yields zero cards so the scan surfaces the
breakage instead of silently reporting "no jobs".
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
BASE = "https://www.google.com/about/careers/applications/jobs/results"
QUERIES = ['"account executive"', '"field sales representative"', '"sales specialist" cloud', '"customer engineer"']
PAGES_PER_QUERY = 3  # 20 cards/page


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def parse_cards(page_html):
    jobs = []
    for card in re.split(r'<li class="lLd3Je"', page_html)[1:]:
        card = card.split("</li>")[0]
        m_id = re.search(r"ssk='17:(\d+)'", card)
        m_title = re.search(r'<h3 class="QJPWVe">([^<]+)</h3>', card)
        if not (m_id and m_title):
            continue
        locs = re.findall(r'class="r0wTof[^"]*"[^>]*>([^<]+)<', card)
        seen, uniq = set(), []
        for loc in locs:
            loc = html.unescape(loc).strip()
            if loc and loc not in seen:
                seen.add(loc)
                uniq.append(loc)
        jobs.append({
            "title": html.unescape(m_title.group(1)).strip(),
            "url": f"https://www.google.com/about/careers/applications/jobs/results/{m_id.group(1)}",
            "location": "; ".join(uniq),
        })
    return jobs


def main():
    careers_url = sys.argv[1] if len(sys.argv) > 1 else ""
    company = sys.argv[2] if len(sys.argv) > 2 else "Google"
    queries = list(QUERIES)
    if careers_url:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(careers_url).query).get("q", [""])[0]
        if q and q not in queries:
            queries.insert(0, q)

    all_jobs, seen_urls = [], set()
    fetched_any = False
    for q in queries:
        for page in range(1, PAGES_PER_QUERY + 1):
            url = f"{BASE}?q={urllib.parse.quote(q)}&page={page}"
            try:
                page_html = fetch(url)
            except Exception as e:
                print(f"google-careers: fetch failed for {url}: {e}", file=sys.stderr)
                continue
            cards = parse_cards(page_html)
            if page == 1 and not cards:
                # Either the query has no results or Google's markup changed.
                # Distinguish: a results page with zero result-list markup at all
                # means markup rot — fail loudly.
                if 'class="lLd3Je"' not in page_html and "spHGqe" not in page_html:
                    print("google-careers: no job-card markup found — Google markup likely changed", file=sys.stderr)
                    sys.exit(2)
                break
            fetched_any = True
            for j in cards:
                if j["url"] in seen_urls:
                    continue
                seen_urls.add(j["url"])
                j["company"] = company
                all_jobs.append(j)
            if len(cards) < 20:
                break  # last page for this query

    if not fetched_any and not all_jobs:
        print("google-careers: all fetches failed", file=sys.stderr)
        sys.exit(1)
    json.dump(all_jobs, sys.stdout)


if __name__ == "__main__":
    main()
