import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
    GOOGLE_CLOUD_REGION = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "lorem-voice-profily")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

config = Config()
