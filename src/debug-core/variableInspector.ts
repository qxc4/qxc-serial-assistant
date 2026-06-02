import type { MemoryAccess } from './debugInterfaces'
import type { ProgramImage, ProgramSymbol } from './programImage'

export type VariableType = 'u8' | 'u16' | 'u32' | 'i32' | 'f32'
export type VariableDisplayKind = 'primitive' | 'array' | 'struct' | 'unknown'

export interface VariableSpec {
  name: string
  address: number
  type: VariableType
  byteSize?: number
  displayKind?: VariableDisplayKind
  note?: string
}

export interface VariableValue {
  name: string
  address: number
  type: VariableType
  value: number | null
  byteSize?: number
  displayKind?: VariableDisplayKind
  note?: string
  error?: string
}

const TYPE_BYTES: Record<VariableType, number> = {
  u8: 1,
  u16: 2,
  u32: 4,
  i32: 4,
  f32: 4,
}

export interface VariableImageSummary {
  totalSymbols: number
  objectSymbols: number
  functionSymbols: number
  readableVariables: number
  bestEffortVariables: number
  currentFunction?: ProgramSymbol
}

export function createVariableSpecsFromSymbols(symbols: ProgramSymbol[], limit = 64): VariableSpec[] {
  return symbols
    .filter(symbol => symbol.type === 'object' && symbol.address > 0)
    .map(symbol => createVariableSpecFromSymbol(symbol))
    .slice(0, limit)
}

export function findFunctionSymbolAtPc(symbols: ProgramSymbol[], pc: number): ProgramSymbol | undefined {
  const functions = symbols
    .filter(symbol => symbol.type === 'func' && symbol.address > 0)
    .sort((a, b) => a.address - b.address)

  let nearest: ProgramSymbol | undefined
  for (const symbol of functions) {
    if (symbol.address > pc) break
    const end = symbol.size > 0 ? symbol.address + symbol.size : Number.POSITIVE_INFINITY
    if (pc >= symbol.address && pc < end) return symbol
    nearest = symbol
  }
  return nearest && nearest.size === 0 ? nearest : undefined
}

export function summarizeVariableImage(image: ProgramImage, pc?: number): VariableImageSummary {
  const symbols = image.symbols ?? []
  const specs = createVariableSpecsFromSymbols(symbols, Number.POSITIVE_INFINITY)
  return {
    totalSymbols: symbols.length,
    objectSymbols: symbols.filter(symbol => symbol.type === 'object').length,
    functionSymbols: symbols.filter(symbol => symbol.type === 'func').length,
    readableVariables: specs.filter(spec => spec.displayKind === 'primitive').length,
    bestEffortVariables: specs.filter(spec => spec.displayKind !== 'primitive').length,
    currentFunction: typeof pc === 'number' ? findFunctionSymbolAtPc(symbols, pc) : undefined,
  }
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
        byteSize: spec.byteSize,
        displayKind: spec.displayKind,
        note: spec.note,
        value: decodeValue(spec.type, view),
      })
    } catch (error) {
      results.push({
        name: spec.name,
        address: spec.address,
        type: spec.type,
        byteSize: spec.byteSize,
        displayKind: spec.displayKind,
        note: spec.note,
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

function createVariableSpecFromSymbol(symbol: ProgramSymbol): VariableSpec {
  const primitiveType = toPrimitiveVariableType(symbol.size)
  if (primitiveType) {
    return {
      name: symbol.name,
      address: symbol.address,
      type: primitiveType,
      byteSize: symbol.size,
      displayKind: 'primitive',
    }
  }

  return {
    name: symbol.name,
    address: symbol.address,
    type: 'u32',
    byteSize: symbol.size,
    displayKind: inferDisplayKind(symbol),
    note: '复合类型缺少完整 DWARF 类型信息，当前仅读取首个 32-bit word',
  }
}

function toPrimitiveVariableType(size: number): VariableType | null {
  if (size <= 0) return null
  if (size === 1) return 'u8'
  if (size === 2) return 'u16'
  if (size === 4) return 'u32'
  return null
}

function inferDisplayKind(symbol: ProgramSymbol): VariableDisplayKind {
  if (symbol.size > 4 && /array|buffer|buf|queue|ring|table|list/i.test(symbol.name)) return 'array'
  if (symbol.size > 4) return 'struct'
  return 'unknown'
}

function decodeValue(type: VariableType, view: DataView): number {
  if (type === 'u8') return view.getUint8(0)
  if (type === 'u16') return view.getUint16(0, true)
  if (type === 'u32') return view.getUint32(0, true)
  if (type === 'i32') return view.getInt32(0, true)
  return view.getFloat32(0, true)
}
