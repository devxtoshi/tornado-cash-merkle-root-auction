pragma solidity 0.8.0;

interface ERC20 {

  function transfer(address to, uint256 amount) public returns (bool)

  function balanceOf(address owner) external returns (uint256)

}
