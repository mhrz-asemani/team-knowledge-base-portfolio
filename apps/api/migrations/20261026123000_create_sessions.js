exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      CONSTRAINT sessions_token_hash_format
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT sessions_expiry_after_creation
        CHECK (expires_at > created_at)
    );

    CREATE INDEX sessions_user_id_idx ON sessions (user_id);
    CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
  `);
};

exports.down = () => {
  throw new Error(
    'Refusing to drop sessions automatically because that would invalidate active sessions. Approve a session-retention policy before adding a destructive rollback.',
  );
};
