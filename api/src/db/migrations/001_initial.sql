CREATE TABLE IF NOT EXISTS folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  parent_id  UUID        REFERENCES folders(id) ON DELETE RESTRICT,
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id      UUID        NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  url            TEXT        NOT NULL,
  normalized_url TEXT        NOT NULL,
  description    TEXT,
  favicon_url    TEXT,
  position       INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_folder_id ON bookmarks(folder_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_unique_url_folder
  ON bookmarks(normalized_url, folder_id);
