"""NextUp brain API. Only the app calls it, from the server, inside the company's stack.

    uv run uvicorn brain.main:app --port 8000
"""

import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.route import route
from brain.schemas import RouteIn, RouteOut

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # its request lines are noise
log = logging.getLogger("brain.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not hasattr(app.state, "llm"):  # tests inject their own client
        app.state.llm = LLMClient(settings)
    yield


# No CORS: browsers never call this service, only the app's server does.
app = FastAPI(title="NextUp brain", version="0.1.0", lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    """If API_KEY is set, every request except /health needs a matching X-API-Key header."""
    if settings.api_key and request.url.path != "/health":
        if not hmac.compare_digest(request.headers.get("x-api-key", ""), settings.api_key):
            return JSONResponse({"detail": "missing or invalid X-API-Key"}, status_code=401)
    return await call_next(request)


@app.post("/v1/route", response_model=RouteOut)
async def post_route(body: RouteIn, request: Request) -> RouteOut:
    try:
        out = await run_in_threadpool(route, request.app.state.llm, body)
    except LLMOutputError as e:
        log.error("route failed: %s", e)
        raise HTTPException(502, "The language model returned invalid output. Please retry.")
    if settings.log_content:
        log.info("route idea=%r -> %s", body.idea.title, out.route_id)
    log.info("route rows=%d known=%d route=%s same_as=%s ms=%d",
             len(body.routes), len(body.known), out.route_id, out.same_as, out.ms)
    return out


@app.get("/health")
def health(request: Request):
    llm: LLMClient = request.app.state.llm
    state = llm.health()
    return {
        "status": "ok" if state["reachable"] and state["model_available"] else "degraded",
        "llm": {"model": llm.settings.llm_model, **state},
    }
