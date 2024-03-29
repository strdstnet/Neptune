import { IAddress } from '@strdstnet/utils.binary'

export enum ServerType {
  LOBBY = 'hsn.lobby',
}

export class API {

  public static instance: API

  private constructor() {
    API.instance = this
  }

  public static async create(): Promise<API> {
    return new API()
  }

  public async getServer(type: ServerType): Promise<IAddress> {
    return {
      // ip: 'play.vastlands.net', // works
      // ip: 'play.stcraftnet.com', // works
      // ip: '104.238.220.169', // works
      // ip: 'play.nethergames.org', // works
      // ip: 'ecpehub.net', // no works
      // ip: 'play.infinitype.net', // works
      // ip: 'advancedcraft.net', // no works
      // ip: 'play.hyperstone.io',
      ip: '127.0.0.1', // works
      // port: 19132,
      port: 19131,
      family: 4,
    }
  }

}
