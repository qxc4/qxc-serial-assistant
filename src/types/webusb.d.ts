/**
 * WebUSB Type Definitions
 * 扩展浏览器原生 WebUSB API 类型
 */

interface USBDevice {
  vendorId: number
  productId: number
  deviceClass: number
  deviceSubclass: number
  deviceProtocol: number
  deviceVersionMajor: number
  deviceVersionMinor: number
  deviceVersionSubminor: number
  manufacturerName?: string
  productName?: string
  serialNumber?: string
  configuration: USBConfiguration | null
  configurations: USBConfiguration[]
  opened: boolean
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(configurationValue: number): Promise<void>
  claimInterface(interfaceNumber: number): Promise<void>
  releaseInterface(interfaceNumber: number): Promise<void>
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>
  controlTransferIn(setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>
  controlTransferOut(setup: USBControlTransferParameters, data?: BufferSource): Promise<USBOutTransferResult>
  clearHalt(direction: USBDirection, endpointNumber: number): Promise<void>
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
  isochronousTransferIn(endpointNumber: number, packetLengths: number[]): Promise<USBIsochronousInTransferResult>
  isochronousTransferOut(endpointNumber: number, data: BufferSource, packetLengths: number[]): Promise<USBIsochronousOutTransferResult>
  reset(): Promise<void>
}

interface USBConfiguration {
  configurationValue: number
  configurationName?: string
  interfaces: USBInterface[]
}

interface USBInterface {
  interfaceNumber: number
  alternate: USBAlternateInterface
  alternates: USBAlternateInterface[]
  claimed: boolean
}

interface USBAlternateInterface {
  alternateSetting: number
  interfaceClass: number
  interfaceSubclass: number
  interfaceProtocol: number
  interfaceName?: string
  endpoints: USBEndpoint[]
}

interface USBEndpoint {
  endpointNumber: number
  direction: USBDirection
  type: USBEndpointType
  packetSize: number
}

type USBDirection = 'in' | 'out'
type USBEndpointType = 'bulk' | 'interrupt' | 'isochronous'

interface USBControlTransferParameters {
  requestType: USBRequestType
  recipient: USBRecipient
  request: number
  value: number
  index: number
}

type USBRequestType = 'standard' | 'class' | 'vendor'
type USBRecipient = 'device' | 'interface' | 'endpoint' | 'other'

interface USBInTransferResult {
  data?: DataView
  status: USBTransferStatus
}

interface USBOutTransferResult {
  bytesWritten: number
  status: USBTransferStatus
}

interface USBIsochronousInTransferResult {
  data?: DataView
  packets: USBIsochronousInTransferPacket[]
}

interface USBIsochronousInTransferPacket {
  bytesWritten: number
  data?: DataView
  status: USBTransferStatus
}

interface USBIsochronousOutTransferResult {
  packets: USBIsochronousOutTransferPacket[]
}

interface USBIsochronousOutTransferPacket {
  bytesWritten: number
  status: USBTransferStatus
}

type USBTransferStatus = 'ok' | 'stall' | 'babble'

interface USBDeviceFilter {
  vendorId?: number
  productId?: number
  classCode?: number
  subclassCode?: number
  protocolCode?: number
  serialNumber?: string
}

interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[]
  exclusionFilters?: USBDeviceFilter[]
}

interface USBConnectionEvent extends Event {
  device: USBDevice
}

interface USB {
  getDevices(): Promise<USBDevice[]>
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>
  onconnect: ((event: USBConnectionEvent) => void) | null
  ondisconnect: ((event: USBConnectionEvent) => void) | null
  addEventListener(type: 'connect' | 'disconnect', listener: (event: USBConnectionEvent) => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: USBConnectionEvent) => void): void
}

interface Navigator {
  usb: USB
}
