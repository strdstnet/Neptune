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

export class Client extends Socket {

  public server!: Server

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
      if(data.readByte(false) === Packets.EZ_TRANSFER) {
        const pk = new EzTransfer()
        pk.parse(data)

        this.handleEzTransfer(pk)
      } else {
        this.send(data)
      }
    })

    return this
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
