import dgram, { Socket } from 'dgram'

import Logger from '@bwatton/logger'
import { Client } from './network/Client'
import { BedrockData } from './data/BedrockData'
import { BinaryData, IAddress } from '@strdstnet/utils.binary'
import { EventEmitter } from '@strdstnet/utils.events'
import { API, ServerType } from './API'
import { Server } from './network/Server'
import {
  OpenConnectionRequestOne,
  UnconnectedPing,
  UnconnectedPong,
  Packets, Protocol,
} from '@strdstnet/protocol'
import { FamilyStrToInt, IPacketHandlerArgs, ISendPacketArgs } from './utils/types'

export interface ServerOpts {
  address: string,
  port: number,
  maxPlayers: number,
  motd: {
    line1: string,
    line2: string,
  },
}

const DEFAULT_OPTS: ServerOpts = {
  address: '0.0.0.0',
  port: 19132,
  maxPlayers: 20,
  motd: {
    line1: 'A Stardust Server',
    line2: '',
  },
}

type ServerEvents = {
}

// TODO: Merge with Stardust.ts
export class Neptune extends EventEmitter<ServerEvents> {

  public static id = 80725802752n

  public static i: Neptune

  public static logger = new Logger('Server')

  private sockets: Array<[string, Socket]> // Array<[id, Socket]>

  private startedAt: number = Date.now()

  private clients: Map<string, Client> = new Map()

  private api!: API

  private constructor(public opts: ServerOpts) {
    super()

    if(Neptune.i) {
      this.logger.error('Only one instance of Neptune can run per Node process')
      process.exit(1)
    } else {
      // eslint-disable-next-line deprecation/deprecation
      Neptune.i = this
    }

    this.sockets = [
      ['IPv4', dgram.createSocket({ type: 'udp4', reuseAddr: true })],
      // ['IPv6', dgram.createSocket({ type: 'udp6', reuseAddr: true })],
    ]
  }

  public get runningTime(): bigint {
    return BigInt(Date.now() - this.startedAt)
  }

  public static async start(opts?: Partial<ServerOpts>): Promise<Neptune> {
    BedrockData.loadData()

    const neptune = new Neptune(Object.assign({}, DEFAULT_OPTS, opts)).init()

    neptune.api = await API.create()

    return neptune
  }

  private get logger() {
    return Neptune.logger
  }

  private init(): Neptune {
    const {
      address,
      port,
    } = this.opts

    this.sockets.forEach(async([, socket]) => {
      socket.bind(port, address)
      // const logger = new Logger(`${this.logger.moduleName}(${id})`)
      const logger = this.logger

      socket.on('error', err => {
        logger.error(err)
        socket.close()
      })

      socket.on('listening', () => {
        const address = socket.address()
        logger.info(`Listening on ${address.address}:${address.port}`)
      })

      socket.on('message', (message, addr) => {
        const address: IAddress = {
          ip: addr.address,
          port: addr.port,
          family: FamilyStrToInt[addr.family],
        }

        const data = new BinaryData(message)
        const packetId = data.readByte(false)

        const client = this.getClient(address)
        if(client) {
          // Connected
          client.onMessage(data)
        } else {
          // Unconnected
          switch(packetId) {
            case Packets.UNCONNECTED_PING:
              this.handleUnconnectedPing({ data, socket, address })
              break
            case Packets.OPEN_CONNECTION_REQUEST_ONE:
              this.handleConnectionRequest1({ data, socket, address })
              break
            // case Packets.OPEN_CONNECTION_REQUEST_TWO:
            //   this.handleConnectionRequest2({ data, socket, address })
            //   break
            default:
              logger.debug(`unknown packet: ${packetId}`)
          }
        }
      })
    })

    return this
  }

  private get motd() {
    const {
      motd: {
        line1,
        line2,
      },
      maxPlayers,
    } = this.opts

    return UnconnectedPong.getMOTD({
      line1, line2, maxPlayers,
      numPlayers: this.clients.size,
      gamemode: 'Survival',
      serverId: BigInt(Neptune.id),
    })
  }

  public static getAddrId(obj: IAddress | Client): string {
    const addr = obj instanceof Client ? obj.address : obj

    return `${addr.ip}:${addr.port}`
  }

  private addClient(client: Client): void {
    this.clients.set(Neptune.getAddrId(client), client)
  }

  public getClient(address: IAddress): Client | null {
    return this.clients.get(Neptune.getAddrId(address)) || null
  }

  public removeClient(address: IAddress): void {
    this.clients.delete(Neptune.getAddrId(address))
  }

  public send({ packet, socket, address }: ISendPacketArgs): void {
    socket.send(packet.encode().toBuffer(), address.port, address.ip)
  }

  private handleUnconnectedPing({ data, socket, address }: IPacketHandlerArgs) {
    const ping = new UnconnectedPing().parse(data)
    const { pingId } = ping.props

    this.send({
      packet: new UnconnectedPong({
        pingId,
        motd: this.motd,
        serverId: Neptune.id,
      }),
      socket,
      address,
    })
  }

  private async handleConnectionRequest1({ data, socket, address }: IPacketHandlerArgs) {
    const request = new OpenConnectionRequestOne().parse(data)
    const { protocol, mtuSize } = request.props

    if(this.getClient(address)) {
      // TODO: Tell client?
      return
    }

    const type = ServerType.LOBBY
    const serverAddr = await this.api.getServer(type)

    const client = new Client(socket, address, mtuSize)
      .setServer(new Server(type, serverAddr, mtuSize))

    this.addClient(client)

    client.onMessage(data)
  }

}
