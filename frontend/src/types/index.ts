export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface FolderTree extends Folder {
  children: FolderTree[];
}

export interface Bookmark {
  id: string;
  folder_id: string;
  title: string;
  url: string;
  normalized_url: string;
  description: string | null;
  favicon_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export interface ImportLog {
  action: "imported" | "skipped";
  title: string;
  url: string;
  reason?: string;
}

export interface ImportResult {
  dry_run: boolean;
  imported: number;
  skipped: number;
  warnings: string[];
  logs: ImportLog[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
