pragma 0.8.0;

import "@sablierhq/sablier-smooth-contracts/blob/master/contracts/Sablier.sol";

import "./interfaces/ITornadoTrees.sol";
import "./interfaces/ISablier.sol";

contract MerkleRootAuction {

  address public treesProxy = 0x200a79068d8141924b511bc78cb55dca89cf5c2e;
  uint256 constant public BASE18 = 10 ** 18;

  ITornadoTrees public tornadoTrees;
  ISablier public merkleStream;

  uint256 merkleStreamId;

  constructor(address streamAddress, uint256 streamId) {
    tornadoTrees = ITornadoTrees(treesProxy);
    merkleStream = ISablier(streamAddress);
    merkleStreamId = streamId;
  }

  function leavesUntilDepositSync() external pure returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.withdrawalsLength();
    uint256 lastLeaf = tornadoTrees.lastProcessedDepositLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }

  function leavesUntilWithdrawalSync() external pure returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.withdrawalsLength();
    uint256 lastLeaf = tornadoTrees.lastProcessedWithdrawalLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }

  function pendingLeaves() external returns (uint256 leaves) {
   leaves = leavesUntilDepositSync() + leavesUntilWithdrawalSync();
  }

  function queryReward(uint256 withdrawals, uint256 deposits) external pure returns (uint256 reward) {
    uint256 streamBalance = merkleStream.balanceOf(merkleStreamId, address(this));
    uint256 queryFufilment  = (withdrawals + deposits) * BASE18;
    uint256 relativeFufilment = totalFufilment / pendingLeaves();

    reward = (streamBalance * totalFufilment) / BASE18;
  }

}
