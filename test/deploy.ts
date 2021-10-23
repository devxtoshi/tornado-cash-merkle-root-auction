import MerkleTree from "fixed-merkle-tree"
import { run, ethers, config } from "hardhat"
import { Signer } from "ethers"

import { TORNADO_TREES, TREE_HEIGHT } from "../utils/constants"
import { poseidonHash2 } from "../utils/index"

async function main() {
  await run('compile')

  console.log('Deploying contracts... \n')

  const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
  const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
  const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")
  const TestTokenABI = await ethers.getContractFactory("TestToken")

  try {
    const tree = new MerkleTree(TREE_HEIGHT, [], { hashFunction: poseidonHash2 })
    const isLocalDeployment = !!config.networks.goerli

    const TestToken = await TestTokenABI.deploy()
    await TestToken.deployed()

    const SablierRateAdjuster = await SablierRateAdjusterABI.deploy()
    await SablierRateAdjuster.deployed()

    let treesAddress: string

    if(isLocalDeployment) {
      const TornadoTrees = await TornadoTreesABI.deploy(0, 0, tree.root(), tree.root())
      await TornadoTrees.deployed()

      treesAddress = TornadoTrees.address.toString()
    } else {
      treesAddress = TORNADO_TREES
    }

    const MerkleRootAuction = await MerkleRootAuctionABI.deploy(
      treesAddress, TestToken.address, SablierRateAdjuster.address,
    )
    await MerkleRootAuction.deployed()

    console.log(
      'Deployments: \n '
      + `SablierRateAdjuster: ${SablierRateAdjuster.address} \n `
      + `MerkleRootAuction: ${MerkleRootAuction.address}`
    )

    process.env.SABLIER = SablierRateAdjuster.address
    process.env.AUCTION = MerkleRootAuction.address
    process.env.TOKEN = TestToken.address
    process.env.TREES = treesAddress

  } catch(e) {
    console.log(`Failed to deploy: ${e}`)
  }
}

main().then(() => process.exit(0))
