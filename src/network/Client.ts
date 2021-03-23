import { Socket } from './Socket'
import dgram from 'dgram'
import { Server } from './Server'
import { IAddress, BinaryData, Vector3 } from '@strdstnet/utils.binary'
import {
  SegmentHandler,
  ChangeDimension,
  Packets,
  Dimension,
  EzLogin, EzTransfer,
  OpenConnectionReplyTwo,
} from '@strdstnet/protocol'
import { ServerType } from '../API'
import { Neptune } from '../Neptune'

export class Client extends Socket {

  public server!: Server

  // private splits: {
  //   [k: number]: {
  //     [k: number]: BinaryData
  //   }
  // } = {}

  private segmentHandler = new SegmentHandler(({ data }) => this.handleGluedPacket(data))

  constructor(socket: dgram.Socket, addr: IAddress, mtuSize: number) {
    super({ addr, mtuSize }, socket)

    this.on('data', ev => this.server.send(ev.data.data))
  }

  public sendConnectionReplyTwo(): void {
    console.log('CONN REPLY 2')
    this.send(new OpenConnectionReplyTwo({
      address: this.address,
      mtuSize: this.mtuSize,
      serverId: Neptune.id,
    }))
  }

  public setServer(server: Server): this {
    this.server = server

    this.server.on('data', ({ data: { data } }) => {
      if(data.buf[0] === Packets.EZ_TRANSFER) {
        this.handleEzTransferData(data)
      } else if(data.buf[0] === Packets.PARTIAL_PACKET) {
        // this.handlePartialPacket(data)
        this.segmentHandler.handle(data)
      } else {
        console.log('sending', data.readByte(false))
        this.send(data)
      }
    })

    return this
  }

  // private handlePartialPacket(data: BinaryData) {
  //   data.readByte() // PARTIAL_PACKET
  //   const id = data.readByte()
  //   const partCount = data.readShort()
  //   const partId = data.readShort()
  //   const pData = data.readByteArray(data.length - data.pos)

  //   console.log(`${partId + 1}/${partCount} (#${partId})`)

  //   if(!this.splits[id]) this.splits[id] = []

  //   this.splits[id][partId] = pData

  //   const count = Object.keys(this.splits[id]).length

  //   console.log(`Got ${count}/${partCount}`)

  //   if(count === partCount) {
  //     const bd = new BinaryData()

  //     for(const part of Object.values(this.splits[id])) {
  //       bd.writeByteArray(part, false)
  //     }

  //     delete this.splits[id]
  //     bd.pos = 0
  //     this.handleGluedPacket(bd)
  //   }
  // }

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

    this.setServer(new Server(serverType as ServerType, {
      ip: '192.168.1.227',
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
