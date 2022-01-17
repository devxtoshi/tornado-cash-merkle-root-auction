import { toFixedHex, poseidonHash2, randomBN, poseidonHash } from "../utils/index"
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

const CHUNK_SIZE = 2 ** TREE_HEIGHT

const base: BigNumber = BigNumber.from(10).pow(18)
const amount: BigNumber = (BigNumber.from(10000)).mul(base)

const sleep = (t) => new Promise(r => setTimeout(r, t))

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

function toNumStr(value) {
  return (BigNumber.from(value)).div(BigNumber.from(10).pow(18)).toString()
}

async function timeTravel(time) {
  const latestBlockNumber = await ethers.provider.getBlockNumber()
  const latestBlock = await ethers.provider.getBlock(latestBlockNumber)

  await ethers.provider.send('evm_setNextBlockTimestamp', [ latestBlock.timestamp + time ])
  await ethers.provider.send('evm_mine', [])
}

function leafHash(e){
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "bytes32", "uint256"],
      [  toFixedHex(e.instance, 20),
         toFixedHex(e.hash),
         toFixedHex(e.block, 4)
     ]
    )
  )
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

  const leafHashes = sortedEvents.map(e => leafHash(e))
  const matchingLeaf = leafHashes.find(e => e == targetLeaf)
  const leafIndex = leafHashes.indexOf(matchingLeaf)
  const pendingLeaves = sortedEvents.slice(leafIndex, sortedEvents.length)

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

async function generateProofs(depositTree, withdrawalTree, depositEvents, withdrawalEvents): Promise<any[2][2]> {
   const snarkWithdrawals = controller.batchTreeUpdate(withdrawalTree, withdrawalEvents)
   const snarkDeposits = controller.batchTreeUpdate(depositTree, depositEvents)

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

async function legacyRegister(note, tornadoTreesV1, proxy) {
  return tornadoTreesV1
  .connect(proxy)
  .register(
    note.instance,
    toFixedHex(note.commitment),
    toFixedHex(note.nullifierHash),
    note.depositBlock,
    note.withdrawalBlock
  )
}

async function register(note, tornadoTrees, proxy){
  return Promise.all[
    await tornadoTrees.connect(proxy).registerDeposit(note.instance, toFixedHex(note.commitment)),
    await tornadoTrees.connect(proxy).registerWithdrawal(note.instance, toFixedHex(note.nullifierHash))
  ]
}

function createMockNotes(numBatches) {
  const { instances, blocks } = mock
  const mockNotes = []

  for(var i = 0; i < CHUNK_SIZE * numBatches; i++){
    mockNotes.push({
      instance: instances[i % instances.length],
      depositBlock: blocks[i % blocks.length],
      withdrawalBlock: 2 + i + i * 4 * 60 * 24,
      commitment: randomBN(),
      nullifierHash: randomBN(),
    })
  }

  return mockNotes
}

async function createMockCommitments(tornadoTrees, proxy, notes, legacy = true) {
  let [ depositEvents, withdrawalEvents ] = [ [], [] ]

  for(let i = 0; i < notes.length; i++) {
    if(!legacy) await register(notes[i], tornadoTrees, proxy)
    else await legacyRegister(notes[i], tornadoTrees, proxy)

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


export function hashProofParams(contract, functionName, proof, args)  {
  return contract.interface.encodeFunctionData(
    functionName, [
      proof,
      ...args
    ]
  )
}

describe("Tornado Cash Merkle Root Auction", () => {
  const isLocalDeployment = !config.networks.goerli
  const withdrawalTree = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })
  const depositTree = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })
  const emptyTree = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })
  const notes = createMockNotes(4)

  let withdrawalEvents: Array<Event>
  let depositEvents: Array<Event>
  let treesAddress: string
  let tokenAddress: string
  let sablierAddress: string
  let auctionAddress: string
  let legacyTreesAddress: string
  let streamId: number

  it("Deployments", async() => {
    const BatchTreeUpdateVerifierABI = await ethers.getContractFactory("BatchTreeUpdateVerifier")
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TornadoTreesV1ABI = await ethers.getContractFactory("TornadoTreesV1")
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    try {
      const [ account, proxy ] = await ethers.getSigners()

      const TestToken = await TestTokenABI.deploy()
      await TestToken.deployed()

      const SablierRateAdjuster = await SablierRateAdjusterABI.deploy()
      await SablierRateAdjuster.deployed()

      let contractAddress: string

      if(isLocalDeployment) {
        const BatchTreeUpdateVerifier = await BatchTreeUpdateVerifierABI.deploy()
        await BatchTreeUpdateVerifier.deployed()

        const TornadoTreesV1 = await TornadoTreesV1ABI.deploy(0, 0, emptyTree.root(), emptyTree.root())
        await TornadoTreesV1.deployed()

        const genNotes = notes.slice(0, CHUNK_SIZE)
        const [ deposits, withdrawals ] = await createMockCommitments(TornadoTreesV1, proxy, genNotes)
        const lastWithdrawalLeaf = await TornadoTreesV1.withdrawals(withdrawals.length - 1)
        const lastDepositLeaf = await TornadoTreesV1.deposits(deposits.length - 1)
        const searchParams =  {
          depositsFrom: 1,
          depositsStep: 1,
          withdrawalsFrom: 2,
          withdrawalsStep: 2
        }

        const TornadoTrees = await TornadoTreesABI.deploy(
          account.address, TornadoTreesV1.address, searchParams
        )
        await TornadoTrees.deployed()
        await TornadoTrees.initialize(proxy.address, BatchTreeUpdateVerifier.address)

        legacyTreesAddress = TornadoTreesV1.address.toString()
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
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(sablierAddress)
    const TestToken = await TestTokenABI.attach(tokenAddress)

    const latestBlockNumber = await ethers.provider.getBlockNumber()
    const latestBlock = await ethers.provider.getBlock(latestBlockNumber)

    await TestToken.approve(sablierAddress, amount)

    const startTime = latestBlock.timestamp + 600
    const endTime = startTime + 1000000

    await (await SablierRateAdjuster.createStream(
      auctionAddress, amount, tokenAddress, startTime, endTime,
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
    await timeTravel(86400)
  })

  it('Reward calculation', async() => {
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(sablierAddress)
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TestToken = await TestTokenABI.attach(tokenAddress)

    const leavesUntilWithdrawalSync = await MerkleRootAuction.leavesUntilWithdrawalSync()
    const leavesUntilDepositSync = await MerkleRootAuction.leavesUntilDepositSync()
    const streamBalance = await SablierRateAdjuster.balanceOf(streamId, auctionAddress)
    const contractBalance = await TestToken.balanceOf(auctionAddress)

    const totalBalance = streamBalance.add(contractBalance)
    const expectedReward = totalBalance.div(BigNumber.from(2))
    const withdrawalsFulfilment = leavesUntilWithdrawalSync / 2
    const depositsFulfilment = leavesUntilDepositSync / 2

    const queriedReward = await MerkleRootAuction.reward(depositsFulfilment, withdrawalsFulfilment)

    expect(toNumStr(queriedReward)).to.equal(toNumStr(expectedReward))
  })

  it('Update roots', async() => {
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")

    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TornadoTrees = await TornadoTreesABI.attach(treesAddress)

    const lastProcessedWithdrawal = await TornadoTrees.lastProcessedWithdrawalLeaf()
    const lastProcessedDeposit = await TornadoTrees.lastProcessedDepositLeaf()

    let withdrawals
    let deposits

    if(!isLocalDeployment) {
      withdrawals = await getPastEvents("WithdrawalData", lastProcessedWithdrawal, treesAddress)
      deposits = await getPastEvents("DepositData", lastProcessedDeposit, treesAddress)
    } else {
      withdrawals = withdrawalEvents
      deposits = depositEvents
    }

    console.log(depositTree.root())

    const [ proofs, args ] = await generateProofs(depositTree, withdrawalTree, deposits, withdrawals)

    await MerkleRootAuction.updateRoots(
      hashProofParams(TornadoTrees, "updateDepositTree", proofs[0], args[0]),
      hashProofParams(TornadoTrees, "updateWithdrawalTree", proofs[1], args[1])
    )
  })

 it('getPathIndex abstracts pathIndices from calldata correctly', async() => {
   if(isLocalDeployment){
     const [ account, proxy ] = await ethers.getSigners()

     const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
     const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")

     const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
     const TornadoTrees = await TornadoTreesABI.attach(treesAddress)

     await createMockCommitments(TornadoTrees, proxy, notes, false)

     const lastProcessedDeposit = await TornadoTrees.lastProcessedDepositLeaf()
     const lastProcessedWithdrawal = await TornadoTrees.lastProcessedWithdrawalLeaf()
     const startingDepositLeaf = await TornadoTrees.deposits(lastProcessedDeposit)
     const startingWithdrawalLeaf = await TornadoTrees.withdrawals(lastProcessedWithdrawal)

     const depositContractEvents =  await getPastEvents("DepositData", startingDepositLeaf, treesAddress)
     const withdrawalContractEvents =  await getPastEvents("WithdrawalData", startingWithdrawalLeaf, treesAddress)

     const totalEvents = (depositContractEvents.length + withdrawalContractEvents.length) / 2
     const numBatches = totalEvents / CHUNK_SIZE

     for(var x = 0; x < CHUNK_SIZE * numBatches; x += CHUNK_SIZE){
       const batchWithdrawals = withdrawalContractEvents.slice(x, CHUNK_SIZE + x)
       const batchDeposits = depositContractEvents.slice(x, CHUNK_SIZE + x)

       console.log(depositTree.root())

       const [ proofs, args ] = await generateProofs(
         depositTree, withdrawalTree, batchDeposits, batchWithdrawals
       )

       const withdrawalsParams = hashProofParams(TornadoTrees, "updateWithdrawalTree", proofs[1], args[1])
       const depositsParams = hashProofParams(TornadoTrees, "updateDepositTree", proofs[0], args[0])

       const derivedWithdrawalPathIndex = await MerkleRootAuction.getWithdrawalPathIndex(withdrawalsParams)
       const derivedDepositsPathIndex = await MerkleRootAuction.getDepositPathIndex(depositsParams)

       expect(derivedWithdrawalPathIndex).to.equal(batchWithdrawals.length)
       expect(derivedDepositsPathIndex).to.equal(batchDeposits.length)

       // await MerkleRootAuction.updateRoots(depositsParams, withdrawalsParams)

       await TornadoTrees.updateDepositTree(proofs[0], ...args[0])
       await TornadoTrees.updateWithdrawalTree(proofs[1], ...args[1])

       // Ensure new commitments do not cause contigency
       // await register(createMockNote((numBatches * CHUNK_SIZE) + 1), legacyTreesAddress, proxy)
      }
    }
  })

 })
