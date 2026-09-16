-- Migration 003: Sales Returns, Exchanges, and Order Item Tracking
-- Add returned_quantity column to order_items to support partial and anti-double returns
ALTER TABLE order_items ADD COLUMN returned_quantity INTEGER NOT NULL DEFAULT 0;
