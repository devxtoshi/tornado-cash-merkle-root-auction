import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-truffle5"

import * as dotenv from "dotenv"

import { HardhatUserConfig } from "hardhat/types"
import { solConfig } from './utils/constants'
import { task } from "hardhat/config"

dotenv.config({
  path: `${__dirname}/.configuration.env`
})

let configuration: HardhatUserConfig = {
  networks: {
    hardhat: {
      blockGasLimit: 9500000
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.0",
        settings: solConfig
      },
      {
        version: "0.6.0",
        settings: solConfig
      },
      {
        version: "0.5.11",
        settings: solConfig
      },
      {
        version: "0.6.12",
        settings: solConfig
      },
      {
         version: "0.5.8",
         settings: solConfig
      }
    ],
  },
  mocha: {
    timeout: 500000
  }
}

if(process.env.NETWORK){
  configuration.networks[process.env.NETWORK] = {
    url: `${process.env.RPC_ENDPOINT}`,
    accounts: [
      `0x${process.env.PRIVATE_KEY}`
    ]
  }
}

export default configuration
