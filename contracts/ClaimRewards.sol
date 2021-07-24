pragma 0.8.0;

import "@sablierhq/sablier-smooth-contracts/blob/master/contracts/Sablier.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./interfaces/ITornadoTrees.sol";

contract ClaimRewards {

  address public treesProxy = 0x200a79068d8141924b511bc78cb55dca89cf5c2e;

  ITornadoTrees public tornadoTreesV1;
  ITornadoTrees public tornadoTreesV2;

  constructor() {
    tornadoTrees = ITornadoTrees(treesProxy);
  }

  function leavesUntilDepositSync() external returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.withdrawalsLength();
    uint256 lastLeaf = tornadoTrees.lastProcessedDepositLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }

  function leavesUntilWithdrawalSync() external returns (uint256 remainingLeaves) {
    uint256 totalLeaves = tornadoTrees.withdrawalsLength();
    uint256 lastDepositLeaf = tornado.lastProcessedWithdrawalLeaf();

    remainingLeaves = totalLeaves - lastLeaf;
  }


}
