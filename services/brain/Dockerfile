# NextUp brain. Built from this folder: docker build -t nextup-brain:local services/brain
FROM ghcr.io/astral-sh/uv:0.11-python3.12-trixie-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /srv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY brain ./brain

FROM python:3.12-slim-trixie AS run
ENV PYTHONUNBUFFERED=1 PATH=/srv/.venv/bin:$PATH DO_NOT_TRACK=1 HF_HUB_OFFLINE=1
WORKDIR /srv
COPY --from=build /srv /srv
USER 1001:1001
EXPOSE 8000
CMD ["uvicorn", "brain.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
