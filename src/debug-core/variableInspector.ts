import type { MemoryAccess } from './debugInterfaces'

export type VariableType = 'u8' | 'u16' | 'u32' | 'i32' | 'f32'

export interface VariableSpec {
  name: string
  address: number
  type: VariableType
}

export interface VariableValue {
  name: string
  address: number
  type: VariableType
  value: number | null
  error?: string
}

const TYPE_BYTES: Record<VariableType, number> = {
  u8: 1,
  u16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
}

export async function inspectGlobalVariables(
  specs: VariableSpec[],
  memory: MemoryAccess,
): Promise<VariableValue[]> {
  const results: VariableValue[] = []
  for (const spec of specs) {
    try {
      const bytes = await memory.read8(spec.address, TYPE_BYTES[spec.type])
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      results.push({
        name: spec.name,
        address: spec.address,
        type: spec.type,
        value: decodeValue(spec.type, view),
      })
    } catch (error) {
      results.push({
        name: spec.name,
        address: spec.address,
        type: spec.type,
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

function decodeValue(type: VariableType, view: DataView): number {
  if (type === 'u8') return view.getUint8(0)
  if (type === 'u16') return view.getUint16(0, true)
  if (type === 'u32') return view.getUint32(0, true)
  if (type === 'i32') return view.getInt32(0, true)
  return view.getFloat32(0, true)
}
