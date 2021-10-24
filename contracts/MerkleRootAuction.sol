pragma solidity 0.8.0;

import "./interfaces/ITornadoTrees.sol";
import "./interfaces/ISablier.sol";
import "./interfaces/IERC20.sol";

contract MerkleRootAuction {

  uint256 constant public BASE18 = 10 ** 18;

  ITornadoTrees public tornadoTrees;
  ISablier public merkleStream;
  IERC20 public tornToken;

  uint256 merkleStreamId;
  address operator;

  modifier isOperator() {
    require(operator == msg.sender);
    _;
  }

  constructor(
    address treesAddress,
    address tokenAddress,
    address streamAddress
  ) {
    tornadoTrees = ITornadoTrees(treesAddress);
    merkleStream = ISablier(streamAddress);
    tornToken = IERC20(tokenAddress);
    operator = msg.sender;
  }

  function initialiseStream(uint256 streamId) isOperator() public {
    (address sender, address recipient, , address tokenAddress, , , , ) =
     merkleStream.getStream(streamId);

    require(sender == operator && recipient == address(this));
    require(tokenAddress == address(tornToken));

    merkleStreamId = streamId;
  }

  function leavesUntilWithdrawalSync() public view returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.withdrawalsLength();
    uint256 lastLeaf = tornadoTrees.lastProcessedWithdrawalLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }

  function leavesUntilDepositSync() public view returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.depositsLength();
    uint256 lastLeaf = tornadoTrees.lastProcessedDepositLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }

  function leavesUntilWithdrawal(uint256 i) public view returns (uint256 leaves) {
    leaves = (i - tornadoTrees.lastProcessedWithdrawalLeaf());
  }

  function leavesUntilDeposit(uint256 i) public view returns (uint256 leaves) {
    leaves = (i - tornadoTrees.lastProcessedDepositLeaf());
  }

  function pendingLeaves() public view returns (uint256 leaves) {
    leaves = leavesUntilDepositSync() + leavesUntilWithdrawalSync();
  }

  function getLatestLeaves() public view returns (bytes32[2] memory) {
     return [
        tornadoTrees.withdrawals(tornadoTrees.lastProcessedWithdrawalLeaf()),
        tornadoTrees.deposits(tornadoTrees.lastProcessedDepositLeaf())
     ];
  }

  function reward(uint256 deposits, uint256 withdrawals) public view returns (uint256 reward) {
    uint256 streamBalance = merkleStream.balanceOf(merkleStreamId, address(this));
    uint256 auctionBalance = tornToken.balanceOf(address(this));
    uint256 queryFufilment  = (withdrawals + deposits) * BASE18;
    uint256 totalFufilment = queryFufilment / pendingLeaves();
    uint256 rewardBalance = streamBalance + auctionBalance;

    reward = (rewardBalance * totalFufilment) / BASE18;
  }

  function updateRoots(
    bytes[2] calldata proofs,
    bytes32[2] memory argsHashes,
    bytes32[2] memory currentRoots,
    bytes32[2] memory newRoots,
    uint32[2] memory pathIndices,
    TreeLeaf[CHUNK_SIZE][2] calldata events
  ) external returns (bool) {
    uint256 payout = reward(leavesUntilDeposit(pathIndices[0]), leavesUntilWithdrawal(pathIndices[1]));

    tornadoTrees.updateDepositTree(
      proofs[0], argsHashes[0], tornadoTrees.depositRoot(), newRoots[0], pathIndices[0], events[0]
    );

    tornadoTrees.updateWithdrawalTree(
      proofs[1], argsHashes[1], tornadoTrees.withdrawalRoot(), newRoots[1], pathIndices[1], events[1]
    );

    require(
      merkleStream.withdrawFromStream(
        merkleStreamId, merkleStream.balanceOf(merkleStreamId, address(this))
      ), "Failure to withdraw stream balance"
    );

    return tornToken.transfer(address(msg.sender), payout);
  }

}
