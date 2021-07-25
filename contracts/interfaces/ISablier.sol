pragma 0.8.0;

interface ISablier  {

  function balanceOf(uint256 streamId, address who) public view returns (uint256)

  function withdrawFromStream(uint256 streamId, uint256 amount) returns (bool)

}
