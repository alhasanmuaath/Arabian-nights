'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { registerAsset } from '@/app/(app)/actions'
import { createClient } from '@/lib/supabase/browser'
import { extensionOf, shrinkImage } from '@/lib/upload'
import { Icon } from './Icon'

const MAX = 20 * 1024 * 1024

/**
 * Uploads place photos or script files straight from the browser to
 * private storage, then records them on the shoot day.
 */
export function AssetUploader({ shootDayId, kind }: { shootDayId: string; kind: 'photo' | 'script' }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const isPhoto = kind === 'photo'

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const files = [...(input.current?.files ?? [])]
    const title = String(new FormData(form).get('title') ?? '').trim()
    setError('')
    setOk('')
    if (!files.length) return setError('Choose a file first.')

    setBusy(true)
    const supabase = createClient()
    const failed: string[] = []
    let n = 0
    for (const original of files) {
      n += 1
      setProgress(`Uploading ${n} of ${files.length}…`)
      const file = isPhoto ? await shrinkImage(original) : original
      if (file.size > MAX) {
        failed.push(`${original.name}: larger than 20 MB`)
        continue
      }
      const path = `${shootDayId}/${crypto.randomUUID()}.${extensionOf(file)}`
      const { error: upError } = await supabase.storage
        .from('shoot-assets')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upError) {
        failed.push(`${original.name}: ${/mime|type/i.test(upError.message) ? 'file type not allowed' : upError.message}`)
        continue
      }
      const res = await registerAsset({
        shoot_day_id: shootDayId,
        kind,
        title: title || original.name.replace(/\.[^.]+$/, ''),
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      })
      if (res?.error) failed.push(`${original.name}: ${res.error}`)
    }
    setBusy(false)
    setProgress('')
    const sent = files.length - failed.length
    if (failed.length) setError(failed.join(' · '))
    if (sent) {
      setOk(`${sent} ${isPhoto ? (sent === 1 ? 'photo' : 'photos') : sent === 1 ? 'file' : 'files'} uploaded.`)
      form.reset()
      router.refresh()
    }
  }

  const id = `up-${kind}-${shootDayId}`
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!isPhoto && (
        <div>
          <label htmlFor={`${id}-title`}>Title (optional)</label>
          <input id={`${id}-title`} name="title" maxLength={150} placeholder="e.g. Scene 2 – director version" />
        </div>
      )}
      <div>
        <label htmlFor={id}>{isPhoto ? 'Photos of the place' : 'Script file (PDF, Word, text or image)'}</label>
        <input
          id={id}
          ref={input}
          type="file"
          multiple={isPhoto}
          accept={isPhoto ? 'image/jpeg,image/png,image/webp' : '.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/webp'}
          className="mt-1.5 block w-full"
        />
      </div>
      <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
        <Icon name="upload" size={15} />
        {busy ? progress || 'Uploading…' : isPhoto ? 'Upload photos' : 'Upload script'}
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
