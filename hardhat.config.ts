import "@nomiclabs/hardhat-waffle"

import { HardhatUserConfig } from "hardhat/types"
import { solConfig } from './scripts/constants'
import { task } from "hardhat/config"

const configuration: HardhatUserConfig = {
  networks: {
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_KEY}`,
      accounts: [`0x${PRIVATE_KEY}`],
    },
  },
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
         version: "0.5.8",
         settings: solConfig
      }
    ],
  },
  mocha: {
    timeout: 20000
  }
}

export default configuration
