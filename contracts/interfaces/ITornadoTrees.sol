pragma solidity 0.8.0;

uint256 constant CHUNK_TREE_HEIGHT = 4;
uint256 constant CHUNK_SIZE = 2**CHUNK_TREE_HEIGHT;

struct TreeLeaf {
   address instance;
   bytes32 hash;
   uint256 block;
 }

interface ITornadoTrees {

  function updateWithdrawalTree(
    bytes calldata _proof,
    bytes32 _argsHash,
    bytes32 _currentRoot,
    bytes32 _newRoot,
    uint32 _pathIndices,
    TreeLeaf[CHUNK_SIZE] calldata _events
) external;

  function updateDepositTree(
    bytes calldata _proof,
    bytes32 _argsHash,
    bytes32 _currentRoot,
    bytes32 _newRoot,
    uint32 _pathIndices,
    TreeLeaf[CHUNK_SIZE] calldata _events
  ) external;

  function withdrawalsLength() external view returns (uint256);

  function depositsLength() external view returns (uint256);

  function lastProcessedWithdrawalLeaf() external view returns (uint256);

  function lastProcessedDepositLeaf() external view returns (uint256);

  function withdrawals(uint256 i) external view returns (bytes32);

  function deposits(uint256 i) external view returns (bytes32);

  function withdrawalRoot() external view returns (bytes32);

  function depositRoot() external view returns (bytes32);

  event DepositData(address instance, bytes32 indexed hash, uint256 block, uint256 index);

  event WithdrawalData(address instance, bytes32 indexed hash, uint256 block, uint256 index);
}
