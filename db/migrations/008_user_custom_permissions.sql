-- Migration 008: User Custom Permissions
ALTER TABLE users ADD COLUMN permissions TEXT;

UPDATE users SET permissions = '["pos","crm","alerts"]' WHERE username = 'admin';

UPDATE users SET permissions = '["dashboard","pos","products","inventory","purchasing","omnichannel","crm","marketing","accounting","reports","bi","audit","alerts","settings"]' WHERE username = 'manager';
