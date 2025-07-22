import aiohttp
import asyncio
import json
import sys
import os

# Suppress HTTPS warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- Configuration ---
MISP_URL = 'https://113.11.106.78:8081'
API_KEY = 'peUBlSbd2Cx4YsW18DFJXwNuBSX6nbuusgpLZeas'
VERIFY_SSL = False

# This is the endpoint in your Node.js app where we will send the results
NODE_API_ENDPOINT = 'http://localhost:3000/api/misp-results/domain/upload'

misp_headers = {
    'Authorization': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

async def fetch_misp_data(session, domains):
    """Sends a list of domains to the MISP server for searching."""
    try:
        payload = {
            "returnFormat": "json",
            "type": ["domain", "hostname"],
            "value": domains
        }
        async with session.post(f"{MISP_URL}/attributes/restSearch", headers=misp_headers, json=payload, ssl=VERIFY_SSL) as misp_resp:
            if misp_resp.status != 200:
                print(f"ERROR: MISP server returned error {misp_resp.status}: {await misp_resp.text()}")
                return {}
            return await misp_resp.json()
    except Exception as e:
        print(f"ERROR: Could not fetch MISP data for domains: {str(e)}")
        return {}

async def send_results_to_node(session, results):
    """Posts the formatted scan results back to the Node.js application."""
    if not results:
        print("INFO: No domain results to send to Node.js.")
        return

    try:
        payload = {"results": results}
        async with session.post(NODE_API_ENDPOINT, json=payload) as response:
            if response.status == 200:
                print(f"SUCCESS: Sent {len(results)} domain results to Node.js.")
            else:
                print(f"ERROR: Failed to send domain results to Node.js. Status: {response.status}, Response: {await response.text()}")
    except Exception as e:
        print(f"ERROR: Failed to send domain results to Node.js: {str(e)}")


async def main(domains_to_scan):
    """Main function to process domains and send results."""
    async with aiohttp.ClientSession() as session:
        print(f"INFO: Sending {len(domains_to_scan)} domains to MISP...")

        misp_data = await fetch_misp_data(session, domains_to_scan)
        attributes = misp_data.get('response', {}).get('Attribute', [])

        domain_matches = {}
        for attr in attributes:
            val = attr.get('value')
            if val not in domain_matches:
                domain_matches[val] = []
            domain_matches[val].append(attr)

        all_results = []
        for domain in domains_to_scan:
            result = {
                "domain": domain,
                "response": {
                    "response": {
                        "Attribute": domain_matches.get(domain, [])
                    }
                }
            }
            all_results.append(result)
            if result["response"]["response"]["Attribute"]:
                print(f"FOUND: {domain} was found in MISP.")
            else:
                print(f"NOT FOUND: {domain} was not found in MISP.")
        
        await send_results_to_node(session, all_results)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python misp_domain_scanner.py <domain1> <domain2> ...")
        sys.exit(1)

    domains_to_process = sys.argv[1:]
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding='utf-8')
        
    asyncio.run(main(domains_to_process))