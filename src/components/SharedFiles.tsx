
import {
  uploadSharedFile,
  deleteSharedFile,
} from '@/app/(app)/actions'
import { ActionForm, SubmitButton } from './ActionForm'

type Model = {
  id: string
  name: string
}

type SharedFile = {
  id: string
  name: string
  description: string | null
  size_bytes: number
  created_at: string
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SharedFiles({
  models,
  files,
  canManage,
}: {
  models: Model[]
  files: SharedFile[]
  canManage: boolean
}) {
  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Upload and share a file</h2>
          <p className="mt-1 text-sm text-gray-600">
            Share PDF, Word, Excel, or PowerPoint documents.
          </p>

          <ActionForm
            action={uploadSharedFile}
            className="mt-4 space-y-4"
            resetOnSuccess
          >
            <div>
              <label htmlFor="shared-file">Choose document</label>
              <input
                id="shared-file"
                type="file"
                name="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Maximum file size: 15 MB.
              </p>
            </div>

            <div>
              <label htmlFor="file-description">Description (optional)</label>
              <textarea
                id="file-description"
                name="description"
                rows={2}
                maxLength={500}
                placeholder="Add a short description..."
              />
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" name="all_models" value="yes" />
              <span className="text-sm font-medium">Share with all models</span>
            </label>

            <fieldset className="rounded-lg border border-gray-200 p-3">
              <legend className="px-1 text-sm font-medium">
                Or select specific models
              </legend>

              {models.length === 0 ? (
                <p className="text-sm text-gray-500">No models found.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {models.map((model) => (
                    <label
                      key={model.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="person_ids"
                        value={model.id}
                      />
                      {model.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <SubmitButton>Upload and share</SubmitButton>
          </ActionForm>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Shared files ({files.length})
        </h2>

        {files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <p className="font-medium">No files shared yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Shared documents will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <article
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{file.name}</p>
                  {file.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {file.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    {formatSize(file.size_bytes)} ·{' '}
                    {new Date(file.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/files/${file.id}`}
                    className="btn border-gray-300 bg-white text-gray-800"
                  >
                    Download
                  </a>

                  {canManage && (
                    <ActionForm action={deleteSharedFile}>
                      <input type="hidden" name="id" value={file.id} />
                      <SubmitButton variant="danger">Delete</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
