const ethers = require('ethers')
const BigNumber = ethers.BigNumber
const { wtns } = require('snarkjs')
const { utils } = require('ffjavascript')

const { bitsToNumber, toBuffer, toFixedHex, poseidonHash } = require('./utils')

const jsSHA = require('jssha')

const fs = require('fs')
const tmp = require('tmp-promise')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const formatProof = (
    _proof
) => {
    return ([
        _proof.pi_a[0],
        _proof.pi_a[1],

        _proof.pi_b[0][1],
        _proof.pi_b[0][0],
        _proof.pi_b[1][1],
        _proof.pi_b[1][0],

        _proof.pi_c[0],
        _proof.pi_c[1],
    ]).join("")
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
    dir = dir.path
    let out

    fs.writeFileSync(`${dir}/${label}-input.json`, JSON.stringify(input, null, 2))

    try {
      if (fs.existsSync(`${keyBasePath}`)) {
        // native witness calc
        out = await exec(`${keyBasePath} ${dir}/${label}-input.json ${dir}/witness.json`)
      } else {

        // snarkjs witness calc
        // wont work natively (TODO)
        await exec(
          `snarkjs wtns debug `
          + `${keyBasePath}.wasm `
          + `${dir}/${label}-input.json `
          + `${dir}/${label}.wtns `
          + `${keyBasePath}.sym`
        )

        const witness = utils.stringifyBigInts(await wtns.exportJson(`${dir}/${label}.wtns`))
        fs.writeFileSync(`${dir}/${label}-witness.json`, JSON.stringify(witness, null, 2))
      }
      out = await exec(
        `/home/alpha/rapidsnark/build/prover `
        + `${keyBasePath}.zkey `
        + `${dir}/${label}.wtns `
        + `${dir}/${label}-proof.json `
        + `${dir}/${label}-public.json`
      )
    } catch (e) {
      console.log(out, e)
      throw e
    }
    return formatProof(JSON.parse(fs.readFileSync(`${dir}/${label}-proof.json`)))
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

  const input = {
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

module.exports = { batchTreeUpdate, prove }
