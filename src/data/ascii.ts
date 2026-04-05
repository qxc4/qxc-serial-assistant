export interface AsciiEntry {
  dec: number;
  hex: string;
  bin: string;
  html: string;
  char: string;
  desc: string;
}

const CONTROL_CHARS: Record<number, { char: string, desc: string }> = {
  0: { char: 'NUL', desc: 'Null (空字符)' },
  1: { char: 'SOH', desc: 'Start of Header (标题开始)' },
  2: { char: 'STX', desc: 'Start of Text (正文开始)' },
  3: { char: 'ETX', desc: 'End of Text (正文结束)' },
  4: { char: 'EOT', desc: 'End of Transmission (传输结束)' },
  5: { char: 'ENQ', desc: 'Enquiry (请求)' },
  6: { char: 'ACK', desc: 'Acknowledge (收到通知)' },
  7: { char: 'BEL', desc: 'Bell (响铃)' },
  8: { char: 'BS', desc: 'Backspace (退格)' },
  9: { char: 'HT', desc: 'Horizontal Tab (水平制表符)' },
  10: { char: 'LF', desc: 'Line Feed (换行键)' },
  11: { char: 'VT', desc: 'Vertical Tab (垂直制表符)' },
  12: { char: 'FF', desc: 'Form Feed (换页键)' },
  13: { char: 'CR', desc: 'Carriage Return (回车键)' },
  14: { char: 'SO', desc: 'Shift Out (不用切换)' },
  15: { char: 'SI', desc: 'Shift In (启用切换)' },
  16: { char: 'DLE', desc: 'Data Link Escape (数据链路转义)' },
  17: { char: 'DC1', desc: 'Device Control 1 (设备控制1/XON)' },
  18: { char: 'DC2', desc: 'Device Control 2 (设备控制2)' },
  19: { char: 'DC3', desc: 'Device Control 3 (设备控制3/XOFF)' },
  20: { char: 'DC4', desc: 'Device Control 4 (设备控制4)' },
  21: { char: 'NAK', desc: 'Negative Acknowledge (拒绝接收)' },
  22: { char: 'SYN', desc: 'Synchronous Idle (同步空闲)' },
  23: { char: 'ETB', desc: 'End of Trans. Block (传输块结束)' },
  24: { char: 'CAN', desc: 'Cancel (取消)' },
  25: { char: 'EM', desc: 'End of Medium (媒介结束)' },
  26: { char: 'SUB', desc: 'Substitute (替补)' },
  27: { char: 'ESC', desc: 'Escape (换码/转义)' },
  28: { char: 'FS', desc: 'File Separator (文件分隔符)' },
  29: { char: 'GS', desc: 'Group Separator (分组符)' },
  30: { char: 'RS', desc: 'Record Separator (记录分隔符)' },
  31: { char: 'US', desc: 'Unit Separator (单元分隔符)' },
  32: { char: 'Space', desc: 'Space (空格)' },
  127: { char: 'DEL', desc: 'Delete (删除)' }
};

/**
 * Windows-1252 (CP1252) 扩展 ASCII 字符映射表
 * 128-159 在 Unicode 中为 C1 控制字符(不可见), Windows-1252 将其映射为可打印字符
 */
const CP1252_MAP: Record<number, string> = {
  0x80: '\u20AC',
  0x82: '\u201A',
  0x83: '\u0192',
  0x84: '\u201E',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02C6',
  0x89: '\u02DC',
  0x8A: '\u0160',
  0x8B: '\u2039',
  0x8C: '\u0152',
  0x8E: '\u017D',
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201C',
  0x94: '\u201D',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
  0x98: '\u02DA',
  0x99: '\u2122',
  0x9A: '\u0161',
  0x9B: '\u203A',
  0x9C: '\u0153',
  0x9E: '\u017E',
  0x9F: '\u0178'
};

/** Windows-1252 中未定义/保留的字节位置 */
const CP1252_UNDEFINED = new Set([0x81, 0x8D, 0x8F, 0x90, 0x9D]);

/** 扩展 ASCII 中默认不可见的特殊字符 */
const INVISIBLE_EXTENDED_CHARS = new Set([0xAD]);

/**
 * 根据字节值获取对应的可见字符和描述信息
 */
function getExtendedCharInfo(dec: number): { char: string; desc: string } {
  if (CP1252_UNDEFINED.has(dec)) {
    return { char: `UNDEF`, desc: `Undefined (未定义)` };
  }
  if (INVISIBLE_EXTENDED_CHARS.has(dec)) {
    const names: Record<number, string> = { 0xAD: 'SHY' };
    const descs: Record<number, string> = { 0xAD: 'Soft Hyphen (软连字符, 默认不可见)' };
    return { char: names[dec] ?? `EXT${dec}`, desc: descs[dec] ?? `Extended (扩展字符)` };
  }

  const cp1252Char = CP1252_MAP[dec];
  if (cp1252Char !== undefined) {
    const names: Record<number, string> = {
      0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
      0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: 'ˉ', 0x8A: 'Š',
      0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '\u2018', 0x92: '\u2019',
      0x93: '\u201C', 0x94: '\u201D', 0x95: '•', 0x96: '–', 0x97: '—',
      0x98: '˘', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
      0x9E: 'ž', 0x9F: 'Ÿ'
    };
    return { char: cp1252Char, desc: `${names[dec] ?? ''} (Windows-1252)` };
  }

  return { char: String.fromCharCode(dec), desc: 'Extended ASCII (ISO-8859-1 扩展字符)' };
}

let cachedAsciiTable: AsciiEntry[] | null = null;

export function getAsciiTable(): AsciiEntry[] {
  if (cachedAsciiTable) {
    return cachedAsciiTable;
  }

  const table: AsciiEntry[] = [];
  for (let i = 0; i <= 255; i++) {
    let charStr = '';
    let descStr = '';

    if (CONTROL_CHARS[i]) {
      charStr = CONTROL_CHARS[i].char;
      descStr = CONTROL_CHARS[i].desc;
    } else if (i >= 33 && i <= 126) {
      charStr = String.fromCharCode(i);
      descStr = 'Printable (可打印字符)';
    } else if (i >= 128 && i <= 255) {
      const extInfo = getExtendedCharInfo(i);
      charStr = extInfo.char;
      descStr = extInfo.desc;
    } else {
      charStr = String.fromCharCode(i);
      descStr = 'Non-printable (不可打印字符)';
    }

    table.push({
      dec: i,
      hex: i.toString(16).padStart(2, '0').toUpperCase(),
      bin: i.toString(2).padStart(8, '0'),
      html: `&#${i};`,
      char: charStr,
      desc: descStr
    });
  }

  cachedAsciiTable = table;
  return table;
}
