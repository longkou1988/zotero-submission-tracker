export interface CollectionLike {
  id: number;
  libraryID: number;
  name: string;
  parentID?: number | null;
  deleted?: boolean;
}

export interface CollectionOption {
  id: number;
  label: string;
}

export function buildCollectionOptions(
  collections: CollectionLike[],
): CollectionOption[] {
  const visible = collections.filter((collection) => !collection.deleted);
  const byID = new Map(
    visible.map((collection) => [collection.id, collection]),
  );

  const pathFor = (collection: CollectionLike): string => {
    const parts = [collection.name.trim() || "—"];
    const visited = new Set<number>([collection.id]);
    let parentID = collection.parentID || null;
    while (parentID) {
      if (visited.has(parentID)) break;
      visited.add(parentID);
      const parent = byID.get(parentID);
      if (!parent) break;
      parts.unshift(parent.name.trim() || "—");
      parentID = parent.parentID || null;
    }
    return parts.join(" / ");
  };

  return visible
    .map((collection) => ({ id: collection.id, label: pathFor(collection) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function chooseDefaultCollectionID(
  currentCollectionIDs: number[],
  rememberedCollectionID: number | null,
  collections: CollectionLike[],
): number | null {
  const valid = new Set(
    collections
      .filter((collection) => !collection.deleted)
      .map((collection) => collection.id),
  );
  if (currentCollectionIDs.length === 1 && valid.has(currentCollectionIDs[0])) {
    return currentCollectionIDs[0];
  }
  if (rememberedCollectionID != null && valid.has(rememberedCollectionID)) {
    return rememberedCollectionID;
  }
  return null;
}
