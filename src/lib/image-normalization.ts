function isHeicFile(file: File) {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();

  return (
    lowerType === "image/heic" ||
    lowerType === "image/heif" ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif")
  );
}

export async function normalizeEvidenceImage(file: File) {
  if (!isHeicFile(file)) {
    return file;
  }

  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({
      blob: file,
      quality: 0.9,
      toType: "image/jpeg"
    });
    const jpegBlob = Array.isArray(converted) ? converted[0] : converted;

    if (!jpegBlob) {
      throw new Error("La conversion no produjo una imagen.");
    }

    const fileName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([jpegBlob], fileName, { type: "image/jpeg" });
  } catch {
    throw new Error(
      "No fue posible convertir la foto HEIC. Abrela en la galeria, compartela como JPG e intentalo nuevamente."
    );
  }
}
