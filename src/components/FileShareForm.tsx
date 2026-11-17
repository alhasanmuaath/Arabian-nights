'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSharedFile, discardSharedFile, shareFile } from '@/app/(app)/actions'
import { createClient } from '@/lib/supabase/browser'
import type { TeamMember } from '@/lib/types'
import { AudiencePicker } from './AudiencePicker'
import { Icon } from './Icon'

/** Manager: upload a document and choose who it is assigned to. */
export function FileShareForm({ people }: { people: TeamMember[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const file = fd.get('file')
    const everyone = fd.get('everyone') === 'yes'
    const person_ids = fd.getAll('person_ids').map(String)
    setError('')
    setOk('')
    if (!(file instanceof File) || file.size === 0) return setError('Choose a file to upload.')
    if (!everyone && !person_ids.length) return setError('Choose who this is for: everyone, or tick at least one person.')

    setBusy(true)
    try {
      const made = await createSharedFile({
        name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        description: String(fd.get('description') ?? ''),
      })
      if ('error' in made) return setError(made.error)

      const { error: upError } = await createClient()
        .storage.from('shared-files')
        .upload(made.path, file, { contentType: file.type, upsert: false })
      if (upError) {
        await discardSharedFile(made.id)
        return setError(`Upload failed: ${upError.message}`)
      }

      const res = await shareFile({ id: made.id, everyone, person_ids })
      if (res?.error) return setError(res.error)
      setOk(res?.ok ?? 'File shared.')
      form.reset()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="shared-file">Document</label>
        <input
          id="shared-file"
          type="file"
          name="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/jpeg,image/png,image/webp"
          className="mt-1.5 block w-full"
        />
        <p className="faint mt-1">PDF, Word, Excel, PowerPoint, text or image. Up to 15 MB.</p>
      </div>
      <div>
        <label htmlFor="file-description">Description (optional)</label>
        <textarea id="file-description" name="description" rows={2} maxLength={500} placeholder="What is this file for?" />
      </div>
      <AudiencePicker people={people} />
      <button type="submit" disabled={busy} className="btn btn-primary">
        <Icon name="upload" size={16} />
        {busy ? 'Uploading…' : 'Upload and share'}
      </button>
      {error && (
        <p role="alert" className="msg-error">
          {error}
        </p>
      )}
      {ok && (
        <p role="status" className="msg-ok">
          {ok}
        </p>
      )}
    </form>
  )
}
