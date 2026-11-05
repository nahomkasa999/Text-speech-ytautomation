"""
Session routes for listing, updating, and deleting narration projects.
"""

from fastapi import APIRouter, HTTPException
from src.services.engine_service import session_mgr
from src.models import DeleteSessionRequest, UpdateSessionRequest

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

@router.get("")
def list_sessions():
    return session_mgr.list_sessions()

@router.post("/delete")
def delete_session(req: DeleteSessionRequest):
    success = session_mgr.delete_session(req.session_id)
    return {"success": success}

@router.post("/update")
def update_session(req: UpdateSessionRequest):
    fields = {}
    if req.bg_image is not None:
        if req.bg_image.startswith("data:"):
            raise HTTPException(status_code=400, detail="Upload the image first and send its URL")
        fields["bg_image"] = req.bg_image
    updated = session_mgr.update_session(req.session_id, fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "session": updated}
