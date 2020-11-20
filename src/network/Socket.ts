import dgram from 'dgram'
import { Event, EventEmitter } from '@strdstnet/utils.events'

interface SplitQueue {
  [splitId: number]: BundledPacket<any>,
}

interface ISocketArgs {
  addr: IAddress,
  mtuSize: number,
}

type SocketEvents = {
  data: Event<{ data: BinaryData }>,
}

export abstract class Socket extends EventEmitter<SocketEvents> {

  public static MAX_CHUNKS_PER_TICK = 5

  protected logger: Logger = new Logger(this.constructor.name)

  public mtuSize: number

  public address: IAddress
  public socket: dgram.Socket

  protected splitQueue: SplitQueue = {}

  protected sendQueue: BundledPacket<any>[] = []
  protected sentPackets: Map<number, PacketBundle> = new Map()

  public sequenceNumber = -1

  protected lastSplitId = -1

  constructor({ addr, mtuSize }: ISocketArgs, socket?: dgram.Socket) {
    super()

    this.address = addr

    if(socket) {
      this.socket = socket
    } else {
      this.socket = dgram.createSocket('udp4', msg => this.onMessage(new BinaryData(msg)))
    }

    this.mtuSize = mtuSize

    // this.logger.info(`Created for ${addr.ip}:${addr.port} with ${mtuSize} MTU`)
  }

  public onMessage(data: BinaryData): void {
    const flags = data.readByte(false)
    const proxy = true

    // this.logger.debug(`Received ${flags}`)
    this.emit('data', new Event({ data }))

    if(flags & BitFlag.ACK) {
      // ACK
    } else if(flags & BitFlag.NAK) {
      // NAK
    } else if(flags & BitFlag.Valid) {
      // Connected
    } else {
      // Unconnected
      switch(flags) {
        case Packets.OPEN_CONNECTION_REPLY_ONE:
          // this.handleConnectionReplyOne(new OpenConnectionReplyOne().parse(data))
          break
        case Packets.OPEN_CONNECTION_REPLY_TWO:
          // this.handleConnectionReplyTwo(new OpenConnectionReplyTwo().parse(data))
          break
      }
    }

    // if(proxy) this.proxy(data)
  }

  public disconnect(message: string, hideScreen = false): void {
    this.send(new Disconnect({
      hideScreen,
      message,
    }))
  }

  public handlePacket(data: BinaryData): void {
    const flags = data.readByte(false)

    if(flags & BitFlag.ACK) {
      // const { props: { sequences } } = new ACK().parse(data)

      // console.log('GOT ACK:', sequences)
    } else if(flags & BitFlag.NAK) {
      const { props: { sequences } } = new NAK().parse(data)
      // console.log('GOT NAK, resending:', sequences)

      for(const sequence of sequences) {
        const bundle = this.sentPackets.get(sequence)

        if(!bundle) console.log(`SEQUENCE ${sequence} NOT FOUND`)
        else this.resend(bundle)
      }
    } else {
      const { packets, sequenceNumber } = new PacketBundle().decode(data)

      this.sendACK(sequenceNumber)

      for(const packet of packets) {
        this.handleBundledPacket(packet)
      }
    }
  }

  protected handleBundledPacket(packet: BundledPacket<any>): void {
    const props = packet.props as IBundledPacket
    if(props.hasSplit && !packet.hasBeenProcessed) {
      if(props.splitIndex === 0) {
        // // this.logger.debug(`Initial split packet for ${packet.data.buf[0]}`, packet)
        packet.data.pos = packet.data.length
        this.splitQueue[props.splitId] = packet
        // this.splitQueue.set(props.splitId, packet)
      } else {
        const queue = this.splitQueue[props.splitId]
        // // this.logger.debug(`Split packet ${props.splitIndex + 1}/${props.splitCount}`)
        // const bundled = this.splitQueue.get(props.splitId)

        if(!queue) {
          throw new Error(`Invalid Split ID: ${props.splitId} for packet: ${packet.id}`)
        } else {
          queue.append(packet.data)

          if(props.splitIndex === props.splitCount - 1) {
            queue.data.pos = 0
            queue.decode()
            queue.hasBeenProcessed = true
            this.handleBundledPacket(queue)
            delete this.splitQueue[props.splitId]
          }
        }
      }
    } else {
      switch(packet.id) {
        case Packets.CONNECTION_REQUEST:
          // this.handleConnectionRequest(packet as ConnectionRequest)
          console.log('CONN REQ, CREATING SERVER')
          // this.server = new Server(this, {
          //   addr: this.serverAddr,
          //   mtu: this.mtuSize,
          //   clientAddr: this.address,
          // })
          break
        // case Packets.NEW_INCOMING_CONNECTION:
        //   this.handleNewIncomingConnection(packet as NewIncomingConnection)
        //   break
        // case Packets.PACKET_BATCH:
        //   this.handlePacketBatch(packet as PacketBatch)
        //   break
        // case Packets.DISCONNECTION_NOTIFICATION:
        //   // this.logger.info('Client disconnected, destroying...')
        //   this.destroy()
        //   break
        // case Packets.CONNECTED_PING:
        //   this.handleConnectedPing(packet as ConnectedPing)
        //   break
        default:
          // this.logger.debug(`Unknown packet: ${packet.id}`)
      }
    }
  }

  protected sendACK(sequenceNumber: number): void {
    this.send(new ACK([sequenceNumber]))
  }

  public send(packet: Packet<any> | BinaryData): void {
    if(packet instanceof BundledPacket) {
      // this.logger.debug(`Sending (BP) ${packet.constructor.name}`)
      this.sendQueue.push(packet)
    } else if(packet instanceof BinaryData) {
      // this.logger.debug(`Sending (BD) ${packet.readByte(false)}`, packet.buf)
      this.sendData(packet)
    } else {
      // this.logger.debug(`Sending (P) ${packet.constructor.name}`)
      this.sendData(packet.encode())
    }
  }

  private sendData(data: BinaryData) {
    this.socket.send(data.toBuffer(), this.address.port, this.address.ip)
  }

  protected resend(packet: PacketBundle): void {
    Neptune.i.send({
      packet,
      socket: this.socket,
      address: this.address,
    })
  }

  public onTick(): void {
    this.processSendQueue()
    // this.sendAttributes()
  }

  protected processSendQueue() {
    if(!this.sendQueue.length) return

    const count = this.sendQueue.length > Client.MAX_CHUNKS_PER_TICK ? Client.MAX_CHUNKS_PER_TICK : this.sendQueue.length
    const packets: BundledPacket<any>[] = this.sendQueue.splice(0, count)

    const [bundles, sequenceNumber, lastSplitId] = bundlePackets(packets, this.sequenceNumber, this.lastSplitId, this.mtuSize)

    for(const packet of bundles) {
      this.sentPackets.set(packet.props.sequenceNumber, packet)

      // Neptune.i.send({
      //   packet,
      //   socket: this.socket,
      //   address: this.address,
      // })
      this.send(packet)
    }

    // this.sendQueue = []
    this.sequenceNumber = sequenceNumber
    this.lastSplitId = lastSplitId
  }

  public sendBatched(packet: BatchedPacket<any>, reliability = Reliability.Unreliable): void {
    this.send(new PacketBatch({
      packets: [packet],
      reliability,
    }))
  }

  protected sendBatchedMulti(packets: BatchedPacket<any>[], reliability = Reliability.ReliableOrdered) {
    this.send(new PacketBatch({ packets, reliability }))
  }

  protected handleConnectedPing(packet: ConnectedPing) {
    const { time } = packet.props

    this.send(new ConnectedPong({
      pingTime: time,
      pongTime: time + 1n,
    }))
  }

  protected handleConnectionRequest(packet: ConnectionRequest) {
    this.send(new ConnectionRequestAccepted({
      address: this.address,
      systemIndex: 0,
      systemAddresses: new Array<IAddress>(Protocol.SYSTEM_ADDRESSES).fill(DummyAddress),
      requestTime: packet.props.sendPingTime,
      time: Neptune.i.runningTime,
    }))
  }

  protected handlePacketBatch(packet: PacketBatch) {
    if(!(packet instanceof PartialPacket)) {
      const { packets } = packet.props

      for(const pk of packets) {
        switch(pk.id) {
          case Packets.LOGIN:
            this.handleLogin(pk)
            break
          case Packets.PACKET_VIOLATION_WARNING:
            const { type, severity, packetId, message } = (pk as PacketViolationWarning).props

            // this.logger.error('Packet Violation:', { type, severity, packetId, message })
            break
          default:
            // this.logger.debug(`UNKNOWN BATCHED PACKET ${pk.id}`)
        }
      }
    }
  }

  protected handleNewIncomingConnection(packet: NewIncomingConnection) {
    // console.log('nic', packet.props)
  }

  protected handleLogin(packet: Login) {
    // TODO: Login verification, already logged in?, ...

    // if (!this.player.XUID) {
    //   this.disconnect('You are not authenticated with Xbox Live.')
    // }

    // TODO: Actually implement packs
    this.sendBatchedMulti([
      new PlayStatus({
        status: PlayStatusType.SUCCESS,
      }),
      new ResourcePacksInfo({
        mustAccept: false,
        hasScripts: false,
        behaviourPacks: [],
        resourcePacks: [],
      }),
    ])
    // this.sendBatched()
    // this.sendBatched()
  }

  public sendMessage(message: string, type: TextType, parameters: string[]): void {
    this.sendBatched(new Text({
      type,
      message,
      parameters,
    }))
  }

}

import Logger from '@bwatton/logger'
import { Neptune } from '../Neptune'
import { Disconnect } from './bedrock/Disconnect'
import { BinaryData, BitFlag } from '../utils/BinaryData'
import { PacketBatch } from './bedrock/PacketBatch'
import { bundlePackets } from '../utils/parseBundledPackets'
import { BatchedPacket } from './bedrock/BatchedPacket'
import { Reliability } from '../utils/Reliability'
import { PartialPacket } from './custom/PartialPacket'
import { PacketViolationWarning } from './bedrock/PacketViolationWarning'
import { Login } from './bedrock/Login'
import { PlayStatus } from './bedrock/PlayStatus'
import { ResourcePacksInfo } from './bedrock/ResourcePacksInfo'
import { Text, TextType } from './bedrock/Text'
import { BundledPacket } from './raknet/BundledPacket'
import { DummyAddress, IAddress, IBundledPacket } from '../types/network'
import { PacketBundle } from './raknet/PacketBundle'
import { NAK } from './raknet/NAK'
import { Packets, Protocol } from '../types/protocol'
import { ConnectionRequest } from './raknet/ConnectionRequest'
import { NewIncomingConnection } from './raknet/NewIncomingConnection'
import { ConnectedPing } from './raknet/ConnectedPing'
import { ACK } from './raknet/ACK'
import { ConnectedPong } from './raknet/ConnectedPong'
import { ConnectionRequestAccepted } from './raknet/ConnectionRequestAccepted'
import { PlayStatusType } from '../types/world'
import { Server } from './Server'
import { Client } from './Client'
import { Packet } from './Packet'

