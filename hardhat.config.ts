import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-truffle5"

import * as dotenv from "dotenv"

import { HardhatUserConfig } from "hardhat/types"
import { solConfig } from './utils/constants'
import { task } from "hardhat/config"

dotenv.config({
  path: `${__dirname}/.configuration.env`
})

const configuration: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.0",
        settings: solConfig
      },
      {
        version: "0.6.12",
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
  networks: {
    hardhat: {
      blockGasLimit: 95000000,
      allowUnlimitedContractSize: true
    }
  },
  mocha: {
    timeout: 600000
  }
}

export default configuration
