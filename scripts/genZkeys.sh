#!/bin/bash -e
mkdir -p artifacts/zkeys
# Fetch ptau ceremony data
curl "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_20.ptau" --output artifacts/zkeys/ptau28_hez_final.ptau
# Verify the ceremony
npx snarkjs powersoftau verify artifacts/zkeys/ptau28_hez_final.ptau
# Generate zkeys
npx snarkjs groth16 setup artifacts/circuits/BatchTreeUpdate.r1cs artifacts/zkeys/ptau28_hez_final.ptau artifacts/zkeys/BatchTreeUpdate.zkey
# Copy zkey to circuit artifacts - for easy access
cp artifacts/zkeys/BatchTreeUpdate.zkey artifacts/circuits/BatchTreeUpdate.zkey
# Export verification key
npx snarkjs zkey export verificationkey artifacts/zkeys/BatchTreeUpdate.zkey artifacts/zkeys/verification_key.json
# Create verifier contract
# npx snarkjs zkey export solidityverifier artifacts/zkeys/BatchTreeUpdate.zkey artifacts/contracts/BatchTreeUpdateVerifier.sol
# TODO copy verifying key to groth16 verification contract
