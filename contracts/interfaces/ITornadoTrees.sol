pragma 0.8.0;

struct TreeLeaf {
   address instance;
   bytes32 hash;
   uint256 block;
 }

interface ITornadoTrees {

  function updateRoots(TreeLeaf[] calldata _deposits, TreeLeaf[] calldata _withdrawals) external

  function tornadoTreesV1() external view returns (address)

  function withdrawalsLength() external view returns (uint256)

  function depositsLength() external view returns (uint256)

  function lastProcessedWithdrawalLeaf() external view returns (bytes32)

  function lastProcessedDepositLeaf() external view returns (bytes32)

  function withdrawalRoot() external view returns (bytes32)

  function depositRoot() external view returns (bytes32)

  function withdrawals(uint256 i) external view returns (bytes32)

  function deposits(uint256 i) external view returns (bytes32)

}
