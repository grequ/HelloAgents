"""FastAPI backend — exposes /chat and /orders endpoints."""

from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (one level up from backend/)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
from agents import support
from workbench.routes import router as workbench_router
from workbench import wb_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run schema migrations (idempotent — safe to run every startup)
    try:
        await wb_db.ensure_schema()
    except Exception as e:
        print(f"[warn] Schema migration skipped: {e}")
    yield
    await db.close_pool()


app = FastAPI(title="HelloAgents", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workbench_router)


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    trace: list[dict]


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    reply, trace = await support.handle(req.message)
    return ChatResponse(reply=reply, trace=trace)


@app.get("/orders")
async def list_orders():
    orders = await db.get_all_orders()
    # Convert types for JSON serialization
    for o in orders:
        if o.get("eta"):
            o["eta"] = o["eta"].isoformat()
        o["amount"] = float(o["amount"])
    return orders
