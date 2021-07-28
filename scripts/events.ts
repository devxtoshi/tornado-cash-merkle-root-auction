import { ethers } from "hardhat"

import { TORNADO_TREES_GOERLI } from "./constants"

function ranges(startValue: Number, endValue: Number): Array {
  const arr = new Array((endValue - startValue) + 2)

  for(var i = 0; i < arr.length; i++){
    arr[i] = startValue + i;
  }
  return arr
}

export async function getEvents(
  iWStart: Number, iWEnd: Number, iDStart: Number, iDEnd: Number
): Array, Array {
  const withdrawalIndices: Array = ranges(iWStart, iWEnd)
  const depositIndices: Array = ranges(iDStart, iDEnd)

  const TornadoTrees = await ethers.getContractAt("ITornadoTrees", TORNADO_TREES_GOERLI)
  const withdrawalEvents = await TornadoTrees.WithdrawalData(null, null, null, withdrawalIndices)
  const depositEvents = await TornadoTrees.WithdrawalData(null, null, null, depositIndices)

  return (withdrawalEvents, depositEvents)
}
