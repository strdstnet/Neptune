import fs from 'fs'
import path from 'path'
import { BinaryData } from '@strdstnet/utils.binary'

export class DataFile extends BinaryData {

  constructor(file: string) {
    super(fs.readFileSync(path.join(__dirname, 'bedrock', file)))
  }

}
