import { run, ethers } from "hardhat";

async function main() {
  run('compile')

  console.log('Deploying SablierRateAdjuster.sol...')

  try {
    const account: Signer = (await ethers.getSigners())[0]
    const SablierRateAdjusterABI = await ethers.getContractFactory("SablierRateAdjuster")
    const SablierRateAdjuster = await SablierRateAdjusterABI.deploy()

    await SablierRateAdjuster.deployed()

    console.log(`\n Deployed at ${SablierRateAdjuster.address}`)    
  } catch(e) {
    console.log(`\n Failed to deploy`)
  }
}
