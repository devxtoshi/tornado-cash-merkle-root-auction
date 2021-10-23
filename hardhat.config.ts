import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-truffle5"

import * as dotenv from "dotenv"

import { HardhatUserConfig } from "hardhat/types"
import { solConfig } from './utils/constants'
import { task } from "hardhat/config"

dotenv.config({
  path: `${__dirname}/.configuration.env`
})

const networks =
!!process.env.RPC_ENDPOINT || !!process.env.PRIVATE_KEY ? {} : {
    goerli: {
      url: `${process.env.RPC_ENDPOINT}`,
      accounts: [
        `0x${process.env.PRIVATE_KEY}`
      ],
    },
  }

const configuration: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.0",
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
    timeout: 250000
  },
  networks
}

export default configuration
