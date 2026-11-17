'use client'

/**
 * Phone photos are 3-8 MB. Shrink them in the browser before upload:
 * longest side 1920px, JPEG. Falls back to the original file if the
 * browser can't decode it.
 */
export async function shrinkImage(file: File, maxSide = 1920, quality = 0.84): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function extensionOf(file: File) {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  return fromName.replace(/[^a-z0-9]/g, '') || 'bin'
}
