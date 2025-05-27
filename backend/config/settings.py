#!/usr/bin/env python3
import os
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# OpenAI API key
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# API settings
API_HOST = "127.0.0.1"
API_PORT = 8000

# CORS settings
CORS_MIDDLEWARE_SETTINGS = {
    "allow_origins": ["*"],  # In production, replace with specific origins
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

# Path configurations
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
SCRIPTS_DIR = os.path.join(PROJECT_ROOT, 'scripts')
TEMP_DIR = os.path.join(PROJECT_ROOT, 'temp')

# Ghidra settings
GHIDRA_HEADLESS_SCRIPT = os.path.join(SCRIPTS_DIR, 'run_ghidra_headless.bat')

# Create directories if they don't exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

# OpenAI model settings
DEFAULT_MODEL = "gpt-4.1-nano"
DEFAULT_MAX_TOKENS = 500
DEFAULT_TEMPERATURE = 0.7

# Session settings
SESSION_TIMEOUT_HOURS = 24
MAX_CHAT_SESSIONS = 10  # Maximum number of chat sessions to keep 