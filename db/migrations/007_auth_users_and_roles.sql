-- Migration 007: Ensure Manager and Admin users exist for role-based authentication
INSERT OR IGNORE INTO users (branch_id, username, password_hash, full_name, role, phone, is_active)
VALUES (1, 'manager', '123456', 'مدیر ارشد فروشگاه', 'MANAGER', '09120000001', 1);

UPDATE users SET password_hash = '123456' WHERE username = 'admin' AND (password_hash IS NULL OR password_hash = 'password123');
UPDATE users SET password_hash = '123456' WHERE username = 'manager';
