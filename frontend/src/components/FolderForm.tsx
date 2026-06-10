import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Folder, FolderTree } from "../types/index.js";

interface Props {
  folder?: Folder;
  defaultParentId?: string | null;
  onClose: () => void;
}

export function FolderForm({ folder, defaultParentId, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState(folder?.name ?? "");
  const [parentId, setParentId] = useState<string>(
    folder?.parent_id ?? defaultParentId ?? ""
  );
  const [error, setError] = useState("");

  const { data: treeData } = useQuery<{ data: FolderTree[] }>({
    queryKey: ["folders", "tree"],
    queryFn: () => api.get("/folders/tree"),
  });

  const flatFolders: Folder[] = [];
  function flatten(nodes: FolderTree[], depth = 0) {
    for (const n of nodes) {
      if (!folder || n.id !== folder.id) {
        flatFolders.push({ ...n, name: "  ".repeat(depth) + n.name });
        flatten(n.children, depth + 1);
      }
    }
  }
  flatten(treeData?.data ?? []);

  const mutation = useMutation({
    mutationFn: (data: { name: string; parent_id: string | null }) =>
      folder
        ? api.put(`/folders/${folder.id}`, data)
        : api.post("/folders", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      onClose();
    },
    onError: (err: any) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required"); return; }
    mutation.mutate({ name: name.trim(), parent_id: parentId || null });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Folder name"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Parent folder</label>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">None (root)</option>
          {flatFolders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>
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
          {mutation.isPending ? "Saving..." : folder ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
