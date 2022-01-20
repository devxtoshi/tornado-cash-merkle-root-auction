import { ethers, config, web3, artifacts } from "hardhat"
import { expect } from "chai"
import { poseidon } from "circomlib"
import fs from "fs"

import { Signer, BigNumber } from "ethers"
import MerkleTree from "fixed-merkle-tree"

import { toFixedHex, poseidonHash2, randomBN, poseidonHash, toNumStr } from "../utils/index"
import { mockData, treeSearchParams } from "../utils/constants"
import controller from "../utils/controller"

import {
    TREE_DEPTH, TREE_HEIGHT, TORNADO_TREES,
    TREES_BLOCK_DEPLOY, PATH_TREES, PATH_ARTIFACTS, PATH_ERC
} from "../utils/constants"

const CHUNK_SIZE = 2 ** TREE_HEIGHT
const NUM_BATCHES = 4

const withdrawalTree = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })
const depositTree = new MerkleTree(TREE_DEPTH, [], { hashFunction: poseidonHash2 })

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

async function generateProofs(depositEvents, withdrawalEvents): Promise<any[2][2]> {
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

async function timeTravel(time) {
  const latestBlockNumber = await ethers.provider.getBlockNumber()
  const latestBlock = await ethers.provider.getBlock(latestBlockNumber)

  await ethers.provider.send('evm_setNextBlockTimestamp', [ latestBlock.timestamp + time ])
  await ethers.provider.send('evm_mine', [])
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

function createMockNotes(numBatches) {
  const { instances, blocks } = mockData
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

export function hashProofParams(contract, functionName, proof, args)  {
  return contract.interface.encodeFunctionData(
    functionName, [
      proof,
      ...args
    ]
  )
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

describe("Tornado Cash Merkle Root Auction", () => {
  const notes = createMockNotes(NUM_BATCHES)

  let withdrawalEvents: Array<Event>
  let depositEvents: Array<Event>
  let legacyTreesAddress: string
  let sablierAddress: string
  let auctionAddress: string
  let treesAddress: string
  let tokenAddress: string
  let streamIndentifer: number

  it("Deployments", async() => {
    const BatchTreeUpdateVerifierABI = await ethers.getContractFactory("BatchTreeUpdateVerifier")
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TornadoTreesV1ABI = await ethers.getContractFactory("TornadoTreesV1")
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    try {
      const [ account, proxy ] = await ethers.getSigners()
      const isLocalDeployment = !config.networks.goerli
      const zeroRoot = depositTree.root()

      const TestToken = await TestTokenABI.deploy()
      await TestToken.deployed()

      const SablierRateAdjuster = await SablierRateAdjusterABI.deploy()
      await SablierRateAdjuster.deployed()

      const BatchTreeUpdateVerifier = await BatchTreeUpdateVerifierABI.deploy()
      await BatchTreeUpdateVerifier.deployed()

      const TornadoTreesV1 = await TornadoTreesV1ABI.deploy(0, 0, zeroRoot, zeroRoot)
      await TornadoTreesV1.deployed()

      // Isolate v1 commitments
      const genNotes = notes.slice(0, CHUNK_SIZE)

      const [ deposits, withdrawals ] = await createMockCommitments(TornadoTreesV1, proxy, genNotes)
      const lastWithdrawalLeaf = await TornadoTreesV1.withdrawals(withdrawals.length - 1)
      const lastDepositLeaf = await TornadoTreesV1.deposits(deposits.length - 1)

      const TornadoTrees = await TornadoTreesABI.deploy(
        account.address, TornadoTreesV1.address, treeSearchParams
      )

      await TornadoTrees.deployed()
      await TornadoTrees.initialize(proxy.address, BatchTreeUpdateVerifier.address)

      const MerkleRootAuction = await MerkleRootAuctionABI.deploy(
        TornadoTrees.address, TestToken.address, SablierRateAdjuster.address,
      )
      await MerkleRootAuction.deployed()

      sablierAddress = SablierRateAdjuster.address.toString()
      auctionAddress = MerkleRootAuction.address.toString()
      legacyTreesAddress = TornadoTreesV1.address.toString()
      treesAddress = TornadoTrees.address.toString()
      tokenAddress = TestToken.address.toString()
      withdrawalEvents = withdrawals
      depositEvents = deposits
    } catch(e) {
      console.log(`Failed to deploy: ${e}`)
    }
  })

  it('Create stream', async() => {
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(sablierAddress)
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TestToken = await TestTokenABI.attach(tokenAddress)

    const latestBlockNumber = await ethers.provider.getBlockNumber()
    const latestBlock = await ethers.provider.getBlock(latestBlockNumber)
    const auctionBalance = ethers.utils.parseEther('100000')
    const preApprovals = ethers.utils.parseEther('300000')

    await TestToken.approve(sablierAddress, preApprovals)

    const startTime = latestBlock.timestamp + 600
    const endTime = startTime + 10000000

    await (await SablierRateAdjuster.createStream(
      auctionAddress, auctionBalance, tokenAddress, startTime, endTime,
    )).wait().then((reciept: any) => {
      const { args }  = reciept.events[reciept.events.length-1]

      streamIndentifer = args[args.length-7].toNumber()
    })
  })

  it('Initialise stream', async() => {
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)

    await MerkleRootAuction.initialiseStream(streamIndentifer)
    await timeTravel(86400)
  })

  // 1/3 of these cases fail

  it('Adjust stream period', async() => {
    const [ account, proxy ] = await ethers.getSigners()

    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(sablierAddress)
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TestToken = await TestTokenABI.attach(tokenAddress)

    const streamId = await MerkleRootAuction.merkleStreamId()
    const remainingBalance = await SablierRateAdjuster.balanceOf(streamId, account.address)
    const streamDetails = await SablierRateAdjuster.getStream(streamId)

    const latestBlockNumber = await ethers.provider.getBlockNumber()
    const latestBlock = await ethers.provider.getBlock(latestBlockNumber)

    const startTime = latestBlock.timestamp
    const endTime = startTime + 1000000
    const deltaTime = BigNumber.from(endTime - startTime)

    const expectedRefund = remainingBalance.mod(deltaTime)
    const newDepositAmount = remainingBalance.sub(expectedRefund)
    const ratePerSecond = newDepositAmount.div(deltaTime)

    await SablierRateAdjuster.adjustEndTime(streamId, endTime)

    const streamRefund = await TestToken.balanceOf(auctionAddress)
    const newStreamDetails = await SablierRateAdjuster.getStream(streamId + 1)

    expect(newStreamDetails.deposit).to.equal(newDepositAmount)
    expect(streamRefund).to.equal(expectedRefund)

    await MerkleRootAuction.initialiseStream(streamId + 1)
  })

  it('Adjust stream amount', async() => {
    const [ account, proxy ] = await ethers.getSigners()

    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(sablierAddress)
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TestToken = await TestTokenABI.attach(tokenAddress)

    const streamId = await MerkleRootAuction.merkleStreamId()
    const remainingBalance = await SablierRateAdjuster.balanceOf(streamId, account.address)
    const streamDetails = await SablierRateAdjuster.getStream(streamId)

    console.log(streamId)

    const latestBlockNumber = await ethers.provider.getBlockNumber()
    const latestBlock = await ethers.provider.getBlock(latestBlockNumber)

    const newDepositAmount = ethers.utils.parseEther('80000')
    const sablierBalance = await TestToken.balanceOf(sablierAddress)
    const deltaTime = BigNumber.from(streamDetails.stopTime - latestBlock.timestamp)

    const leftoverBalance = remainingBalance.sub(newDepositAmount)
    const expectedRefund = newDepositAmount.mod(deltaTime) + leftoverBalance
    const ratePerSecond = newDepositAmount.div(deltaTime)

    await SablierRateAdjuster.adjustDeposit(streamId, newDepositAmount)

    const streamRefund = await TestToken.balanceOf(account)
    const newStreamDetails = await SablierRateAdjuster.getStream(streamId + 1)

    expect(newStreamDetails.deposit).to.equal(newDepositAmount)
    expect(expectedRefund).to.equal(streamRefund)

    await MerkleRootAuction.initialiseStream(streamId + 1)
  })

  it('Adjust stream period and amount', async() => {
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TestTokenABI = await ethers.getContractFactory("TestToken")

    const SablierRateAdjuster = await SablierRateAdjusterABI.attach(sablierAddress)
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TestToken = await TestTokenABI.attach(tokenAddress)

    const latestBlockNumber = await ethers.provider.getBlockNumber()
    const latestBlock = await ethers.provider.getBlock(latestBlockNumber)
    const streamId = await MerkleRootAuction.merkleStreamId()
    const streamDetails = await SablierRateAdjuster.getStream(streamId)

    console.log(streamId)

    const startTime = latestBlock.timestamp
    const endTime = startTime + 10000000
    const newDeposit = ethers.utils.parseEther('50000')

    const timeDelta = BigNumber.from(endTime - startTime)
    const deltaR = newDeposit.mod(timeDelta)
    const newDepositAmount = newDeposit.sub(deltaR)

    await SablierRateAdjuster.adjustEndTimeAndDeposit(streamId, endTime, newDeposit)

    await MerkleRootAuction.initialiseStream(streamId + 1)
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
    const streamId = await MerkleRootAuction.merkleStreamId()
    const streamBalance = await SablierRateAdjuster.balanceOf(streamId, auctionAddress)
    const contractBalance = await TestToken.balanceOf(auctionAddress)

    const totalBalance = streamBalance.add(contractBalance)
    // 50% fulfillment
    const queriedReward = await MerkleRootAuction.reward(
      leavesUntilDepositSync / 2, leavesUntilWithdrawalSync / 2
    )

    expect(queriedReward).to.equal(totalBalance / 2)
  })

  it('Update roots', async() => {
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")

    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TornadoTrees = await TornadoTreesABI.attach(treesAddress)

    const lastProcessedWithdrawal = await TornadoTrees.lastProcessedWithdrawalLeaf()
    const lastProcessedDeposit = await TornadoTrees.lastProcessedDepositLeaf()

    const [ proofs, args ] = await generateProofs(depositEvents, withdrawalEvents)

    await MerkleRootAuction.updateRoots(
      hashProofParams(TornadoTrees, "updateDepositTree", proofs[0], args[0]),
      hashProofParams(TornadoTrees, "updateWithdrawalTree", proofs[1], args[1])
    )
  })

 it('Extracts index from calldata correctly', async() => {
    const [ account, proxy ] = await ethers.getSigners()
    const additionalNotes = createMockNotes(0.25)

    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")

    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TornadoTrees = await TornadoTreesABI.attach(treesAddress)

    await createMockCommitments(TornadoTrees, proxy, notes, false)

    const lastProcessedDeposit = await TornadoTrees.lastProcessedDepositLeaf()
    const lastProcessedWithdrawal = await TornadoTrees.lastProcessedWithdrawalLeaf()
    const startingDepositLeaf = await TornadoTrees.deposits(lastProcessedDeposit)
    const startingWithdrawalLeaf = await TornadoTrees.withdrawals(lastProcessedWithdrawal)

    const deposits = await getPastEvents("DepositData", startingDepositLeaf, treesAddress)
    const withdrawals = await getPastEvents("WithdrawalData", startingWithdrawalLeaf, treesAddress)

    const totalEvents = (deposits.length + withdrawals.length) / 2
    const totalBatches = totalEvents / CHUNK_SIZE

    for(var x = 0; x < CHUNK_SIZE * totalBatches; x += CHUNK_SIZE){
      const batchWithdrawals = withdrawals.slice(x, CHUNK_SIZE + x)
      const batchDeposits = deposits.slice(x, CHUNK_SIZE + x)

      const [ proofs, args ] = await generateProofs(batchDeposits, batchWithdrawals)

      const withdrawalsParams = hashProofParams(
        TornadoTrees, "updateWithdrawalTree", proofs[1], args[1]
      )
      const depositsParams = hashProofParams(
        TornadoTrees, "updateDepositTree", proofs[0], args[0]
      )

      const derivedWithdrawalPathIndex = await MerkleRootAuction.getWithdrawalPathIndex(withdrawalsParams)
      const derivedDepositsPathIndex = await MerkleRootAuction.getDepositPathIndex(depositsParams)

      expect(derivedWithdrawalPathIndex).to.equal(batchWithdrawals.length)
      expect(derivedDepositsPathIndex).to.equal(batchDeposits.length)

      await MerkleRootAuction.updateRoots(depositsParams, withdrawalsParams)

      // Ensure new commitments do not cause contigency and queue n = NUM_BATCHES
      await register(additionalNotes[x % CHUNK_SIZE], TornadoTrees, proxy)
    }
  })

  it('leavesUntilSync should be correct', async() => {
    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)

    const leavesUntilWithdrawalSync = await MerkleRootAuction.leavesUntilWithdrawalSync()
    const leavesUntilDepositSync = await MerkleRootAuction.leavesUntilDepositSync()

    expect(leavesUntilWithdrawalSync).to.equal(NUM_BATCHES)
    expect(leavesUntilDepositSync).to.equal(NUM_BATCHES)
  })

  it('Irregular pending leaves', async() => {
    const [ account, proxy ] = await ethers.getSigners()

    const MerkleRootAuctionABI = await ethers.getContractFactory("MerkleRootAuction")
    const TornadoTreesABI = await ethers.getContractFactory("TornadoTrees")

    const MerkleRootAuction = await MerkleRootAuctionABI.attach(auctionAddress)
    const TornadoTrees = await TornadoTreesABI.attach(treesAddress)

    const lastProcessedDeposit = await TornadoTrees.lastProcessedDepositLeaf()
    const lastProcessedWithdrawal = await TornadoTrees.lastProcessedWithdrawalLeaf()
    const startingDepositLeaf = await TornadoTrees.deposits(lastProcessedDeposit)
    const startingWithdrawalLeaf = await TornadoTrees.withdrawals(lastProcessedWithdrawal)
    const additionalNotes = createMockNotes(0.75)
    const irregularNotes = createMockNotes(0.25)

    await createMockCommitments(TornadoTrees, proxy, additionalNotes, false)

    const deposits = await getPastEvents("DepositData", startingDepositLeaf, treesAddress)
    const withdrawals = await getPastEvents("WithdrawalData", startingWithdrawalLeaf, treesAddress)

    // Irregular notes
    await register(irregularNotes[3], TornadoTrees, proxy)
    await register(irregularNotes[2], TornadoTrees, proxy)
    await register(irregularNotes[1], TornadoTrees, proxy)

    const pendingLeaves = await MerkleRootAuction.pendingLeaves()

    // ensure queue is odd
    expect((pendingLeaves / 2) % 2).to.equal(1)

    const [ proofs, args ] = await generateProofs(deposits, withdrawals)

    const withdrawalsParams = hashProofParams(
      TornadoTrees, "updateWithdrawalTree", proofs[1], args[1]
    )
    const depositsParams = hashProofParams(
      TornadoTrees, "updateDepositTree", proofs[0], args[0]
    )

    await MerkleRootAuction.updateRoots(depositsParams, withdrawalsParams)

    const newDepositRoot = await TornadoTrees.depositRoot()
    const newWithdrawalRoot = await TornadoTrees.withdrawalRoot()

    expect(newWithdrawalRoot).to.equal(withdrawalTree.root())
    expect(newDepositRoot).to.equal(depositTree.root())
  })

 })
