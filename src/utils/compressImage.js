// Compresión liviana antes de subir a Cloudinary — pensada para no notarse
// en el resultado (foto de soldadura/tubería/aviso sigue viéndose nítida en
// el celular) pero acortar el tiempo de subida con mala señal en planta.
// No toca el archivo si ya es chico o no es una imagen soportada por canvas
// (ej: HEIC en algunos navegadores) — en esos casos sube el original tal cual.

const MAX_DIM = 1600      // lado más largo, en px — de sobra para ver detalle en pantalla
const QUALITY = 0.8       // balanceado: baja bastante el peso sin notarse la pérdida
const SKIP_UNDER_BYTES = 300 * 1024 // si ya pesa poco, no vale la pena recomprimir

export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) return file
  if (file.type === 'image/gif') return file // no tocar animados
  if (file.size <= SKIP_UNDER_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file)
    let { width, height } = bitmap
    if (width > MAX_DIM || height > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / width, MAX_DIM / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob) return file
    // Si por algún motivo salió más pesado que el original (foto ya muy comprimida), no usarlo
    if (blob.size >= file.size) return file

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    return file // cualquier falla (formato no soportado, etc.) → sube el original
  }
}
