"""In-app update routes (see src/updater.py)."""

from fastapi import APIRouter

from src import updater

router = APIRouter(prefix="/api/update", tags=["updates"])


@router.get("/status")
def update_status(check: bool = False):
    """Current version, latest published version and download progress."""
    return updater.status(force_check=check)


@router.post("/download")
def update_download():
    return updater.start_download()


@router.post("/restart")
def update_restart():
    updater.restart_soon()
    return {"ok": True}


@router.post("/confirm")
def update_confirm():
    """The UI loaded fine on this version: keep it (cancels automatic rollback)."""
    updater.confirm_running_version()
    return {"ok": True}
