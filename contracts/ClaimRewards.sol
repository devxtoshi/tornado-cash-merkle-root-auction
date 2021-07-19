pragma 0.8.0;

import "./interfaces/ITornadoTrees.sol";

contract ClaimRewards {

  address public treesProxy = 0x200a79068d8141924b511bc78cb55dca89cf5c2e;

  ITornadoTrees public tornadoTreesV1;
  ITornadoTrees public tornadoTreesV2;

  constructor() {
    tornadoTreesV2 = ITornadoTrees(treesProxy);
    tornadoTreesV1 = ITornadoTrees(tornadoTreesV2.tornadoTreesV1());
  }

}
