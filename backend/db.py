import aiomysql
import json
import os

_pool: aiomysql.Pool | None = None

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "helloagents")


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        _pool = await aiomysql.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            db=DB_NAME,
            autocommit=True,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        _pool = None


async def get_order(order_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM orders WHERE order_id = %s", (order_id,))
            row = await cur.fetchone()
    if row is None:
        return None
    row["items"] = json.loads(row["items"])
    return row


async def get_all_orders() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute("SELECT * FROM orders ORDER BY order_id")
            rows = await cur.fetchall()
    for r in rows:
        r["items"] = json.loads(r["items"])
    return rows


async def update_order(order_id: str, **fields) -> dict | None:
    pool = await get_pool()
    sets = ", ".join(f"{k} = %s" for k in fields)
    values = [*fields.values(), order_id]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"UPDATE orders SET {sets} WHERE order_id = %s", values
            )
    return await get_order(order_id)
