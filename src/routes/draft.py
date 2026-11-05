"""
Draft persistence routes for saving and loading project drafts.
"""

import os
import json
from fastapi import APIRouter
from src.config import APP_DATA_DIR
from src.models import DraftModel

router = APIRouter(prefix="/api/draft", tags=["draft"])

@router.get("")
def get_draft():
    draft_path = os.path.join(APP_DATA_DIR, "outputs", "draft.json")
    if os.path.exists(draft_path):
        try:
            with open(draft_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

@router.post("")
def save_draft(draft: DraftModel):
    draft_path = os.path.join(APP_DATA_DIR, "outputs", "draft.json")
    os.makedirs(os.path.dirname(draft_path), exist_ok=True)
    with open(draft_path, "w", encoding="utf-8") as f:
        json.dump(draft.model_dump(), f, ensure_ascii=False, indent=2)
    return {"status": "saved"}
