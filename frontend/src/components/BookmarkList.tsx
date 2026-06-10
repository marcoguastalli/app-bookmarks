import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Bookmark, PaginatedResponse } from "../types/index.js";
import { Modal } from "./Modal.js";
import { BookmarkForm } from "./BookmarkForm.js";

interface Props {
  folderId: string;
  folderName?: string;
}

const PAGE_SIZE = 50;

export function BookmarkList({ folderId, folderName }: Props) {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editBookmark, setEditBookmark] = useState<Bookmark | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<Bookmark>>({
    queryKey: ["bookmarks", folderId, page, search],
    queryFn: () => {
      const params = new URLSearchParams({
        folder_id: folderId,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        ...(search ? { q: search } : {}),
      });
      return api.get(`/bookmarks?${params}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bookmarks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      setDeleteTarget(null);
    },
  });

  const bookmarks = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getFaviconSrc = (b: Bookmark): string | undefined => {
    if (b.favicon_url) return b.favicon_url;
    try {
      const url = new URL(b.url.startsWith("http") ? b.url : `https://${b.url}`);
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=16`;
    } catch {
      return undefined;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-white">
        <h2 className="text-lg font-semibold text-gray-900 flex-1">
          {folderName ?? "Bookmarks"}
          {total > 0 && <span className="ml-2 text-sm font-normal text-gray-400">({total})</span>}
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search..."
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
        )}
        {!isLoading && bookmarks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
            <span>{search ? "No bookmarks match your search." : "No bookmarks yet."}</span>
            {!search && (
              <button onClick={() => setShowAdd(true)} className="text-blue-500 hover:underline">
                Add your first bookmark
              </button>
            )}
          </div>
        )}
        {bookmarks.map((b) => (
          <div
            key={b.id}
            className="group flex items-start gap-3 px-6 py-3 border-b border-gray-50 hover:bg-gray-50"
          >
            {getFaviconSrc(b) && (
              <img
                src={getFaviconSrc(b)}
                alt=""
                className="w-4 h-4 mt-1 flex-shrink-0 rounded"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="flex-1 min-w-0">
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline block truncate"
              >
                {b.title}
              </a>
              <span className="text-xs text-gray-400 truncate block">{b.url}</span>
              {b.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{b.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 flex-shrink-0">
              <button
                onClick={() => setEditBookmark(b)}
                className="p-1 text-gray-400 hover:text-blue-600 rounded"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => setDeleteTarget(b)}
                className="p-1 text-gray-400 hover:text-red-600 rounded"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t bg-white text-sm text-gray-600">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <Modal title="Add Bookmark" onClose={() => setShowAdd(false)}>
          <BookmarkForm defaultFolderId={folderId} onClose={() => setShowAdd(false)} />
        </Modal>
      )}
      {editBookmark && (
        <Modal title="Edit Bookmark" onClose={() => setEditBookmark(null)}>
          <BookmarkForm bookmark={editBookmark} onClose={() => setEditBookmark(null)} />
        </Modal>
      )}
      {deleteTarget && (
        <Modal title="Delete Bookmark" onClose={() => setDeleteTarget(null)} size="sm">
          <p className="text-sm text-gray-600 mb-4">
            Delete <strong>{deleteTarget.title}</strong>?
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
