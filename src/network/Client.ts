import { Socket } from './Socket'
import { OpenConnectionReplyTwo } from './raknet/OpenConnectionReplyTwo'
import { IAddress } from '../types/network'
import dgram from 'dgram'
import { EzTransfer } from './custom/EzTransfer'
import { Login } from './bedrock/Login'
import { EzLogin } from './custom/EzLogin'
import { Server } from './Server'
import { Packets } from '../types/protocol'
import { ChangeDimension } from './bedrock/ChangeDimension'
import { Dimension } from '../types/world'
import { Vector3 } from 'math3d'
import { BinaryData } from '../utils/BinaryData'

export class Client extends Socket {

  public server!: Server

  private splits: Map<number, BinaryData[]> = new Map()

  constructor(socket: dgram.Socket, addr: IAddress, mtuSize: number) {
    super({ addr, mtuSize }, socket)

    this.on('data', ev => this.server.send(ev.data.data))
  }

  public sendConnectionReplyTwo(): void {
    console.log('CONN REPLY 2')
    this.send(new OpenConnectionReplyTwo({
      address: this.address,
      mtuSize: this.mtuSize,
    }))
  }

  public setServer(server: Server): this {
    this.server = server

    this.server.on('data', ({ data: { data } }) => {
      if(data.buf[0] === Packets.EZ_TRANSFER) {
        this.handleEzTransferData(data)
      } else if(data.buf[0] === Packets.PARTIAL_PACKET) {
        this.handlePartialPacket(data)
      } else {
        this.send(data)
      }
    })

    return this
  }

  private handlePartialPacket(data: BinaryData) {
    data.readByte() // PARTIAL_PACKET
    const id = data.readByte()
    const partCount = data.readShort()
    const partId = data.readShort()
    const pData = data.readByteArray(data.length - data.pos)

    const parts = this.splits.get(id)

    if(!parts) {
      const arr = new Array(partCount)
      arr[partId] = pData
      this.splits.set(id, arr)
    } else {
      parts[partId] = pData
      this.splits.set(id, parts)
    }

    if(parts && parts.length === partCount) {
      const bd = new BinaryData()
      // bd.writeByte(data.buf[0])

      for(const part of parts) {
        bd.writeByteArray(part, false)
      }

      this.handleGluedPacket(bd)
    }
  }

  public handleGluedPacket(data: BinaryData): void {
    const pkId = data.readByte(false)
    switch(pkId) {
      case Packets.EZ_TRANSFER:
        return this.handleEzTransferData(data)
      default:
        throw new Error(`Got unknown glued packetId: ${pkId}`)
    }
  }

  public handleEzTransferData(data: BinaryData): void {
    const pk = new EzTransfer().parse(data)

    this.handleEzTransfer(pk)
  }

  public async handleEzTransfer(pk: EzTransfer): Promise<void> {
    const { serverType, clientId, sequenceNumber, loginData } = pk.props

    console.log(pk.props)

    this.sendBatched(new ChangeDimension({
      dimension: Dimension.NETHER,
      position: new Vector3(0, 0, 0),
    }))

    this.setServer(new Server(serverType, {
      ip: '192.168.0.11',
      port: 19134,
      family: 4,
    }, this.mtuSize))

    this.server.send(new EzLogin({
      address: this.address,
      mtuSize: this.mtuSize,
      clientId,
      sequenceNumber,
      loginData,
    }))
  }

}
