import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, ExternalLink, FileText, FolderOpen, HardDrive, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChartHeader, FilterSelect } from "@/components/dashboard/primitives";
import { ApiError, apiDelete, apiGet, apiUpload } from "@/lib/api";
import { formatBytes, formatNumber } from "@/lib/format";
import type { FileCategory, FileListResponse, FileRecord } from "@/lib/types";

const categories: { value: FileCategory; label: string }[] = [
  { value: "mandi-receipt", label: "Mandi receipt" },
  { value: "weather-log", label: "Weather log" },
  { value: "field-photo", label: "Field photo" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

const errorDetail = (error: unknown) => {
  if (error instanceof ApiError && error.body && typeof error.body === "object" && "detail" in error.body) {
    const detail = (error.body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return error instanceof Error ? error.message : "Upload failed";
};

export function FilesPanel() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [category, setCategory] = useState<FileCategory>("mandi-receipt");
  const [label, setLabel] = useState("");
  const [dragging, setDragging] = useState(false);

  const filesQuery = useQuery({ queryKey: ["files"], queryFn: () => apiGet<FileListResponse>("/files") });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      if (label.trim()) form.append("label", label.trim());
      return apiUpload<FileRecord>("/files", form);
    },
    onSuccess: (record) => {
      toast.success(`${record.filename} stored`);
      setPending(null);
      setLabel("");
      if (inputRef.current) inputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error) => toast.error(errorDetail(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/files/${id}`),
    onSuccess: () => {
      toast.success("File removed");
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error) => toast.error(errorDetail(error)),
  });

  const data = filesQuery.data;
  const categoryLabel = categories.find((item) => item.value === category)?.label ?? "Other";

  return (
    <Card className="surface-card chart-card files-card rise-in" data-testid="files-card">
      <ChartHeader icon={FolderOpen} eyebrow="File & media storage" title="Evidence locker" detail="Mandi receipts, weather sensor logs, field photos and reports attached to this board" aside={<Badge variant="outline" data-testid="files-count">{formatNumber(data?.files.length)} files · {formatBytes(data?.total_bytes ?? 0)}</Badge>} />
      <CardContent className="chart-content">
        <div
          className={`dropzone ${dragging ? "is-active" : ""}`}
          data-testid="file-dropzone"
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) setPending(file); }}
        >
          <input ref={inputRef} type="file" data-testid="file-input" accept={data?.allowed_types.join(",")} onChange={(event) => setPending(event.target.files?.[0] ?? null)} />
          <span className="drop-icon"><CloudUpload size={17} /></span>
          <strong data-testid="file-dropzone-title">{pending ? pending.name : "Drop a file here or click to browse"}</strong>
          <span data-testid="file-dropzone-hint">{pending ? `${formatBytes(pending.size)} · ready to upload` : `Up to ${data?.max_file_mb ?? 15} MB · ${data?.allowed_types.join(" ") ?? "images, pdf, csv, xlsx"}`}</span>
        </div>
        <div className="upload-meta">
          <FilterSelect label="Category" value={categoryLabel} options={categories.map((item) => item.label)} allLabel={null} testId="file-category-select" onChange={(value) => setCategory(categories.find((item) => item.label === value)?.value ?? "other")} />
          <label className="filter-control" data-testid="file-label-field"><span>Label (optional)</span><input data-testid="file-label-input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Amritsar gate pass 09 Sep" /></label>
          <Button data-testid="file-upload-button" disabled={!pending || upload.isPending} onClick={() => pending && upload.mutate(pending)}><CloudUpload size={14} /> {upload.isPending ? "Uploading…" : "Upload"}</Button>
        </div>

        <div className="file-list" data-testid="file-list">
          {data && data.files.length === 0 && <div className="file-empty" data-testid="file-list-empty">Nothing stored yet — attach the first receipt or sensor log.</div>}
          {data?.files.map((file) => (
            <div className="file-tile" key={file.id} data-testid={`file-tile-${file.id}`}>
              <div className="file-thumb">{file.is_image ? <img src={file.url} alt={file.label ?? file.filename} loading="lazy" /> : <FileText size={26} />}</div>
              <div className="file-body">
                <strong title={file.filename}>{file.label || file.filename}</strong>
                <span>{file.filename} · {formatBytes(file.size_bytes)}</span>
                <em className="file-tag">{categories.find((item) => item.value === file.category)?.label ?? file.category}</em>
                <div className="file-actions">
                  <a href={file.url} target="_blank" rel="noreferrer" data-testid={`file-open-${file.id}`}><ExternalLink size={12} /> Open</a>
                  <button type="button" data-testid={`file-delete-${file.id}`} onClick={() => remove.mutate(file.id)} disabled={remove.isPending}><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="storage-note"><HardDrive size={13} /> Stored on the board's server disk · metadata in MongoDB · served via /api/files</div>
      </CardContent>
    </Card>
  );
}
