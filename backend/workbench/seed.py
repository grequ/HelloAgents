"""Seed data for the workbench — creates demo agents with prefilled use cases
using real, publicly available APIs that can be tested immediately."""

from workbench import wb_db


DEMO_AGENTS = [
    {
        "name": "DummyJSON - Product Catalog",
        "description": "E-commerce product catalog with search, categories, and inventory. Real public API, no auth required.",
        "category": "e-commerce",
        "agent_role": "operator",
        "owner_team": "Product & Catalog",
        "api_type": "rest",
        "api_base_url": "https://dummyjson.com",
        "api_docs_url": "https://dummyjson.com/docs",
        "api_auth_type": "none",
        "api_spec": {
            "openapi": "3.0.0",
            "info": {"title": "DummyJSON — Products", "version": "1.0.0"},
            "servers": [{"url": "https://dummyjson.com"}],
            "paths": {
                "/products": {
                    "get": {
                        "operationId": "listProducts",
                        "summary": "Get all products (paginated)",
                        "parameters": [
                            {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 30}},
                            {"name": "skip", "in": "query", "schema": {"type": "integer", "default": 0}}
                        ],
                        "responses": {"200": {"description": "Product list with total, skip, limit"}}
                    }
                },
                "/products/{id}": {
                    "get": {
                        "operationId": "getProduct",
                        "summary": "Get a single product by ID",
                        "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                        "responses": {"200": {"description": "Product object with title, price, description, category, stock, rating, images"}}
                    }
                },
                "/products/search": {
                    "get": {
                        "operationId": "searchProducts",
                        "summary": "Search products by query string",
                        "parameters": [{"name": "q", "in": "query", "required": True, "schema": {"type": "string"}}],
                        "responses": {"200": {"description": "Matching products"}}
                    }
                },
                "/products/category/{category}": {
                    "get": {
                        "operationId": "getProductsByCategory",
                        "summary": "Get products by category",
                        "parameters": [{"name": "category", "in": "path", "required": True, "schema": {"type": "string"}}],
                        "responses": {"200": {"description": "Products in the category"}}
                    }
                },
                "/products/categories": {
                    "get": {
                        "operationId": "getCategories",
                        "summary": "Get list of all product categories",
                        "responses": {"200": {"description": "Array of category objects"}}
                    }
                }
            }
        },
        "use_cases": [
            {
                "name": "Search for a product",
                "description": "Customer asks about a specific product by name or keyword",
                "trigger_text": "Customer asks 'do you have wireless mice?' or 'show me laptops'",
                "user_input": "Search keyword (e.g. 'laptop', 'phone', 'mascara')",
                "expected_output": "List of matching products with name, price, rating, and availability",
                "frequency": "~500/day",

            },
            {
                "name": "Get product details",
                "description": "Customer wants detailed information about a specific product",
                "trigger_text": "Customer asks 'tell me about product #5' or 'what are the specs?'",
                "user_input": "Product ID (e.g. 1, 5, 10)",
                "expected_output": "Full product details: title, description, price, discount, rating, stock count, brand, category, images",
                "frequency": "~300/day",

            },
            {
                "name": "Check product availability",
                "description": "Agent needs to verify if a product is in stock before promising delivery",
                "trigger_text": "Customer asks 'is this in stock?' or agent checks before confirming order",
                "user_input": "Product ID",
                "expected_output": "Stock count and availability status (in stock / low stock / out of stock)",
                "frequency": "~200/day",

            },
            {
                "name": "Browse products by category",
                "description": "Customer wants to see all products in a category",
                "trigger_text": "Customer asks 'show me all smartphones' or 'what laptops do you have?'",
                "user_input": "Category name (e.g. 'smartphones', 'laptops', 'groceries')",
                "expected_output": "List of products in that category with prices and ratings",
                "frequency": "~150/day",

            },
            {
                "name": "Compare product prices",
                "description": "Customer wants to compare prices across multiple products",
                "trigger_text": "Customer asks 'which laptop is cheapest?' or 'compare iPhone vs Samsung'",
                "user_input": "Search query or category, number of products to compare",
                "expected_output": "Side-by-side comparison of products with prices, discounts, and ratings",
                "frequency": "~80/day",

            },
        ],
    },
    {
        "name": "DummyJSON - Users & Customers",
        "description": "Customer/user management with profiles, addresses, and contact info. Real public API, no auth required.",
        "category": "crm",
        "agent_role": "operator",
        "owner_team": "Customer Service",
        "api_type": "rest",
        "api_base_url": "https://dummyjson.com",
        "api_docs_url": "https://dummyjson.com/docs/users",
        "api_auth_type": "none",
        "api_spec": {
            "openapi": "3.0.0",
            "info": {"title": "DummyJSON — Users", "version": "1.0.0"},
            "servers": [{"url": "https://dummyjson.com"}],
            "paths": {
                "/users/{id}": {
                    "get": {
                        "operationId": "getUser",
                        "summary": "Get user profile by ID",
                        "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                        "responses": {"200": {"description": "User profile with name, email, phone, address, company"}}
                    }
                },
                "/users/search": {
                    "get": {
                        "operationId": "searchUsers",
                        "summary": "Search users by name",
                        "parameters": [{"name": "q", "in": "query", "required": True, "schema": {"type": "string"}}],
                        "responses": {"200": {"description": "Matching users"}}
                    }
                },
                "/users": {
                    "get": {
                        "operationId": "listUsers",
                        "summary": "List all users (paginated)",
                        "parameters": [
                            {"name": "limit", "in": "query", "schema": {"type": "integer"}},
                            {"name": "skip", "in": "query", "schema": {"type": "integer"}}
                        ],
                        "responses": {"200": {"description": "User list"}}
                    }
                },
                "/users/{id}/carts": {
                    "get": {
                        "operationId": "getUserCarts",
                        "summary": "Get shopping carts for a user",
                        "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                        "responses": {"200": {"description": "User's cart history with products and totals"}}
                    }
                }
            }
        },
        "use_cases": [
            {
                "name": "Look up customer profile",
                "description": "Agent needs customer details to personalize service",
                "trigger_text": "Customer provides their ID or agent looks up by name",
                "user_input": "Customer ID (e.g. 1, 5) or name",
                "expected_output": "Full name, email, phone, address, company",
                "frequency": "~400/day",

            },
            {
                "name": "Find customer by name",
                "description": "Search for a customer when only the name is known",
                "trigger_text": "Customer says 'I'm Emily Johnson' and agent needs to find their account",
                "user_input": "Customer name (e.g. 'Emily', 'Johnson')",
                "expected_output": "Matching customer profiles with IDs",
                "frequency": "~200/day",

            },
            {
                "name": "View customer order history",
                "description": "Check what a customer has ordered previously",
                "trigger_text": "Customer asks 'what did I order last time?' or agent checks for context",
                "user_input": "Customer ID",
                "expected_output": "List of carts/orders with products, quantities, and totals",
                "frequency": "~150/day",

            },
        ],
    },
    {
        "name": "DummyJSON - Orders & Carts",
        "description": "Shopping cart and order management with products, quantities, and totals. Real public API, no auth required.",
        "category": "logistics",
        "agent_role": "operator",
        "owner_team": "Fulfillment",
        "api_type": "rest",
        "api_base_url": "https://dummyjson.com",
        "api_docs_url": "https://dummyjson.com/docs/carts",
        "api_auth_type": "none",
        "api_spec": {
            "openapi": "3.0.0",
            "info": {"title": "DummyJSON — Carts", "version": "1.0.0"},
            "servers": [{"url": "https://dummyjson.com"}],
            "paths": {
                "/carts/{id}": {
                    "get": {
                        "operationId": "getCart",
                        "summary": "Get cart/order by ID",
                        "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                        "responses": {"200": {"description": "Cart with products array, each having title, price, quantity, total. Plus discountedTotal, totalProducts, totalQuantity."}}
                    }
                },
                "/carts": {
                    "get": {
                        "operationId": "listCarts",
                        "summary": "List all carts/orders",
                        "parameters": [
                            {"name": "limit", "in": "query", "schema": {"type": "integer"}},
                            {"name": "skip", "in": "query", "schema": {"type": "integer"}}
                        ],
                        "responses": {"200": {"description": "Paginated cart list"}}
                    }
                },
                "/carts/user/{userId}": {
                    "get": {
                        "operationId": "getCartsByUser",
                        "summary": "Get all carts for a specific user",
                        "parameters": [{"name": "userId", "in": "path", "required": True, "schema": {"type": "integer"}}],
                        "responses": {"200": {"description": "All carts belonging to the user"}}
                    }
                }
            }
        },
        "use_cases": [
            {
                "name": "Look up order details",
                "description": "Customer asks about a specific order/cart",
                "trigger_text": "Customer asks 'what's in my order #5?' or 'show me cart details'",
                "user_input": "Cart/Order ID (e.g. 1, 5, 10)",
                "expected_output": "List of items with product names, quantities, prices, and order total",
                "frequency": "~300/day",

            },
            {
                "name": "Check order total and discounts",
                "description": "Customer wants to know the total amount and any discounts applied",
                "trigger_text": "Customer asks 'how much was my order?' or 'did I get a discount?'",
                "user_input": "Cart/Order ID",
                "expected_output": "Total amount, discounted total, savings amount",
                "frequency": "~150/day",

            },
            {
                "name": "Find all orders for a customer",
                "description": "Look up all orders placed by a specific customer",
                "trigger_text": "Agent needs to find all orders for customer #1 to help with a dispute",
                "user_input": "Customer/User ID",
                "expected_output": "List of all orders with dates, totals, and item counts",
                "frequency": "~100/day",

            },
            {
                "name": "Identify items in an order for return",
                "description": "Customer wants to return specific items from an order",
                "trigger_text": "Customer says 'I want to return the laptop from order #3'",
                "user_input": "Cart/Order ID, item description",
                "expected_output": "Matching item details with price, quantity, and whether it's returnable",
                "frequency": "~50/day",

            },
        ],
    },
    {
        "name": "E-Commerce Support Orchestrator",
        "description": "High-level orchestrator that coordinates across product catalog, customer management, and order processing to handle end-to-end customer support inquiries.",
        "category": "support",
        "agent_role": "orchestrator",
        "api_type": "none",
        "api_base_url": "",
        "use_cases": [
            {
                "name": "Handle product inquiry",
                "description": "Customer asks about a product; orchestrator queries the product catalog operator for details, availability, and pricing.",
                "trigger_text": "Customer asks 'do you have wireless headphones?' or 'tell me about product X'",
                "user_input": "Customer question about a product",
                "expected_output": "Product details including name, price, availability, and description sourced from the product catalog operator",
                "frequency": "~400/day",

            },
            {
                "name": "Process return request",
                "description": "Customer wants to return an item; orchestrator coordinates between the orders operator to look up the order and the product catalog operator to verify item details and return eligibility.",
                "trigger_text": "Customer says 'I want to return the laptop from my last order'",
                "user_input": "Customer ID or order ID, item to return",
                "expected_output": "Order confirmation, item match, return eligibility status, and next steps",
                "frequency": "~80/day",

            },
            {
                "name": "Full order status check",
                "description": "Customer asks about order status; orchestrator queries the orders operator for order details and the users operator for customer context to provide a complete status update.",
                "trigger_text": "Customer asks 'where is my order?' or 'what's the status of order #5?'",
                "user_input": "Order ID or customer ID",
                "expected_output": "Complete order status including items, totals, customer shipping address, and delivery context",
                "frequency": "~250/day",

            },
        ],
    },
]


async def seed_demo_data():
    """Create demo agents with prefilled use cases. Skips if data already exists."""
    existing = await wb_db.list_agents()
    if existing:
        return {"seeded": False, "message": "Data already exists", "agents": len(existing)}

    created = []
    agents_by_name = {}
    for agent_data in DEMO_AGENTS:
        use_cases = agent_data.pop("use_cases", [])
        api_spec = agent_data.pop("api_spec", None)

        agent = await wb_db.create_agent(agent_data)
        if api_spec:
            await wb_db.set_agent_api_spec(agent["id"], api_spec)

        uc_ids = []
        for uc_data in use_cases:
            uc = await wb_db.create_use_case(agent["id"], uc_data)
            uc_ids.append(uc["id"])

        agents_by_name[agent_data["name"]] = {"id": agent["id"], "use_case_ids": uc_ids}
        created.append({"name": agent_data["name"], "id": agent["id"], "use_cases": len(use_cases)})

    # Link orchestrator to the 3 operators
    orch = agents_by_name["E-Commerce Support Orchestrator"]
    product = agents_by_name["DummyJSON - Product Catalog"]
    users = agents_by_name["DummyJSON - Users & Customers"]
    orders = agents_by_name["DummyJSON - Orders & Carts"]

    await wb_db.save_interactions(
        orch["id"],
        asks=[
            {"target_agent_id": product["id"], "use_case_ids": product["use_case_ids"]},
            {"target_agent_id": users["id"], "use_case_ids": users["use_case_ids"]},
            {"target_agent_id": orders["id"], "use_case_ids": orders["use_case_ids"]},
        ],
        provides_to=[],
    )

    return {"seeded": True, "agents": created}
