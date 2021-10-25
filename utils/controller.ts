import { BigNumber } from "ethers"
import { wtns } from "snarkjs"
import { utils } from "ffjavascript"
import { exec } from "child_process"
import { ethers } from "hardhat"

import jsSHA from 'jssha'
import fs from "fs"
import tmp from "tmp-promise"
import util from "util"

import { bitsToNumber, toBuffer, toFixedHex, poseidonHash } from "./index"

const execute = util.promisify(exec)

interface BatchTreeUpdate {
  oldRoot: string;
  newRoot: string;
  pathIndices: Array<string>;
  pathElements: Array<string>;
  instances: Array<string>;
  blocks: Array<string>;
  hashes: Array<string>;
  argsHash?: string;
}

const toHexRaw = (t) => {
  return (BigNumber.from(t).toHexString()).slice(2)
}

const formatProof = (
    proofPath
) => {
  const source = fs.readFileSync(proofPath, "utf8")
  const { defaultAbiCoder } = ethers.utils
  const proof = JSON.parse(source)

  return defaultAbiCoder.encode(
    [ "uint256[8]" ], [
      [
        proof.pi_a[0],
        proof.pi_a[1],

        proof.pi_b[0][1],
        proof.pi_b[0][0],
        proof.pi_b[1][1],
        proof.pi_b[1][0],

        proof.pi_c[0],
        proof.pi_c[1]
      ]
    ]
  )
}

function hashInputs(input) {
  const sha = new jsSHA('SHA-256', 'ARRAYBUFFER')
  sha.update(toBuffer(input.oldRoot, 32))
  sha.update(toBuffer(input.newRoot, 32))
  sha.update(toBuffer(input.pathIndices, 4))

  for (let i = 0; i < input.instances.length; i++) {
    sha.update(toBuffer(input.hashes[i], 32))
    sha.update(toBuffer(input.instances[i], 20))
    sha.update(toBuffer(input.blocks[i], 4))
  }

  const hash = '0x' + sha.getHash('HEX')
  const result = BigNumber.from(hash)
    .mod(BigNumber.from('21888242871839275222246405745257275088548364400416034343698204186575808495617'))
    .toString()
  return result
}

function prove(input, keyBasePath, label) {
  return tmp.dir().then(async (dir) => {
    let out

    fs.writeFileSync(`${dir.path}/${label}-input.json`, JSON.stringify(input, null, 2))

    try {
      if (fs.existsSync(`${keyBasePath}`)) {
        // native witness calc
        out = await execute(`${keyBasePath} ${dir.path}/${label}-input.json ${dir.path}/witness.json`)
      } else {

        // snarkjs witness calc
        // wont work natively (TODO)
        await execute(
          `snarkjs wtns debug `
          + `${keyBasePath}.wasm `
          + `${dir.path}/${label}-input.json `
          + `${dir.path}/${label}.wtns `
          + `${keyBasePath}.sym`
        )

        const witness = utils.stringifyBigInts(await wtns.exportJson(`${dir.path}/${label}.wtns`))
        fs.writeFileSync(`${dir.path}/${label}-witness.json`, JSON.stringify(witness, null, 2))
      }
      out = await execute(
        `${process.cwd()}/rapidsnark/build/prover `
        + `${keyBasePath}.zkey `
        + `${dir.path}/${label}.wtns `
        + `${dir.path}/${label}-proof.json `
        + `${dir.path}/${label}-public.json`
      )
    } catch (e) {
      console.log(out, e)
      throw e
    }
    return formatProof(`${dir.path}/${label}-proof.json`)
  })
}

/**
 * This function updates MerkleTree argument
 *
 * @param tree Merkle tree with current smart contract state. This object is mutated during function execution.
 * @param events New batch of events to insert.
 * @returns {{args: [string, string, string, string, *], input: {pathElements: *, instances: *, blocks: *, newRoot: *, hashes: *, oldRoot: *, pathIndices: string}}}
 */
function batchTreeUpdate(tree, events) {
  const batchHeight = Math.log2(events.length)

  if (!Number.isInteger(batchHeight)) {
    throw new Error('events length has to be power of 2')
  }

  const oldRoot = tree.root().toString()
  const leaves = events.map((e) => poseidonHash([e.instance, e.hash, e.block]))

  tree.bulkInsert(leaves)

  const newRoot = tree.root().toString()
  let { pathElements, pathIndices } = tree.path(tree.elements().length - 1)

  pathElements = pathElements.slice(batchHeight).map((a) => BigNumber.from(a).toString())
  pathIndices = bitsToNumber(pathIndices.slice(batchHeight)).toString()

  const input: BatchTreeUpdate = {
    oldRoot,
    newRoot,
    pathIndices,
    pathElements,
    instances: events.map((e) => BigNumber.from(e.instance).toString()),
    hashes: events.map((e) => BigNumber.from(e.hash).toString()),
    blocks: events.map((e) => BigNumber.from(e.block).toString()),
  }

  input.argsHash = hashInputs(input)

  const args = [
    toFixedHex(input.argsHash),
    toFixedHex(input.oldRoot),
    toFixedHex(input.newRoot),
    toFixedHex(input.pathIndices, 4),
    events.map((e) => ({
      hash: toFixedHex(e.hash),
      instance: toFixedHex(e.instance, 20),
      block: toFixedHex(e.block, 4),
    })),
  ]
  return { input, args }
}

export default { batchTreeUpdate, prove }
