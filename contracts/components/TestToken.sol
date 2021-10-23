pragma solidity 0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20("tTORN", "Test TORN") {

  constructor() {
    _mint(msg.sender, 100000 ether);
  }

}
