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
NODE_API_ENDPOINT = 'http://localhost:3000/api/misp-results/md5/upload'

misp_headers = {
    'Authorization': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

async def fetch_misp_data(session, hashes):
    """Sends a list of MD5 hashes to the MISP server for searching."""
    try:
        payload = {
            "returnFormat": "json",
            "type": "md5", # Search for MD5 attribute type
            "value": hashes
        }
        async with session.post(f"{MISP_URL}/attributes/restSearch", headers=misp_headers, json=payload, ssl=VERIFY_SSL) as misp_resp:
            if misp_resp.status != 200:
                print(f"ERROR: MISP server returned error {misp_resp.status}: {await misp_resp.text()}")
                return {}
            return await misp_resp.json()
    except Exception as e:
        print(f"ERROR: Could not fetch MISP data for MD5 hashes: {str(e)}")
        return {}

async def send_results_to_node(session, results):
    """Posts the formatted scan results back to the Node.js application."""
    if not results:
        print("INFO: No MD5 hash results to send to Node.js.")
        return

    try:
        payload = {"results": results}
        async with session.post(NODE_API_ENDPOINT, json=payload) as response:
            if response.status == 200:
                print(f"SUCCESS: Sent {len(results)} MD5 hash results to Node.js.")
            else:
                print(f"ERROR: Failed to send MD5 results. Status: {response.status}, Response: {await response.text()}")
    except Exception as e:
        print(f"ERROR: Failed to send MD5 results to Node.js: {str(e)}")


async def main(hashes_to_scan):
    """Main function to process MD5 hashes and send results."""
    async with aiohttp.ClientSession() as session:
        print(f"INFO: Sending {len(hashes_to_scan)} MD5 hashes to MISP...")

        misp_data = await fetch_misp_data(session, hashes_to_scan)
        attributes = misp_data.get('response', {}).get('Attribute', [])

        hash_matches = {}
        for attr in attributes:
            val = attr.get('value')
            if val not in hash_matches:
                hash_matches[val] = []
            hash_matches[val].append(attr)

        all_results = []
        for hash_val in hashes_to_scan:
            result = {
                "hash": hash_val, # Use 'hash' as the key
                "response": {
                    "response": {
                        "Attribute": hash_matches.get(hash_val, [])
                    }
                }
            }
            all_results.append(result)
            if result["response"]["response"]["Attribute"]:
                print(f"FOUND: {hash_val} was found in MISP.")
            else:
                print(f"NOT FOUND: {hash_val} was not found in MISP.")
        
        await send_results_to_node(session, all_results)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python misp_md5_scanner.py <hash1> <hash2> ...")
        sys.exit(1)

    hashes_to_process = sys.argv[1:]
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding='utf-8')
        
    asyncio.run(main(hashes_to_process))