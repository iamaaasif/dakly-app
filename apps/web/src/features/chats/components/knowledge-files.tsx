import { FileText, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';

import { knowledgeFileBytes, type KnowledgeItemResponse } from '@dakly/contracts/knowledge';
import { Button } from '@dakly/ui/button';

import { useDeleteKnowledgeItem, useUploadKnowledgeFile } from '../api/knowledge-items';
import { KnowledgeItemStatus } from './knowledge-item-status';

type KnowledgeFilesProps = { files: KnowledgeItemResponse[]; canEdit: boolean };

export function KnowledgeFiles({ files, canEdit }: KnowledgeFilesProps) {
  const picker = useRef<HTMLInputElement>(null);
  const upload = useUploadKnowledgeFile();
  const remove = useDeleteKnowledgeItem();
  return (
    <section aria-labelledby="knowledge-files" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="knowledge-files" className="text-sm font-semibold text-text-muted uppercase">
          Files
        </h3>
        {canEdit ? (
          <Button
            variant="secondary"
            loading={upload.isPending}
            onClick={() => picker.current?.click()}
          >
            <Upload aria-hidden="true" size={16} strokeWidth={1.75} />
            Upload a file
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-text-muted">
        PDF or text, up to {knowledgeFileBytes / (1024 * 1024)} MB. Dakly reads the file and learns
        the facts in it.
      </p>
      <input
        ref={picker}
        type="file"
        hidden
        aria-label="Choose a file"
        accept="application/pdf,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) upload.mutate(file);
        }}
      />
      {upload.isError ? (
        <p role="alert" className="text-sm text-danger">
          {upload.error.message}
        </p>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="text-sm text-danger">
          {remove.error.message}
        </p>
      ) : null}
      <ul className="space-y-2">
        {files.map((item) => (
          <FileRow key={item.id} item={item} canEdit={canEdit} onRemove={remove.mutate} />
        ))}
      </ul>
    </section>
  );
}

type FileRowProps = {
  item: KnowledgeItemResponse;
  canEdit: boolean;
  onRemove: (id: string) => void;
};

function FileRow({ item, canEdit, onRemove }: FileRowProps) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
      <FileText aria-hidden="true" size={16} strokeWidth={1.75} />
      <span>Uploaded file</span>
      <KnowledgeItemStatus item={item} />
      {canEdit ? (
        <Button
          variant="secondary"
          className="ml-auto"
          aria-label="Delete file"
          onClick={() => onRemove(item.id)}
        >
          <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
        </Button>
      ) : null}
    </li>
  );
}
