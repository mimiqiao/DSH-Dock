/** Shared content loading for previews and thumbnails. Uses only Harness-authenticated channels. */
export async function readWorkBlob(item, { fileUrl, fetchFile = fetch, readAttachment, signal }) {
  signal?.throwIfAborted()
  const url = item.contentUrl || item.path && fileUrl(item.path)
  let missing = false
  if (url) {
    const response = await fetchFile(url, { signal, referrerPolicy: 'no-referrer' })
    if (response.ok) return { blob: await response.blob(), source: item.contentUrl ? 'saved-version' : 'file' }
    if (![404, 410].includes(response.status)) {
      const error = new Error(response.status === 403 ? '当前没有读取这个文件的权限。' : `暂时无法读取文件（${response.status}）。`)
      error.code = response.status === 403 ? 'FORBIDDEN' : 'FILE_READ_FAILED'
      throw error
    }
    missing = true
  }
  if (item.kind === 'image' && item.attachmentId && readAttachment) {
    const blob = await readAttachment(item, signal)
    signal?.throwIfAborted()
    return { blob, source: missing ? 'saved-preview' : 'attachment' }
  }
  const error = new Error(missing ? '原文件已不在这个位置' : '这项成果暂时没有可读取的文件引用')
  error.code = missing ? 'FILE_MISSING' : 'NO_SOURCE'
  throw error
}
