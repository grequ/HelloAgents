CREATE DATABASE IF NOT EXISTS helloagents;
USE helloagents;

CREATE TABLE IF NOT EXISTS orders (
    order_id        VARCHAR(20) PRIMARY KEY,
    customer        VARCHAR(100) NOT NULL,
    items           JSON NOT NULL,
    status          VARCHAR(30) NOT NULL,
    tracking        VARCHAR(50),
    carrier         VARCHAR(50),
    eta             DATE,
    payment_status  VARCHAR(30) NOT NULL,
    amount          DECIMAL(10,2) NOT NULL,
    invoice         VARCHAR(30)
);

INSERT IGNORE INTO orders (order_id, customer, items, status, tracking, carrier, eta, payment_status, amount, invoice) VALUES
    ('ORD-001', 'Alice', '["Wireless Mouse","USB-C Hub"]',
     'shipped', 'TRK-98765', 'FastShip', '2026-03-30',
     'paid', 79.98, 'INV-1001'),

    ('ORD-002', 'Bob', '["Mechanical Keyboard"]',
     'processing', NULL, NULL, NULL,
     'pending', 129.99, NULL),

    ('ORD-003', 'Alice', '["Monitor Stand"]',
     'delivered', 'TRK-11111', 'FastShip', '2026-03-25',
     'refund_requested', 49.99, 'INV-1003');
