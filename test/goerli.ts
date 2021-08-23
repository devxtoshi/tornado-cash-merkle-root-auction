import { toFixedHex, poseidonHash2, randomBN } from "../scripts/utils"
import MerkleTree from "fixed-merkle-tree"
import controller from "../scripts/controller"

import { expect } from "hai"
import { ethers } from "hardhat"

import { Signer, BigNumber } from "ethers"

import { TORNADO_TREES_GOERLI, TEST_TORN, SABLIER, AUCTION } from "../scripts/constants"

const base: BigNumber = BigNumber.from(10).pow(18)
const amount: BigNumber = (BigNumber.from(100)).mul(base)

const PATH_TREE_UPDATE = "../artifacts/circuits/BatchTreeUpdate"
const PATH_TREES = "contracts/interfaces/ITornadoTrees.sol:ITornadoTrees"
const PATH_ERC = "contracts/interfaces/IERC20.sol:IERC20"
const TREES_BLOCK_DEPLOY = 12143762
const WITHDRAWAL = "WithdrawalData"

const TREE = new MerkleTree(20, [], { hashFunction: poseidonHash2 })

interface Event {
  block: Number;
  hash: String;
  instance: String;
}

async function getPastEvents(endBlock, event): Event[] {
  const tornadoTrees = await ethers.getContractAt(PATH_TREES, TORN_TREES_GOERLI)

  const pastEvents: Event[]
  const filteredEvents = await tornadoTrees.getPastEvents(event, {
    toBlock: !endBlock ? 'latest' : endBlock,
    fromBlock: TREES_BLOCK_DEPLOY,
  })

  return await filteredEvents.map((e) =>
    pastEvents.push({
       instance: toFixedHex(e.args.instance, 20),
       block: toFixedHex(e.args.block, 4),
       hash: toFixedHex(e.args.hash),
    })
  )
 }

async function generateProofs(withdrawalEvents, depositEvents): any[2][2] {
   const snarkWithdrawals = controller.batchTreeUpdate(TREE, withdrawalEvents)
   const snarkDeposits = controller.batchTreeUpdate(TREE, depositEvents)
   const proofWithdrawals = await controller.prove(snarkWithdrawals.input, PATH_TREE_UPDATE)
   const proofDeposits = await controller.prove(snarkDeposits.input, PATH_TREE_UPDATE)

   return [
      [ proofDeposits, proofWithdrawals ],
      [ snarkDepsoits.args, snarkWithdrawals.args ]
   ]
}

describe('MerkleRootAuction', () => {
  let streamId: any

  it('Create stream', async() => {
    const latestBlockNumber = await ethers.provider.getBlockNumber()
    const latestBlock = await ethers.provider.getBlock(latestBlockNumber)

    const IERC20ABI = await ethers.getContractAt(PATH_ERC, TEST_TORN)
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(SABLIER)
    const TestToken = await IERC20ABI.attach(TEST_TORN)

    await TestToken.approve(SABLIER, amount)

    const startTime = latestBlock.timestamp + 600
    const endTime = startTime + 100000

    await (await SablierRateAdjuster.createStream(
      AUCTION, amount, TEST_TORN, startTime, endTime,
      { gasLimit: 4200000 }
    )).wait().then((reciept: any) => {
      const { args }  = reciept.events[reciept.events.length-1]
      const id = args[args.length-7].toNumber()

      console.log(`Stream id: ${id}`)
      streamId = id
    })
  })

  it('Initialise stream', async() => {
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(AUCTION)

    await MerkleRootAuction.initialiseStream(streamId)
  })

  it('Update roots', async() => {
     const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
     const MerkleRootAuction = await MerkleRootAuctionABI.attach(AUCTION)

     const withdrawalEvents = await getPastEvents(, "WithdrawalData")
     const depositEvents = await getPastEvents(, "DepositData")
     const parameters: Array

     const [ proofs, args ] = await generateProofs(withdrawalEvents, depositEvents)

     await args[0].map((e, i) => parameters.push([ e, args[1][i] ]))

     await MerkleRootAuction.updateRoots(proofs, ...parameters)
   })
})
