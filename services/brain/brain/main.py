"""NextUp brain API. Only the app calls it, from the server, inside the company's stack.

    uv run uvicorn brain.main:app --port 8000
"""

import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from brain.coach import coach
from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.plan import checkin, plan
from brain.read import read_idea
from brain.route import route
from brain.schemas import CheckinIn, CheckinOut, CoachIn, CoachOut, PlanIn, PlanOut, ReadIn, ReadOut, RouteIn, RouteOut

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


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 as FastAPI answers it, minus the submitted values: they may hold the company's model key."""
    errors = [{k: v for k, v in e.items() if k not in ("input", "ctx", "url")} for e in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


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
        out = await run_in_threadpool(route, request.app.state.llm.for_request(body.llm), body)
    except LLMOutputError as e:
        log.error("route failed: %s", e)
        raise HTTPException(502, "The language model returned invalid output. Please retry.")
    if settings.log_content:
        log.info("route idea=%r -> %s", body.idea.title, out.route_id)
    log.info("route rows=%d known=%d route=%s same_as=%s ms=%d",
             len(body.routes), len(body.known), out.route_id, out.same_as, out.ms)
    return out


@app.post("/v1/read", response_model=ReadOut)
async def post_read(body: ReadIn, request: Request) -> ReadOut:
    """The reading of an idea: what the raise page shows on every turn."""
    try:
        out = await run_in_threadpool(read_idea, request.app.state.llm.for_request(body.llm), body)
    except LLMOutputError as e:
        log.error("read failed: %s", e)
        raise HTTPException(502, "The language model returned invalid output. Please retry.")
    log.info("read known=%d overall=%d route=%s same_as=%s open=%d ms=%d",
             len(body.known), out.overall, out.route_id, out.same_as, len(out.open), out.ms)
    return out


@app.post("/v1/coach", response_model=CoachOut)
async def post_coach(body: CoachIn, request: Request) -> CoachOut:
    try:
        out = await run_in_threadpool(coach, request.app.state.llm.for_request(body.llm), body)
    except LLMOutputError as e:
        log.error("coach failed: %s", e)
        raise HTTPException(502, "The language model returned invalid output. Please retry.")
    if settings.log_content:
        log.info("coach idea=%r -> %r", body.idea.title, out.question)
    log.info("coach turns=%d known=%d point=%s earlier=%s ms=%d",
             len(body.history), len(body.known), out.open_point, out.earlier_id, out.ms)
    return out


@app.post("/v1/plan", response_model=PlanOut)
async def post_plan(body: PlanIn, request: Request) -> PlanOut:
    """An accepted idea: its first steps and the number to measure it on. The lead picks."""
    try:
        out = await run_in_threadpool(plan, request.app.state.llm.for_request(body.llm), body)
    except LLMOutputError as e:
        log.error("plan failed: %s", e)
        raise HTTPException(502, "The language model returned invalid output. Please retry.")
    log.info("plan steps=%d metric=%s ms=%d", len(out.steps), out.metric is not None, out.ms)
    return out


@app.post("/v1/checkin", response_model=CheckinOut)
async def post_checkin(body: CheckinIn, request: Request) -> CheckinOut:
    """A discussion round: a draft of its check-in. The desk holder edits it."""
    try:
        out = await run_in_threadpool(checkin, request.app.state.llm.for_request(body.llm), body)
    except LLMOutputError as e:
        log.error("checkin failed: %s", e)
        raise HTTPException(502, "The language model returned invalid output. Please retry.")
    log.info("checkin round=%d said=%d next=%s open=%d ms=%d", body.round, len(body.said), out.next, len(out.open), out.ms)
    return out


@app.get("/health")
def health(request: Request):
    llm: LLMClient = request.app.state.llm
    state = llm.health()
    return {
        "status": "ok" if state["reachable"] and state["model_available"] else "degraded",
        "llm": {"model": llm.settings.llm_model, **state},
    }
