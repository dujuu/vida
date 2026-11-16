/** Tamaño máximo de un documento: 10 MB. */
export const TAMANO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;

/** Tipos permitidos, con su extensión y la firma (primeros bytes) que debe tener el contenido. */
export const TIPOS_DOCUMENTO: Record<string, { extension: string; firma: number[] }> = {
  'application/pdf': { extension: 'pdf', firma: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  'image/jpeg': { extension: 'jpg', firma: [0xff, 0xd8, 0xff] },
  'image/png': { extension: 'png', firma: [0x89, 0x50, 0x4e, 0x47] },
};

/** Verifica que el contenido empiece con la firma del tipo declarado (no basta con confiar en la extensión). */
export function firmaCoincide(contenido: Buffer, tipoMime: string): boolean {
  const t = TIPOS_DOCUMENTO[tipoMime];
  return !!t && t.firma.every((b, i) => contenido[i] === b);
}

/** Deja un nombre de archivo sin rutas ni caracteres de control, de hasta 200 caracteres. */
export function limpiarNombreArchivo(nombre: string): string {
  // eslint-disable-next-line no-control-regex
  const limpio = nombre.replace(/[\\/\u0000-\u001F\u007F]/g, '_').replace(/^\.+/, '').trim();
  return (limpio || 'documento').slice(-200);
}
