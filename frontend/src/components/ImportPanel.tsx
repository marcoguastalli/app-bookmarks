import React, { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { FolderTree, ImportResult, ImportLog } from "../types/index.js";

interface Props {
  onClose: () => void;
}

export function ImportPanel({ onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const { data: treeData } = useQuery<{ data: FolderTree[] }>({
    queryKey: ["folders", "tree"],
    queryFn: () => api.get("/folders/tree"),
  });

  const flatFolders: { id: string; name: string }[] = [];
  function flatten(nodes: FolderTree[], depth = 0) {
    for (const n of nodes) {
      flatFolders.push({ id: n.id, name: "  ".repeat(depth) + n.name });
      flatten(n.children, depth + 1);
    }
  }
  flatten(treeData?.data ?? []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFileName(file.name);
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Please select a file"); return; }
    if (!folderId) { setError("Please select a target folder"); return; }

    setError("");
    setResult(null);
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const params = new URLSearchParams({ folder_id: folderId, ...(dryRun ? { dryRun: "true" } : {}) });
      const res = await api.postRaw(`/import?${params}`, formData);

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Import failed");
        return;
      }

      setResult(data as ImportResult);
      if (!dryRun) {
        qc.invalidateQueries({ queryKey: ["bookmarks"] });
        qc.invalidateQueries({ queryKey: ["folders"] });
        setTimeout(onClose, 1500);
      }
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Bookmarks file (HTML)</label>
        <div className="flex items-center gap-2">
          <label className="flex-1 px-3 py-2 border border-dashed border-gray-300 rounded-md cursor-pointer hover:border-blue-400 bg-gray-50 text-center">
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm"
              className="hidden"
              onChange={handleFileChange}
            />
            <span className="text-sm text-gray-500">{fileName || "Click to select file..."}</span>
          </label>
        </div>
        <p className="text-xs text-gray-400 mt-1">Supports Netscape Bookmark Format (exported from Chrome, Firefox, Safari)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Target folder *</label>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="">Select a folder...</option>
          {flatFolders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => { setDryRun(e.target.checked); setResult(null); }}
          className="w-4 h-4 rounded border-gray-300 text-blue-600"
        />
        <span className="text-sm text-gray-700">Dry run (preview without importing)</span>
      </label>

      {result && (
        <div className={`rounded-md border ${dryRun ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200"}`}>
          <div className="px-4 pt-4 pb-3">
            <h3 className={`text-sm font-semibold mb-2 ${dryRun ? "text-blue-800" : "text-green-800"}`}>
              {dryRun ? "Dry run preview" : "Import complete"}
            </h3>
            <div className="flex gap-4 text-sm">
              <span className="text-gray-700"><span className="font-semibold text-green-700">{result.imported}</span> imported</span>
              <span className="text-gray-700"><span className="font-semibold text-amber-600">{result.skipped}</span> skipped</span>
              <span className="text-gray-700"><span className="font-semibold text-gray-600">{result.logs.length}</span> total</span>
            </div>
          </div>
          {result.logs.length > 0 && (
            <div className="border-t border-current border-opacity-10">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white bg-opacity-80">
                    <tr className="text-left text-gray-500 border-b">
                      <th className="px-3 py-1.5 font-medium w-20">Status</th>
                      <th className="px-3 py-1.5 font-medium">Title</th>
                      <th className="px-3 py-1.5 font-medium">URL</th>
                      <th className="px-3 py-1.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.logs.map((log: ImportLog, i: number) => (
                      <tr key={i} className={`border-b border-gray-100 ${log.action === "skipped" ? "bg-amber-50" : ""}`}>
                        <td className="px-3 py-1.5">
                          <span className={`font-medium ${log.action === "imported" ? "text-green-700" : "text-amber-600"}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 max-w-[160px] truncate text-gray-700" title={log.title}>{log.title}</td>
                        <td className="px-3 py-1.5 max-w-[200px] truncate text-gray-500" title={log.url}>{log.url}</td>
                        <td className="px-3 py-1.5 text-gray-400">{log.reason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
        >
          Close
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 flex items-center gap-2"
        >
          {importing ? "Processing..." : dryRun ? "Preview import" : "Import"}
        </button>
      </div>
    </div>
  );
}
