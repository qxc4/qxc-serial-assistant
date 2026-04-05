// Type definitions for Web Serial API
// Based on: https://wicg.github.io/serial/

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
}

interface Serial extends EventTarget {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
  onconnect: ((this: Serial, ev: Event) => any) | null
  ondisconnect: ((this: Serial, ev: Event) => any) | null
}

interface Navigator {
  readonly serial: Serial
}