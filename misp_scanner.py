# import requests
# import json
# import time
# import urllib3
# from requests.adapters import HTTPAdapter
# from urllib3.util.retry import Retry

# # Suppress HTTPS insecure warnings
# urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# # Configuration
# MISP_URL = 'https://113.11.106.78:8081'
# API_KEY = 'peUBlSbd2Cx4YsW18DFJXwNuBSX6nbuusgpLZeas'
# VERIFY_SSL = False

# # Node.js API endpoint to get all IPs
# IP_LIST_URL = 'http://localhost:3000/api/ips'

# # Headers for the MISP API
# headers = {
#     'Authorization': API_KEY,
#     'Accept': 'application/json',
#     'Content-Type': 'application/json',
# }

# # Setup a session with retries
# session = requests.Session()
# retries = Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])
# session.mount('https://', HTTPAdapter(max_retries=retries))
# session.mount('http://', HTTPAdapter(max_retries=retries))

# # Function to fetch all IPs from the Node.js server
# def fetch_ips():
#     ip_list = []
#     page = 1
#     while True:
#         try:
#             print(f"Fetching page {page}...")
#             response = session.get(f'{IP_LIST_URL}?page={page}&limit=50', timeout=60)  # Set timeout to 60 seconds
#             if response.status_code == 200:
#                 data = response.json()
#                 if not data:
#                     break  # Exit loop if no more IPs
#                 ip_list.extend([ip['ip'] for ip in data])  # Assuming 'ip' field contains the IP address
#                 page += 1
#             else:
#                 print(f"❌ Error fetching IPs (page {page}): {response.status_code} - {response.text}")
#                 break
#         except requests.exceptions.RequestException as e:
#             print(f"[!] Request error (page {page}): {e}")
#             break
#     return ip_list

# # Function to query MISP for an IP
# def get_misp_scan_result(ip):
#     try:
#         payload = {
#             "returnFormat": "json",
#             "type": ["ip-src", "ip-dst", "ip-src|ip-dst"],
#             "value": ip
#         }
#         response = session.post(f"{MISP_URL}/attributes/restSearch", headers=headers, json=payload, verify=VERIFY_SSL, timeout=60)
#         if response.status_code == 200:
#             return response.json()
#         else:
#             print(f"❌ Error querying MISP for IP {ip}: {response.status_code} - {response.text}")
#             return None
#     except requests.RequestException as e:
#         print(f"[!] Error fetching MISP data for {ip}: {e}")
#         return None

# # Main function
# def main():
#     # Fetch all IPs from the Node.js server
#     ip_list = fetch_ips()
#     if not ip_list:
#         print("No IPs found to query.")
#         return

#     print(f"Fetched {len(ip_list)} IPs from the server.")
    
#     # Prepare a list to store results
#     results = []

#     # Query MISP for each IP
#     for ip in ip_list:
#         print(f"\n🔍 Checking IP: {ip}")
        
#         misp_data = get_misp_scan_result(ip)
#         ip_result = {'ip': ip, 'result': None}

#         if misp_data and misp_data.get('response', {}).get('Attribute'):
#             ip_result['result'] = []  # Initialize empty list for attributes
#             print(f"⚠️  Found! IP {ip} is present in MISP.")
#             for attr in misp_data['response']['Attribute']:
#                 event_info = {
#                     'event_id': attr['event_id'],
#                     'type': attr['type'],
#                     'category': attr['category']
#                 }
#                 ip_result['result'].append(event_info)
#                 print(f"   - Event ID: {attr['event_id']} | Type: {attr['type']} | Category: {attr['category']}")
#         else:
#             print(f"✅ No matches found. IP not known to be malicious.")
        
#         # Append the result for this IP
#         results.append(ip_result)

#         time.sleep(0.2)  # Small delay between requests to avoid overwhelming the server

#     # Write the results to a JSON file
#     with open('misp_results.json', 'w') as f:
#         json.dump(results, f, indent=2)

#     print(f"\n✅ All results have been saved to misp_results.json")

# # Run the main function
# if __name__ == '__main__':
#     main()


# import requests
# import urllib3
# import json
# import os

# # Suppress HTTPS insecure warnings
# urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# # Configuration
# MISP_URL = 'https://113.11.106.78:8081'
# API_KEY = 'peUBlSbd2Cx4YsW18DFJXwNuBSX6nbuusgpLZeas'
# VERIFY_SSL = False

# # List of IPs to scan
# ip_list = ['a07c22998b1bfb5a5a84cac100516c35', '033cbc068b4e71d6cca1c2c30fb3fd1b', '10dc126459ef98451850b3870750c13c']

# # Headers
# headers = {
#     'Authorization': API_KEY,
#     'Accept': 'application/json',
#     'Content-Type': 'application/json',
# }

# # List to store responses for all IPs
# all_responses = []

# # Loop through IPs and make requests
# for ip in ip_list:
#     print(f"\n🔍 Checking IP: {ip}")
    
#     payload = {
#         "returnFormat": "json",
#         "type": ["ip-src", "ip-dst", "ip-src|ip-dst"],
#         "value": ip
#     }

#     response = requests.post(f"{MISP_URL}/attributes/restSearch", headers=headers, json=payload, verify=VERIFY_SSL)
    
#     if response.status_code == 200:
#         data = response.json()  # Parse the JSON response

#         # Add the response data to the all_responses list
#         all_responses.append({"ip": ip, "response": data})

#         print(f"📝 Response for {ip} saved in the collection.")

#         if data.get('response', {}).get('Attribute'):
#             print(f"⚠️  Found! IP {ip} is present in MISP.")
#             for attr in data['response']['Attribute']:
#                 print(f"   - Event ID: {attr['event_id']} | Type: {attr['type']} | Category: {attr['category']}")
#         else:
#             print(f"✅ No matches found. IP not known to be malicious.")
#     else:
#         print(f"❌ Error querying MISP: {response.status_code} - {response.text}")

# # Save all responses to a single JSON file
# output_file = "misp_responses.json"
# with open(output_file, 'w') as json_file:
#     json.dump(all_responses, json_file, indent=4)

# print(f"\nAll responses have been saved to {output_file}")





# misp_scanner.py
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
NODE_API_ENDPOINT = 'http://localhost:3000/api/misp-results/upload'

misp_headers = {
    'Authorization': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

async def fetch_misp_data(session, ips):
    """Sends a list of IPs to the MISP server for searching."""
    try:
        payload = {
            "returnFormat": "json",
            "type": ["ip-src", "ip-dst", "ip-src|ip-dst"],
            "value": ips
        }
        # Note: aiohttp uses `ssl` parameter instead of `verify`
        async with session.post(f"{MISP_URL}/attributes/restSearch", headers=misp_headers, json=payload, ssl=VERIFY_SSL) as misp_resp:
            if misp_resp.status != 200:
                print(f"ERROR: MISP server returned error {misp_resp.status}: {await misp_resp.text()}")
                return {}
            return await misp_resp.json()
    except Exception as e:
        print(f"ERROR: Could not fetch MISP data: {str(e)}")
        return {}

async def send_results_to_node(session, results):
    """Posts the formatted scan results back to the Node.js application."""
    if not results:
        print("INFO: No results to send to Node.js.")
        return

    try:
        payload = {"results": results}
        async with session.post(NODE_API_ENDPOINT, json=payload) as response:
            if response.status == 200:
                print(f"SUCCESS: Sent {len(results)} results to Node.js.")
            else:
                print(f"ERROR: Failed to send results to Node.js. Status: {response.status}, Response: {await response.text()}")
    except Exception as e:
        print(f"ERROR: Failed to send results to Node.js: {str(e)}")


async def main(ips_to_scan):
    """Main function to process IPs and send results."""
    async with aiohttp.ClientSession() as session:
        print(f"INFO: Sending {len(ips_to_scan)} IPs to MISP...")

        misp_data = await fetch_misp_data(session, ips_to_scan)
        attributes = misp_data.get('response', {}).get('Attribute', [])

        # Create a lookup: ip => list of matching attributes
        ip_matches = {}
        for attr in attributes:
            val = attr.get('value')
            if val not in ip_matches:
                ip_matches[val] = []
            ip_matches[val].append(attr)

        # Format results for all IPs that were scanned
        all_results = []
        for ip in ips_to_scan:
            result = {
                "ip": ip,
                "response": {
                    "response": {
                        "Attribute": ip_matches.get(ip, [])
                    }
                }
            }
            all_results.append(result)
            if result["response"]["response"]["Attribute"]:
                print(f"FOUND: {ip} was found in MISP.")
            else:
                print(f"NOT FOUND: {ip} was not found in MISP.")
        
        # Send the compiled results back to your Node.js app
        await send_results_to_node(session, all_results)


if __name__ == "__main__":
    # The script now expects IPs as command-line arguments
    if len(sys.argv) < 2:
        print("Usage: python misp_scanner.py <ip1> <ip2> ...")
        sys.exit(1)

    ips_to_process = sys.argv[1:]
    # Set UTF-8 encoding for stdout on Windows
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding='utf-8')
        
    asyncio.run(main(ips_to_process))
