pragma solidity 0.8.0;

interface IERC20 {

  function transfer(address to, uint256 amount) external returns (bool);

  function balanceOf(address owner) external view returns (uint256);

}
