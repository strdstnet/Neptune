import { Socket } from './Socket'
import { ServerType } from '../API'
import { IAddress } from '@strdstnet/utils.binary'

export class Server extends Socket {

  constructor(public type: ServerType, addr: IAddress, mtuSize: number) {
    super({ addr, mtuSize })
  }

}
