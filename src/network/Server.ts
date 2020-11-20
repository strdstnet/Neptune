import { Socket } from './Socket'
import { ServerType } from '../API'
import { IAddress } from '../types/network'

export class Server extends Socket {

  constructor(public type: ServerType, addr: IAddress, mtuSize: number) {
    super({ addr, mtuSize })
  }

}
