#!/bin/bash -e

# dependencies
sudo apt install build-essential
sudo apt-get install libgmp-dev
sudo apt-get install libsodium-dev
sudo apt-get install nasm

git clone https://github.com/iden3/rapidsnark
cd rapidsnark
npm install
git submodule init
git submodule update
npx task createFieldSources
npx task buildProver
