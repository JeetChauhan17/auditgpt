"""
Root-level entry point for Railway deployment.
Uvicorn is called as: uvicorn main:app
This file is found directly at /app/main.py — no package import needed.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.main import app  # noqa: F401
