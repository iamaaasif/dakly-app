type SizeInput = { id?: string; imageFileId?: string | null };
type HeldSize = { id: string; imageFileIds: string[] };

// What each size will hold after a save. A photo the product or the size already holds is reused;
// any other id is a waiting upload to attach. A photo a size lets go of is released unless the
// product still shows it.
export function planVariantPhotos(
  productPhotoIds: string[],
  sizes: SizeInput[],
  current: HeldSize[],
): { ids: string[][]; toAttach: string[]; released: string[] } {
  const ids = sizes.map((size) => {
    const held = current.find((row) => row.id === size.id)?.imageFileIds ?? [];
    if (size.imageFileId === undefined) return held;
    return size.imageFileId ? [size.imageFileId] : [];
  });
  const before = current.flatMap((row) => row.imageFileIds);
  const kept = new Set(ids.flat());
  return {
    ids,
    toAttach: [...kept].filter((id) => !productPhotoIds.includes(id) && !before.includes(id)),
    released: before.filter((id) => !kept.has(id) && !productPhotoIds.includes(id)),
  };
}

type Written = { optionValues: Record<string, string> };

export function variantWrites<Size extends Written>(
  options: { name: string }[],
  sizes: Size[],
  photoIds: string[][],
) {
  return sizes.map(({ imageFileId: _imageFileId, ...size }: Size & SizeInput, position) => ({
    ...size,
    imageFileIds: photoIds[position]!,
    position,
    isDefault: options.length === 0,
    title: options.length
      ? options.map((option) => size.optionValues[option.name]).join(' / ')
      : 'Default',
  }));
}
