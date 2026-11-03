exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_email_nonempty CHECK (length(btrim(email)) > 0),
      CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
      CONSTRAINT users_email_unique UNIQUE (email)
    );

    CREATE TABLE workspaces (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT workspaces_name_nonempty CHECK (length(btrim(name)) > 0)
    );

    CREATE TABLE workspace_members (
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      role text NOT NULL CHECK (role IN ('owner', 'member', 'viewer')),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE INDEX workspace_members_user_id_idx
      ON workspace_members (user_id);

    CREATE UNIQUE INDEX workspace_members_one_owner_idx
      ON workspace_members (workspace_id)
      WHERE role = 'owner';

    CREATE TABLE documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title text NOT NULL,
      content_markdown text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT documents_title_nonempty CHECK (length(btrim(title)) > 0)
    );

    CREATE INDEX documents_workspace_updated_at_idx
      ON documents (workspace_id, updated_at DESC);
  `);
};

// Dropping these tables would delete application data. Rollback is intentionally
// blocked until an explicit data-retention/rollback policy is approved.
exports.down = () => {
  throw new Error(
    'Refusing to drop application tables automatically. Approve a data-retention policy before adding a destructive rollback.',
  );
};
