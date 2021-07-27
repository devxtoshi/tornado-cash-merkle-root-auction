pragma solidity 0.8.0;

interface ISablier  {

  function balanceOf(uint256 streamId, address who) external view returns (uint256);

  function withdrawFromStream(uint256 streamId, uint256 amount) external returns (bool);

  function getStream(uint256 streamId) external view returns (
      address sender,
      address recipient,
      uint256 deposit,
      address tokenAddress,
      uint256 startTime,
      uint256 stopTime,
      uint256 remainingBalance,
      uint256 ratePerSecond
  );

}
