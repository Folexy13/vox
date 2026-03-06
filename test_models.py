import os
from google import genai
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY", "dummy"))
for m in client.models.list():
    if "bidi" in str(m): print(m.name)
