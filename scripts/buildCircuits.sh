#!/bin/bash -e
zkutil setup -c artifacts/circuits/$1.r1cs -p artifacts/circuits/$1.params
zkutil generate-verifier -p artifacts/circuits/$1.params -v artifacts/circuits/${1}Verifier.sol
sed -i.bak "s/contract Verifier/contract ${1}Verifier/g" artifacts/circuits/${1}Verifier.sol
npx snarkjs info -r artifacts/circuits/$1.r1cs
