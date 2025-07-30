import aiohttp
import asyncio
import json
import sys
import re
import os

# Suppress HTTPS warnings for local/dev environments
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- Configuration ---
MISP_URL = 'https://113.11.106.78:8081'
API_KEY = 'peUBlSbd2Cx4YsW18DFJXwNuBSX6nbuusgpLZeas'
VERIFY_SSL = False

# --- Regular Expressions for Indicator Detection ---
IPV4_REGEX = re.compile(r"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$")
IPV6_REGEX = re.compile(r"([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}")
MD5_REGEX = re.compile(r"^[a-fA-F0-9]{32}$")
SHA256_REGEX = re.compile(r"^[a-fA-F0-9]{64}$") # Added SHA256
DOMAIN_HOSTNAME_REGEX = re.compile(r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}$")

misp_headers = {
    'Authorization': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

def classify_indicator(indicator):
    """Classifies an indicator and returns its type as a string."""
    if IPV4_REGEX.match(indicator) or IPV6_REGEX.match(indicator):
        return 'ip'
    if MD5_REGEX.match(indicator):
        return 'md5'
    if SHA256_REGEX.match(indicator):
        return 'sha256'
    if DOMAIN_HOSTNAME_REGEX.match(indicator):
        return 'domain' # Simplified to 'domain' for easier frontend logic
    return 'unknown'

async def fetch_misp_data(session, values, indicator_type):
    """Generic function to fetch data from MISP for a list of indicator values."""
    if not values:
        return {}
        
    payload = {"returnFormat": "json", "value": values}
    
    # Set the correct MISP attribute type(s) for the query
    if indicator_type == 'ip':
        payload["type"] = ["ip-src", "ip-dst", "ip-src|ip-dst"]
    elif indicator_type == 'domain':
        payload["type"] = ["domain", "hostname"]
    elif indicator_type == 'md5':
        payload["type"] = "md5"
    elif indicator_type == 'sha256':
        payload["type"] = "sha256"
    else:
        return {}

    try:
        async with session.post(f"{MISP_URL}/attributes/restSearch", headers=misp_headers, json=payload, ssl=VERIFY_SSL) as misp_resp:
            if misp_resp.status != 200:
                # Log errors to stderr so they don't corrupt the JSON output
                sys.stderr.write(f"ERROR: MISP returned {misp_resp.status} for {indicator_type}\n")
                return {}
            return await misp_resp.json()
    except Exception as e:
        sys.stderr.write(f"ERROR: Could not fetch MISP data for {indicator_type}: {str(e)}\n")
        return {}

async def main(indicators_to_scan):
    """Main function to classify, process indicators, and print results as a single JSON object."""
    categorized_indicators = {'ip': [], 'domain': [], 'md5': [], 'sha256': []}
    for indicator in indicators_to_scan:
        cat = classify_indicator(indicator)
        if cat != 'unknown':
            categorized_indicators[cat].append(indicator)

    async with aiohttp.ClientSession() as session:
        tasks = [fetch_misp_data(session, v, k) for k, v in categorized_indicators.items() if v]
        if not tasks:
            print(json.dumps([])) # Print empty JSON array if no valid indicators
            return

        misp_responses = await asyncio.gather(*tasks)

        # Create a unified dictionary of all found threats for quick lookup
        all_matches = {}
        for resp in misp_responses:
            attributes = resp.get('response', {}).get('Attribute', [])
            for attr in attributes:
                val = attr.get('value')
                if val not in all_matches:
                    all_matches[val] = []
                all_matches[val].append(attr)
        
        # Build the final list of results for every indicator that was submitted
        all_results_to_send = []
        for indicator in indicators_to_scan:
            indicator_type = classify_indicator(indicator)
            if indicator_type == 'unknown':
                continue
            
            result = {
                "indicator": indicator,
                "type": indicator_type,
                "response": {
                    "response": {
                        "Attribute": all_matches.get(indicator, [])
                    }
                }
            }
            all_results_to_send.append(result)
        
        # --- KEY CHANGE: Print final JSON to stdout ---
        # This is the only output the Node.js app will capture.
        print(json.dumps(all_results_to_send))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Exit gracefully if no arguments are provided
        print(json.dumps([]))
        sys.exit(0)

    indicators_to_process = sys.argv[1:]
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding='utf-8')
    
    asyncio.run(main(indicators_to_process))
