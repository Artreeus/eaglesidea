import requests



def darkisw():
	domain = "premierbankltd.com"

	PIPETX_RESPONSE = {}
	PIPETX_RESPONSE["ISW_SCAN"] = {}

	if domain != "":
		domain = domain
		if domain.startswith("www."):
			domain = domain.replace("www.", "", 1)

		ISW_API_KEY = "MzM7izZnQupz7LGqAhZDAF-HWe4z1Bp5cCVBZGGDJ-o"

		print(ISW_API_KEY)
		PIPETX_RESPONSE["ISW_SCAN"]["Result"] = {}

		# Define the URL and API key
		url = "https://app.insecureweb.com/api/dark-web/live-scan"

		# Define the parameters for the request
		params = {
			'field': 'domain',
			'search': domain
		}

		# Define the headers with the API key
		headers = {
			'api-key': ISW_API_KEY,
			'accept': 'application/json'
		}


		# Send the GET request
		response = requests.get(url, headers=headers, params=params)
		PIPETX_RESPONSE["ISW_SCAN"]["Result"] = response.json()


		return PIPETX_RESPONSE


	else:
		PIPETX_RESPONSE["ISW_SCAN"]["Error"] = "Domain or API Key Not Provided in URL"
		return PIPETX_RESPONSE





my_result = darkisw()
print(type(my_result))
print(my_result)