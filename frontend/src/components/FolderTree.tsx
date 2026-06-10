import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { FolderTree as FolderTreeType } from "../types/index.js";
import { Modal } from "./Modal.js";
import { FolderForm } from "./FolderForm.js";

interface Props {
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
}

interface TreeNodeProps {
  node: FolderTreeType;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function TreeNode({ node, depth, selectedId, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (force: boolean) =>
      api.delete(`/folders/${node.id}${force ? "?force=true" : ""}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
    onError: (err: any) => {
      if (err.code === "FOLDER_NOT_EMPTY") {
        setShowConfirmDelete(true);
      }
    },
  });

  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm select-none
          ${isSelected ? "bg-blue-100 text-blue-800" : "text-gray-700 hover:bg-gray-100"}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        <svg className="w-4 h-4 flex-shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>

        <span className="flex-1 truncate">{node.name}</span>

        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            title="Add subfolder"
            onClick={() => setShowAddChild(true)}
            className="p-0.5 text-gray-400 hover:text-blue-600 rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            title="Rename"
            onClick={() => setShowEdit(true)}
            className="p-0.5 text-gray-400 hover:text-blue-600 rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            title="Delete"
            onClick={() => deleteMutation.mutate(false)}
            className="p-0.5 text-gray-400 hover:text-red-600 rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {showEdit && (
        <Modal title="Rename Folder" onClose={() => setShowEdit(false)}>
          <FolderForm folder={node} onClose={() => setShowEdit(false)} />
        </Modal>
      )}
      {showAddChild && (
        <Modal title="New Subfolder" onClose={() => setShowAddChild(false)}>
          <FolderForm defaultParentId={node.id} onClose={() => setShowAddChild(false)} />
        </Modal>
      )}
      {showConfirmDelete && (
        <Modal title="Delete Folder" onClose={() => setShowConfirmDelete(false)} size="sm">
          <p className="text-sm text-gray-600 mb-4">
            This folder is not empty. Delete all its contents?
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowConfirmDelete(false)}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={() => { deleteMutation.mutate(true); setShowConfirmDelete(false); }}
              className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md"
            >
              Delete All
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function FolderTree({ selectedFolderId, onSelectFolder }: Props) {
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error } = useQuery<{ data: FolderTreeType[] }>({
    queryKey: ["folders", "tree"],
    queryFn: () => api.get("/folders/tree"),
  });

  const tree = data?.data ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h1 className="font-semibold text-gray-900">Bookmarks</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="p-1 text-gray-400 hover:text-blue-600 rounded"
          title="New folder"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && (
          <div className="px-4 py-2 text-sm text-gray-400">Loading...</div>
        )}
        {error && (
          <div className="px-4 py-2 text-sm text-red-500">Failed to load folders</div>
        )}
        {!isLoading && tree.length === 0 && (
          <div className="px-4 py-2 text-sm text-gray-400">No folders yet. Create one!</div>
        )}
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedFolderId}
            onSelect={onSelectFolder}
          />
        ))}
      </div>

      {showCreate && (
        <Modal title="New Folder" onClose={() => setShowCreate(false)}>
          <FolderForm onClose={() => setShowCreate(false)} />
        </Modal>
      )}
    </div>
  );
}
