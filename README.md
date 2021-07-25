# Tornado.cash merkle root auction

A mechanism to reward the Merkle root updaters for the withdrawal and deposit trees, through forking [a "smooth" implementation of Sablier]('https://github.com/sablierhq/sablier-smooth-contracts') (`SablierRateAdjuster.sol`); to allow a streams rate to be modified without requiring multiple transactions by cancelling and starting a new stream.

The [Tornado.cash governance contract]('https://etherscan.io/address/0x5efda50f22d34f262c29268506c5fa42cb56a1ce') will retain ownership to the rights to the stream initialised to the `MerkleRootAuction.sol` contract, and rewards are computed through the ability to bring **both the deposit and withdrawal trees back to sync**.

This mechanism is to normalise the rate of which TORN is issued via anonymity mining, through offering a reimbursement.
