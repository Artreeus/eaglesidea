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
# ip_list = ['61.160.194.160', '8.8.8.8', '123.123.123.123', '181.214.166.59', '116.110.68.214', '149.22.156.17', '116.105.208.46', '219.132.37.52', '18.222.181.73']

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







import aiohttp
import asyncio
import json
import time
import os

# Suppress HTTPS warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuration
MISP_URL = 'https://113.11.106.78:8081'
API_KEY = 'peUBlSbd2Cx4YsW18DFJXwNuBSX6nbuusgpLZeas'
VERIFY_SSL = False

EXPRESS_API_BASE = 'http://localhost:3000'
IP_ENDPOINT = f'{EXPRESS_API_BASE}/api/ips'

misp_headers = {
    'Authorization': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

output_file = 'misp_responses.json'

# Load existing results if file exists
if os.path.exists(output_file):
    with open(output_file, 'r') as f:
        all_responses = json.load(f)
        scanned_ips = {entry['ip'] for entry in all_responses}
else:
    all_responses = []
    scanned_ips = set()

page = 1
limit = 50

async def fetch_ip_data(session, page, limit):
    try:
        async with session.get(IP_ENDPOINT, params={'page': page, 'limit': limit}) as response:
            response.raise_for_status()
            return await response.json()
    except Exception as e:
        print(f"❌ Error fetching IP data for page {page}: {str(e)}")
        return []

async def fetch_misp_data(session, ips):
    try:
        payload = {
            "returnFormat": "json",
            "type": ["ip-src", "ip-dst", "ip-src|ip-dst"],
            "value": ips  # <-- Sending list of IPs
        }
        async with session.post(f"{MISP_URL}/attributes/restSearch", headers=misp_headers, json=payload, verify=VERIFY_SSL) as misp_resp:
            misp_resp.raise_for_status()
            return await misp_resp.json()
    except Exception as e:
        print(f"❌ Error fetching MISP data: {str(e)}")
        return {}

async def main():
    global page
    async with aiohttp.ClientSession() as session:
        while True:
            print(f"\n📦 Fetching page {page} of IPs...")
            ip_data = await fetch_ip_data(session, page, limit)

            if not ip_data:
                print("✅ No more IPs to process.")
                break

            new_ips = [ip['ip'] for ip in ip_data if ip['ip'] not in scanned_ips]
            if not new_ips:
                print("⚠️ All IPs in this page already scanned.")
                page += 1
                continue

            print(f"🔄 Sending {len(new_ips)} IPs to MISP in bulk...")

            misp_data = await fetch_misp_data(session, new_ips)
            attributes = misp_data.get('response', {}).get('Attribute', [])

            # Create a lookup: ip => list of matching attributes
            ip_matches = {}
            for attr in attributes:
                val = attr.get('value')
                if val not in ip_matches:
                    ip_matches[val] = []

                ip_matches[val].append({
                    "id": attr.get('id'),
                    "event_id": attr.get('event_id'),
                    "object_id": attr.get('object_id'),
                    "object_relation": attr.get('object_relation', None),
                    "category": attr.get('category'),
                    "type": attr.get('type'),
                    "to_ids": attr.get('to_ids', False),
                    "uuid": attr.get('uuid'),
                    "timestamp": attr.get('timestamp'),
                    "distribution": attr.get('distribution'),
                    "sharing_group_id": attr.get('sharing_group_id'),
                    "comment": attr.get('comment', ''),
                    "deleted": attr.get('deleted', False),
                    "disable_correlation": attr.get('disable_correlation', False),
                    "first_seen": attr.get('first_seen'),
                    "last_seen": attr.get('last_seen'),
                    "value": attr.get('value'),
                    "Event": {
                        "org_id": attr.get('Event', {}).get('org_id'),
                        "distribution": attr.get('Event', {}).get('distribution'),
                        "publish_timestamp": attr.get('Event', {}).get('publish_timestamp'),
                        "id": attr.get('Event', {}).get('id'),
                        "info": attr.get('Event', {}).get('info'),
                        "orgc_id": attr.get('Event', {}).get('orgc_id'),
                        "uuid": attr.get('Event', {}).get('uuid'),
                        "user_id": attr.get('Event', {}).get('user_id')
                    },
                    "Tag": attr.get('Tag', [])
                })

            # Record results for all IPs in the page
            for ip in new_ips:
                result = {
                    "ip": ip,
                    "response": {
                        "response": {
                            "Attribute": ip_matches.get(ip, [])
                        }
                    }
                }
                all_responses.append(result)
                scanned_ips.add(ip)

                if result["response"]["response"]["Attribute"]:
                    print(f"⚠️ {ip} found in MISP with {len(result['response']['response']['Attribute'])} match(es).")
                else:
                    print(f"✅ {ip} not found in MISP.")

            # Save file after each page
            with open(output_file, 'w') as f:
                json.dump(all_responses, f, indent=4)

            page += 1
            await asyncio.sleep(2)  # Increased delay between requests to avoid overwhelming the server

# Run the asynchronous main function
if __name__ == "__main__":
    asyncio.run(main())
