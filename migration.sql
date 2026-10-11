-- 数据库迁移：给已有 users 表加邮箱验证字段，并新建验证令牌表
-- 仅当之前已执行过旧版 schema.sql（已存在 users/sessions 表）时使用

ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS verify_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_verify_tokens_user ON verify_tokens(user_id);
