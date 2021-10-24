import { toFixedHex, poseidonHash2, randomBN } from "../utils/index"
import controller from "../utils/controller"

import { ethers, config, web3, artifacts } from "hardhat"
import { expect } from "chai"
import { poseidon } from "circomlib"
import fs from "fs"

import { Signer, BigNumber } from "ethers"
import MerkleTree from "fixed-merkle-tree"

import {
    TREE_DEPTH, TREE_HEIGHT, TORNADO_TREES,
    TREES_BLOCK_DEPLOY, PATH_TREES, PATH_ARTIFACTS, PATH_ERC
} from "../utils/constants"

const base: BigNumber = BigNumber.from(10).pow(18)
const amount: BigNumber = (BigNumber.from(100)).mul(base)

const mock = {
  instances: [
    '0x1111000000000000000000000000000000001111',
    '0x2222000000000000000000000000000000002222',
    '0x3333000000000000000000000000000000003333',
    '0x4444000000000000000000000000000000004444'
  ],
  blocks: [
    '0xaaaaaaaa', '0xbbbbbbbb', '0xcccccccc', '0xdddddddd'
  ]
}

interface Event {
  block: Number;
  hash: String;
  instance: String;
  index?: Number;
}

async function getPastEvents(event, targetLeaf, treesAddress): Promise<Event[]> {
  const ITornadoTreesABI = artifacts.require("ITornadoTrees")
  const TornadoTrees = new web3.eth.Contract(ITornadoTreesABI.abi, treesAddress)
  const isLocalDeployment = !config.networks.goerli

  let targetEvents = await TornadoTrees.getPastEvents(event, {
    fromBlock: isLocalDeployment ? 0 : TREES_BLOCK_DEPLOY,
    toBlock: 'latest'
  })

  let sortedEvents = targetEvents
  .sort((a, b) => a.returnValues.index - b.returnValues.index)
  .map((e) => ({
       instance: toFixedHex(e.returnValues.instance, 20),
       block: toFixedHex(e.returnValues.block, 4),
       hash: toFixedHex(e.returnValues.hash)
     })
   )

  const lastIndex = getMerkleIndex(sortedEvents, targetLeaf)
  const pendingLeaves = sortedEvents.slice(lastIndex + 1, sortedEvents.length)

  return trimLeaves(pendingLeaves)
 }

 function trimLeaves(pendingLeaves): Array<Event> {
   const leavesPow = Math.log2(pendingLeaves.length)
   const sufficientPow = Math.floor(leavesPow)
   const trimmedLeaves = 2 ** sufficientPow
   const leafDiff = pendingLeaves.length - trimmedLeaves

   if(!Number.isInteger(leavesPow)){
     return pendingLeaves.slice(0, pendingLeaves.length - leafDiff)
   } else {
     return pendingLeaves
   }
 }

function getMerkleIndex(events, lastLeaf): number {
  const targetEvent = events.find(e => e.index === lastLeaf.toString())
  // const merkleTree = new MerkleTree(20, hashedEvents, { hashFunction: poseidonHash2 })

  return events.indexOf(targetEvent)
}

async function generateProofs(depositEvents, withdrawalEvents): Promise<any[2][2]> {
   const DEPOSIT_TREE = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })
   const WITHDRAWAL_TREE = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })
   const snarkWithdrawals = controller.batchTreeUpdate(WITHDRAWAL_TREE, withdrawalEvents)
   const snarkDeposits = controller.batchTreeUpdate(DEPOSIT_TREE, depositEvents)

   const proofWithdrawals = await controller.prove(
     snarkWithdrawals.input, PATH_ARTIFACTS, "withdrawals"
   )
   const proofDeposits = await controller.prove(
      snarkDeposits.input, PATH_ARTIFACTS, "deposits"
   )

   return [
      [ proofDeposits, proofWithdrawals ],
      [ snarkDeposits.args, snarkWithdrawals.args ]
   ]
}

async function register(note, tornadoTreesV1) {
  return tornadoTreesV1.register(
    note.instance,
    toFixedHex(note.commitment),
    toFixedHex(note.nullifierHash),
    note.depositBlock,
    note.withdrawalBlock
  )
}

async function createMockCommitments(tornadoTreesV1) {
  const CHUNK_SIZE = 2 ** TREE_HEIGHT
  const { instances, blocks } = mock

  let [ notes, depositEvents, withdrawalEvents ] = [ [] , [], [] ]

  for (let i = 0; i < CHUNK_SIZE; i++) {
    notes[i] = {
      instance: instances[i % instances.length],
      depositBlock: blocks[i % blocks.length],
      withdrawalBlock: 2 + i + i * 4 * 60 * 24,
      commitment: randomBN(),
      nullifierHash: randomBN(),
    }

    await register(notes[i], tornadoTreesV1)

    depositEvents[i] = {
      hash: toFixedHex(notes[i].commitment),
      instance: toFixedHex(notes[i].instance, 20),
      block: toFixedHex(notes[i].depositBlock, 4),
    }
    withdrawalEvents[i] = {
      hash: toFixedHex(notes[i].nullifierHash),
      instance: toFixedHex(notes[i].instance, 20),
      block: toFixedHex(notes[i].withdrawalBlock, 4),
    }
  }

  return [
    depositEvents, withdrawalEvents
  ]
}

describe("Tornado Cash Merkle Root Auction", () => {
  const isLocalDeployment = !config.networks.goerli

  let withdrawalEvents: Array<Event>
  let depositEvents: Array<Event>
  let treesAddress: string
  let tokenAddress: string
  let sablierAddress: string
  let auctionAddress: string
  let streamId: number

  it("Deployments", async() => {
    const BatchTreeUpdateVerifierABI = await ethers.getContractFactory("BatchTreeUpdateVerifier")
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TornadoTreesMockABI = await ethers.getContractFactory("TornadoTreesMock")
    const TornadoTreesV1ABI = await ethers.getContractFactory("TornadoTreesV1")
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    try {
      const tree = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })
      const [ account ] = await ethers.getSigners()

      const TestToken = await TestTokenABI.deploy()
      await TestToken.deployed()

      const SablierRateAdjuster = await SablierRateAdjusterABI.deploy()
      await SablierRateAdjuster.deployed()

      let contractAddress: string

      if(isLocalDeployment) {
        const BatchTreeUpdateVerifier = await BatchTreeUpdateVerifierABI.deploy()
        await BatchTreeUpdateVerifier.deployed()

        const TornadoTreesV1 = await TornadoTreesV1ABI.deploy(0, 0, tree.root(), tree.root())
        await TornadoTreesV1.deployed()

        const [ deposits, withdrawals ] = await createMockCommitments(TornadoTreesV1)
        const lastWithdrawalLeaf = await TornadoTreesV1.withdrawals(withdrawals.length - 1)
        const lastDepositLeaf = await TornadoTreesV1.deposits(deposits.length - 1)

        const TornadoTrees = await TornadoTreesMockABI.deploy(
          account.address, TornadoTreesV1.address, {
            depositsFrom: 1,
            depositsStep: 1,
            withdrawalsFrom: 2,
            withdrawalsStep: 2
        })
        await TornadoTrees.deployed()
        await TornadoTrees.initialize(account.address, BatchTreeUpdateVerifier.address)

        contractAddress = TornadoTrees.address.toString()
        withdrawalEvents = withdrawals
        depositEvents = deposits
      } else {
        contractAddress = TORNADO_TREES
      }

      const MerkleRootAuction = await MerkleRootAuctionABI.deploy(
        contractAddress, TestToken.address, SablierRateAdjuster.address,
      )
      await MerkleRootAuction.deployed()

      sablierAddress = SablierRateAdjuster.address.toString()
      auctionAddress = MerkleRootAuction.address.toString()
      tokenAddress = TestToken.address.toString()
      treesAddress = contractAddress
    } catch(e) {
      console.log(`Failed to deploy: ${e}`)
    }
  })

  it('Create stream', async() => {
    const latestBlockNumber = await ethers.provider.getBlockNumber()
    const latestBlock = await ethers.provider.getBlock(latestBlockNumber)

    const IERC20ABI = await ethers.getContractAt(PATH_ERC, tokenAddress)
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(sablierAddress)
    const TestToken = await IERC20ABI.attach(tokenAddress)

    await TestToken.approve(sablierAddress, amount)

    const startTime = latestBlock.timestamp + 600
    const endTime = startTime + 100000

    await (await SablierRateAdjuster.createStream(
      auctionAddress, amount, tokenAddress, startTime, endTime,
      { gasLimit: 4200000 }
    )).wait().then((reciept: any) => {
        const { args }  = reciept.events[reciept.events.length-1]
        const id = args[args.length-7].toNumber()

        streamId = id
      })
  })

  it('Initialise stream', async() => {
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)

    await MerkleRootAuction.initialiseStream(streamId)
  })

  it('Update roots', async() => {
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTreesMock")
    const TornadoTrees = await TornadoTreesABI.attach(treesAddress)
    const CHUNK_SIZE = 2 ** TREE_HEIGHT

    const lastProcessedWithdrawal = await TornadoTrees.lastProcessedWithdrawalLeaf()
    const lastProcessedDeposit = await TornadoTrees.lastProcessedDepositLeaf()

    if(!isLocalDeployment) {
      withdrawalEvents = await getPastEvents("WithdrawalData", lastProcessedWithdrawal, treesAddress)
      depositEvents = await getPastEvents("DepositData", lastProcessedDeposit, treesAddress)
    }

    const totalEvents = withdrawalEvents.length + depositEvents.length
    const numBatches = (totalEvents / CHUNK_SIZE) - 1

    for(var x = 0 ; x < /* numBatches */  1 * CHUNK_SIZE; x += CHUNK_SIZE){
      const batchWithdrawals = withdrawalEvents.slice(x, x + CHUNK_SIZE)
      const batchDeposits = depositEvents.slice(x, x + CHUNK_SIZE)

      const [ proofs, args ] = await generateProofs(batchDeposits, batchWithdrawals)

      console.log('DEPOSIT PROOF:', proofs[0])
      console.log('WITHDRAWAL PROOF:', proofs[1])

      const parameters = await args[0].map((e, i) => [ e, args[1][i] ])

      console.log('UPDATING TREE')

      await TornadoTrees.updateDepositTree(
        proofs[0],
        ...args[0]
      )

      // const tx = (await MerkleRootAuction.updateRoots(
      //  hexProofs, ...parameters,
      //  { gasLimit: 9500000 }
      //)).wait().then((reciept: any) => {
      //  console.log(reciept.transactionHash)
      //})
    }
  })

 })
