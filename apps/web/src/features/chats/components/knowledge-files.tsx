import { FileText, Link as LinkIcon, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';

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
          Files and links
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
        Upload a size chart, return policy or price list. Dakly reads it and uses it in replies. PDF
        or text, up to {knowledgeFileBytes / (1024 * 1024)} MB.
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
  const [confirming, setConfirming] = useState(false);
  const Icon = item.kind === 'url' ? LinkIcon : FileText;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="text-text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {item.sourceUrl ?? item.fileName ?? 'Uploaded file'}
        </span>
        <KnowledgeItemStatus item={item} />
      </span>
      {canEdit && !confirming ? (
        <Button
          variant="secondary"
          className="min-h-8 min-w-8 border-0 bg-transparent p-0 text-text-muted"
          aria-label="Delete file"
          onClick={() => setConfirming(true)}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.75} />
        </Button>
      ) : null}
      {confirming ? (
        <div role="alert" className="flex w-full flex-wrap items-center gap-3">
          <span>Dakly will forget what it learned from this file.</span>
          <Button variant="danger" onClick={() => onRemove(item.id)}>
            Delete file
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : null}
    </li>
  );
}
