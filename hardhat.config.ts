import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"

import { solConfig } from './scripts/constants'

module.exports = {
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
};
