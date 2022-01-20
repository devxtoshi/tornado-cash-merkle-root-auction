import crypto from "crypto"

import ethers, { BigNumber } from "ethers"
import { poseidon } from "circomlib"

export const poseidonHash = (items) => BigNumber.from(poseidon(items).toString())

export const poseidonHash2 = (a, b) => poseidonHash([a, b])

/** Generate random number of specified byte length */
export const randomBN = (nbytes = 31) => BigNumber.from(crypto.randomBytes(nbytes))

export const sleep = (t) => new Promise(r => setTimeout(r, t))

/** BigNumber to hex string of specified length */
export const toFixedHex = (number, length = 32) =>
  '0x' +
  (number instanceof Buffer
    ? number.toString('hex')
    : BigNumber.from(number).toHexString().slice(2)
  ).padStart(length * 2, '0')

export const toBuffer = (value, length) =>
  Buffer.from(
    BigNumber.from(value)
      .toHexString()
      .slice(2)
      .padStart(length * 2, '0'),
    'hex',
  )

export function bitsToNumber(bits) {
  let result = 0
  for (const item of bits.slice().reverse()) {
    result = (result << 1) + item
  }
  return result
}

export function toNumStr(value) {
  return (BigNumber.from(value)).div(BigNumber.from(10).pow(18)).toString()
}
