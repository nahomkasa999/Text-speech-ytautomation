"""Token-scoped transport for native video export. Paths come only from Save As."""
from fastapi import APIRouter, HTTPException, Request
import time
from starlette.concurrency import run_in_threadpool

from src.services.native_export import export_manager, MAX_CHUNK

router = APIRouter(prefix='/api/native-export', tags=['native-export'])


def _job(token):
    try:
        return export_manager.get(token)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


async def _call(method, *args):
    try:
        return await run_in_threadpool(method, *args)
    except (ValueError, OSError) as exc:
        raise HTTPException(400, str(exc)) from exc


async def _bounded_body(request, limit):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(413, 'Export upload is too large.')
        body.extend(chunk)
    return body


@router.put('/{token}/music')
async def music(token: str, offset: int, request: Request):
    job = _job(token)
    if not job.transport.acquire(blocking=False):
        raise HTTPException(409, 'Another upload is in progress.')
    try:
        return await _call(export_manager.upload_music, token, offset, await _bounded_body(request, MAX_CHUNK))
    finally:
        job.transport.release()


@router.post('/{token}/start')
async def start(token: str):
    _job(token)
    return await _call(export_manager.start, token)


@router.put('/{token}/frame')
async def frame(token: str, index: int, request: Request, repeat: int = 1):
    job = _job(token)
    if not job.transport.acquire(blocking=False):
        raise HTTPException(409, 'Another upload is in progress.')
    try:
        body = await _bounded_body(request, job.width * job.height * 4)
        return await _call(export_manager.frame, token, index, repeat, body)
    finally:
        job.transport.release()


@router.post('/{token}/finish')
async def finish(token: str):
    _job(token)
    return await _call(export_manager.finish, token)


@router.get('/{token}/status')
async def status(token: str):
    job = _job(token)
    job.touched = time.monotonic()
    return job.status()


@router.delete('/{token}')
async def cancel(token: str):
    _job(token)
    return await _call(export_manager.cancel, token)
