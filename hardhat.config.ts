import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";

module.exports = {
  solidity: {
   version: "0.8.0",
   settings: {
     optimizer: {
       enabled: true,
       runs: 1000,
     },
   },
 },
};
