pragma 0.8.0;

interface ITornadoTrees {

  function withdrawalsLength() public view returns (uint8)

  function depositsLength() public view returns (uint8)

  function lastProcessedWithdrawalLeaf() public view returns (bytes32)

  function lastProcessedDepositLeaf() public view returns (bytes32)

}
