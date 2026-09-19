// src/utils/image.ts
// Клиентское сжатие изображений перед загрузкой (переиспользуется чатом и
// формой индивидуального заказа).

export async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  return new Promise(resolve => {
    const img = new Image()
    const blobUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      let { width, height } = img
      if (width <= maxDim && height <= maxDim && file.size < 800_000) {
        resolve(file)
        return
      }
      if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
      else { width = Math.round(width * maxDim / height); height = maxDim }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file) }
    img.src = blobUrl
  })
}
