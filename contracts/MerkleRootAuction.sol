pragma solidity 0.8.0;

import "./interfaces/ITornadoTrees.sol";
import "./interfaces/ISablier.sol";

contract MerkleRootAuction {

  address public treesProxy = 0x200a79068d8141924b511bc78cb55dca89cf5c2e;
  address public tornAddress = 0x77777feddddffc19ff86db637967013e6c6a116c;
  uint256 constant public BASE18 = 10 ** 18;

  ITornadoTrees public tornadoTrees;
  ISablier public merkleStream;
  IERC20 public tornToken;

  uint256 merkleStreamId;

  constructor(address streamAddress, uint256 streamId) {
    tornadoTrees = ITornadoTrees(treesProxy);
    merkleStream = ISablier(streamAddress);
    tornToken = IERC20(tokenAddress);
    merkleStreamId = streamId;
  }

  function leavesUntilDepositSync() external pure returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.depositsLength();
    uint256 lastLeaf = tornadoTrees.lastProcessedDepositLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }

  function leavesUntilWithdrawalSync() external pure returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.withdrawalsLength();
    uint256 lastLeaf = tornadoTrees.lastProcessedWithdrawalLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }

  function leavesUntilWithdrawal(uint256 i) external pure returns (uint256 leaves) {
    leaves = (i - tornadoTrees.lastProcessedWithdrawalLeaf());
  }

  function leavesUntilDeposit(uint256 i) external pure returns (uint256 leaves) {
    leaves = (i - tornadoTrees.lastProcessedDepositLeaf());
  }

  function pendingLeaves() external pure returns (uint256 leaves) {
    leaves = leavesUntilDepositSync() + leavesUntilWithdrawalSync();
  }

  function queryReward(uint256 deposits, uint256 withdrawals) external pure returns (uint256 reward) {
    uint256 streamBalance = merkleStream.balanceOf(merkleStreamId, address(this));
    uint256 auctionBalance = tornToken.balanceOf(address(this));
    uint256 queryFufilment  = (withdrawals + deposits) * BASE18;
    uint256 totalFufilment = queryFufilment / pendingLeaves();
    uint256 rewardBalance = streamBalance + auctionBalance;

    reward = (rewardBalance * totalFufilment) / BASE18;
  }

  function updateRoots(
    TreeLeaf[CHUNK_SIZE][2] calldata events,
    bytes[2] calldata proofs,
    bytes32[2] argsHashes,
    uint32[2] pathIndices,
    bytes32[2] roots
  ) public returns (bool) {
    uint256 lastWLeafIndex = tornadoTrees.lastProcessedWithdrawalLeaf();
    uint256 lastDLeafIndex = tornadoTrees.lastProcessedDepositLeaf();
    uint256 leafWCount = leavesUntilWithdrawal(pathIndices[1]);
    uint256 leafDCount = leavesUntilDeposit(pathIndices[0]);
    uint256 reward = queryReward(leafDCount, leafWCount);

    require(merkleStream.withdrawFromStream(merkleStream, address(this)));

    bytes32 lastWLeaf = tornadoTrees.withdrawals[lastWLeafIndex];
    bytes32 lastDLeaf = tornadoTrees.deposits[lastDLeafIndex];

    require(
      tornadoTrees.updateDepositTree(
        proofs[0], argsHashes[0], lastDLeaf, roots[0], pathIndices[0], events[0]
      ), "Failure to update the deposit tree"
    );

    require(
      tornadoTrees.updateWithdrawalTree(
        proofs[1], argsHashes[1], lastWLeaf, roots[1], pathIndices[1], events[1]
      ), "Failure to update the withdrawal tree"
    );

    require(tornToken.transfer(address(msg.sender), reward));

    return true;
  }


}
