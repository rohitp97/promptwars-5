export const MAX_FILE_BYTES = 8 * 1024 * 1024

export type FileKind = 'image' | 'pdf' | 'text'

export type FileCheck = { ok: true; kind: FileKind; mimeType: string } | { ok: false; message: string }

const BY_MIME: Record<string, FileKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
}

const BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
}

export const ACCEPT_ATTRIBUTE = '.png,.jpg,.jpeg,.webp,.pdf,.txt,image/png,image/jpeg,image/webp,application/pdf,text/plain'

/**
 * Allow-list check before anything is read or sent anywhere. Some browsers report an empty MIME
 * type for files from certain sources, so fall back to the extension — but never to "anything".
 */
export function checkFile(file: { name: string; type: string; size: number }): FileCheck {
  if (file.size === 0) return { ok: false, message: 'That file is empty.' }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: `That file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Try a smaller photo or fewer pages.` }
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? '' : ''
  const mimeType = file.type || BY_EXTENSION[ext] || ''
  const kind = BY_MIME[mimeType]
  if (!kind) {
    return { ok: false, message: 'Please upload a photo (PNG, JPG, WebP), a PDF, or a .txt file — or paste the text instead.' }
  }
  return { ok: true, kind, mimeType }
}

export function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}

export function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(file)
  })
}
