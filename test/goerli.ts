import { expect } from 'chai'
import { ethers } from "hardhat"

import { TORNADO_TREES_GOERLI, TORN_GOERLI, TEST_TORN } from "../scripts/constants"

describe('SablierRateAdjuster.sol', () => {
  it('Deployment', async() => {
    const account: Signer = (await ethers.getSigners())[0]
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const SablierRateAdjuster = await SablierRateAdjusterABI.deploy()

    await SablierRateAdjuster.deployed()

    console.log(`${SablierRateAdjuster.address}`)
  })
})

describe('MerkleRootAuction.sol', () => {})
