import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Bookmark } from "../types/index.js";

interface Props {
  bookmark?: Bookmark;
  defaultFolderId?: string;
  onClose: () => void;
}

export function BookmarkForm({ bookmark, defaultFolderId, onClose }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(bookmark?.title ?? "");
  const [url, setUrl] = useState(bookmark?.url ?? "");
  const [description, setDescription] = useState(bookmark?.description ?? "");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { title: string; url: string; description: string | null; folder_id?: string }) =>
      bookmark
        ? api.put(`/bookmarks/${bookmark.id}`, data)
        : api.post("/bookmarks", { ...data, folder_id: defaultFolderId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      onClose();
    },
    onError: (err: any) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    if (!url.trim()) { setError("URL is required"); return; }
    mutation.mutate({
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Bookmark title"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://example.com"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional description"
          rows={3}
        />
      </div>
      {bookmark && (
        <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-400 pt-1">
          <span>Created: {new Date(bookmark.created_at).toLocaleString()}</span>
          <span>Updated: {new Date(bookmark.updated_at).toLocaleString()}</span>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
        >
          {mutation.isPending ? "Saving..." : bookmark ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
