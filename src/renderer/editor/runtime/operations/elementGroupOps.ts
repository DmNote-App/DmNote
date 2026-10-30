import type { NativeElementType } from '../../model/elementIdMap';
import { patchElementPropertyById } from './elementPropertyCore';

export const patchElementLayerNameById = (
  type: NativeElementType,
  id: string,
  layerName: string | null,
  options: { preflight?: () => void } = {},
): Promise<boolean> =>
  patchElementPropertyById(
    type,
    id,
    { property: 'layerName', value: layerName },
    options,
  );
