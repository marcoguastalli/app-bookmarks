import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { FolderTree } from "../types/index.js";

interface Props {
  onClose: () => void;
}

interface CheckboxNodeProps {
  node: FolderTree;
  depth: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
}

function CheckboxNode({ node, depth, selected, onToggle }: CheckboxNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 hover:bg-gray-50 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => onToggle(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="w-4 h-4 flex items-center justify-center text-gray-400 flex-shrink-0"
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}
        <input
          type="checkbox"
          checked={selected.has(node.id)}
          onChange={() => onToggle(node.id)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
        />
        <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        <span className="text-sm text-gray-700">{node.name}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <CheckboxNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ExportPanel({ onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const { data } = useQuery<{ data: FolderTree[] }>({
    queryKey: ["folders", "tree"],
    queryFn: () => api.get("/folders/tree"),
  });

  const tree = data?.data ?? [];

  function getAllIds(nodes: FolderTree[]): string[] {
    return nodes.flatMap((n) => [n.id, ...getAllIds(n.children)]);
  }

  const allIds = getAllIds(tree);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allIds));
  const selectNone = () => setSelected(new Set());

  const handleExport = async () => {
    if (selected.size === 0) { setError("Select at least one folder"); return; }
    setError("");
    setExporting(true);
    try {
      const res = await api.postRaw(
        "/export",
        JSON.stringify({ folder_ids: [...selected] }),
        { "Content-Type": "application/json" }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data?.error?.message ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bookmarks.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <button onClick={selectAll} className="text-blue-600 hover:underline">Select all</button>
        <span className="text-gray-300">|</span>
        <button onClick={selectNone} className="text-blue-600 hover:underline">Select none</button>
        <span className="text-gray-400 ml-auto">{selected.size} folder(s) selected</span>
      </div>

      <div className="border rounded-md p-3 max-h-64 overflow-y-auto bg-gray-50">
        {tree.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No folders available</p>
        ) : (
          tree.map((node) => (
            <CheckboxNode
              key={node.id}
              node={node}
              depth={0}
              selected={selected}
              onToggle={toggle}
            />
          ))
        )}
      </div>

      <p className="text-xs text-gray-500">
        Generates a Netscape Bookmark Format HTML file importable in Chrome, Firefox, and Safari.
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
        >
          Cancel
        </button>
        <button
          onClick={handleExport}
          disabled={exporting || selected.size === 0}
          className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 flex items-center gap-2"
        >
          {exporting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Exporting...
            </>
          ) : (
            "Download bookmarks.html"
          )}
        </button>
      </div>
    </div>
  );
}
