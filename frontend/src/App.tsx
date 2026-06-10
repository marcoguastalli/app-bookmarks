import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderTree } from "./components/FolderTree.js";
import { BookmarkList } from "./components/BookmarkList.js";
import { ExportPanel } from "./components/ExportPanel.js";
import { ImportPanel } from "./components/ImportPanel.js";
import { Modal } from "./components/Modal.js";
import { api } from "./api/client.js";
import type { FolderTree as FolderTreeType } from "./types/index.js";

export function App() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: treeData } = useQuery<{ data: FolderTreeType[] }>({
    queryKey: ["folders", "tree"],
    queryFn: () => api.get("/folders/tree"),
  });

  const selectedFolderName = findFolderName(treeData?.data ?? [], selectedFolderId);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <FolderTree
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
        />

        {/* Sidebar footer actions */}
        <div className="border-t border-gray-200 p-3 flex flex-col gap-1">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md w-full text-left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import bookmarks
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md w-full text-left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export bookmarks
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {selectedFolderId ? (
          <BookmarkList folderId={selectedFolderId} folderName={selectedFolderName} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <svg className="w-16 h-16 text-gray-200" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <p className="text-sm">Select a folder to view bookmarks</p>
          </div>
        )}
      </main>

      {showExport && (
        <Modal title="Export Bookmarks" onClose={() => setShowExport(false)} size="md">
          <ExportPanel onClose={() => setShowExport(false)} />
        </Modal>
      )}
      {showImport && (
        <Modal title="Import Bookmarks" onClose={() => setShowImport(false)} size="md">
          <ImportPanel onClose={() => setShowImport(false)} />
        </Modal>
      )}
    </div>
  );
}

function findFolderName(tree: FolderTreeType[], id: string | null): string | undefined {
  if (!id) return undefined;
  for (const node of tree) {
    if (node.id === id) return node.name;
    const found = findFolderName(node.children, id);
    if (found) return found;
  }
  return undefined;
}
