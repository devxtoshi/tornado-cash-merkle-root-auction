pragma solidity 0.5.11;

import "./inherits/Sablier.sol";

contract SablierRateAdjuster is Sablier {

  modifier onlySender(uint256 streamId) {
    require(msg.sender == streams[streamId].sender,
      "caller is not the sender of the stream"
    );
    _;
  }

  function adjustEndTime(uint256 streamId, uint256 newStopTime)
      external
      nonReentrant
      streamExists(streamId)
      onlySender(streamId)
      returns (bool)
  {
      require(newStopTime > block.timestamp, "stop time before block.timestamp");
      Types.Stream memory stream = streams[streamId];
      IERC20 token = IERC20(stream.tokenAddress);

      uint256 senderBalance = balanceOf(streamId, stream.sender);
      uint256 refund = senderBalance % (newStopTime - block.timestamp);
      uint256 newDeposit = senderBalance - refund;
      require(newDeposit >= newStopTime - block.timestamp, "deposit smaller than time delta");

      _cancelStream(streamId);
      createStream(stream.recipient, newDeposit, stream.tokenAddress, block.timestamp, newStopTime);

      if(refund > 0) require(token.transfer(stream.sender, refund), "sender token transfer failure");
   }

   function adjustDeposit(uint256 streamId, uint256 newDeposit)
    	external
    	nonReentrant
    	streamExists(streamId)
    	onlySender(streamId)
    	returns (bool)
    {
    	Types.Stream memory stream = streams[streamId];
      IERC20 token = IERC20(stream.tokenAddress);

    	uint256 refund = newDeposit % (stream.stopTime - block.timestamp);
      uint256 depositWithoutRefund = newDeposit - refund;

      require(depositWithoutRefund >= stream.stopTime - block.timestamp, "deposit smaller than time delta");

      _cancelStream(streamId);
      createStream(stream.recipient, depositWithoutRefund, stream.tokenAddress, block.timestamp, stream.stopTime);

      if(refund > 0) require(token.transfer(stream.sender, refund), "sender token transfer failure");
    }

    function adjustEndTimeAndDeposit(uint256 streamId, uint256 newStopTime, uint256 newDeposit)
    	external
    	nonReentrant
    	streamExists(streamId)
    	onlySender(streamId)
    	returns (bool)
    {
    	require(newStopTime > block.timestamp, "stop time before block.timestamp");

    	Types.Stream memory stream = streams[streamId];
      IERC20 token = IERC20(stream.tokenAddress);

    	uint256 refund = newDeposit % (newStopTime - stream.startTime);
      uint256 depositWithoutRefund = newDeposit - refund;

      require(depositWithoutRefund >= newStopTime - stream.startTime, "deposit smaller than time delta");

      _cancelStream(streamId);
      createStream(stream.recipient, depositWithoutRefund, stream.tokenAddress, block.timestamp, newStopTime);

      if(refund > 0) require(token.transfer(stream.sender, refund), "sender token transfer failure");
    }

}
