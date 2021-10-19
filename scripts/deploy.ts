import { run, ethers } from "hardhat"
import { Signer } from "ethers"

import { TORNADO_TREES_GOERLI, TEST_TORN } from "../scripts/constants"

async function main() {

  await run('compile')

  console.log('Deploying contracts... \n')

  try {
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const SablierRateAdjuster = await SablierRateAdjusterABI.deploy()

    await SablierRateAdjuster.deployed()

    const MerkleRootAuction = await MerkleRootAuctionABI.deploy(
      TORNADO_TREES_GOERLI, TEST_TORN, SablierRateAdjuster.address,
    )

    await MerkleRootAuction.deployed()

    console.log(
      'Deployments: \n '
      + `SablierRateAdjuster: ${SablierRateAdjuster.address} \n `
      + `MerkleRootAuction: ${MerkleRootAuction.address}`
    )
  } catch(e) {
    console.log(`Failed to deploy: ${e}`)
  }
}

main().then(() => process.exit(0))
