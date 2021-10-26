pragma solidity 0.8.0;
pragma experimental ABIEncoderV2;

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
    (address sender, address recipient, , address tokenAddress, , , , ) =  merkleStream.getStream(streamId);

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

  function reward(uint256 deposits, uint256 withdrawals) public view returns (uint256) {
    uint256 streamBalance = merkleStream.balanceOf(merkleStreamId, address(this));
    uint256 auctionBalance = tornToken.balanceOf(address(this));
    uint256 rewardBalance = streamBalance + auctionBalance;

    uint256 queryFufilment  = (withdrawals + deposits) * BASE18;
    uint256 totalFufilment = queryFufilment / pendingLeaves();

    if(deposits > uint256(0) || withdrawals > uint256(0)){
      return (rewardBalance * totalFufilment) / BASE18;
    } else {
      return rewardBalance;
    }
  }

  function updateRoots(
    bytes calldata depositsParams,
    bytes calldata withdrawalsParams
  ) external returns (bool) {
    uint32 depositsPathIndex = getPathIndex(withdrawalsParams);
    uint32 withdrawalsPathIndex = getPathIndex(withdrawalsParams);
    uint256 leavesWithdrawals = leavesUntilWithdrawal(withdrawalsPathIndex);
    uint256 leavesDeposits = leavesUntilDeposit(depositsPathIndex);
    uint256 lastProcessedWithdrawal = tornadoTrees.lastProcessedWithdrawalLeaf();
    uint256 lastProcessedDeposit = tornadoTrees.lastProcessedDepositLeaf();
    uint256 payout = reward(leavesDeposits, leavesWithdrawals);

    (bool depositsConf, ) = address(tornadoTrees).call(depositsParams);
    (bool withdrawalsConf, ) = address(tornadoTrees).call(withdrawalsParams);

    require(depositsConf && withdrawalsConf, "Failure to update trees");

    require(
      lastProcessedWithdrawal + leavesWithdrawals <= tornadoTrees.lastProcessedWithdrawalLeaf()
      && lastProcessedDeposit + leavesDeposits <= tornadoTrees.lastProcessedDepositLeaf(),
      "Tree path indices don't match tree fulfillment"
    );

    require(
      merkleStream.withdrawFromStream(
        merkleStreamId, merkleStream.balanceOf(merkleStreamId, address(this))
      ), "Failure to withdraw stream balance"
    );

    if(tornToken.balanceOf(address(this)) == payout){
      require(
        leavesUntilWithdrawalSync() + leavesUntilDepositSync() == uint256(0),
        "Reward does not match tree fulfillment sync"
      );
    }

    return tornToken.transfer(address(msg.sender), payout);
  }

  function getPathIndex(bytes calldata metadata) public returns (uint32 index) {
    (, , , , index) = abi.decode(metadata[4:], (bytes, bytes32, bytes32, bytes32, uint32));
  }

}
