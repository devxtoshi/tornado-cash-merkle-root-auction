pragma solidity 0.8.0;

import "./inherits/Sablier.sol";

contract SablierRateAdjuster is Sablier {

    modifier onlySender(uint256 streamId) {
        require(
            msg.sender == streams[streamId].sender,
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
        uint256 refund = stream.senderBalance % (newStopTime - block.timestamp);
        uint256 newDeposit = stream.senderBalance - refund;
        require(newDeposit >= newStopTime - block.timestamp, "deposit smaller than time delta");

        cancelStream(streamId);
        createStream(stream.recipient, newDeposit, stream.tokenAddress, block.timestamp, newStopTime);

        if (refund > 0) require(token.transfer(stream.sender, refund), "sender token transfer failure");
    }

    function adjustDeposit(uint256 streamId, uint256 newDeposit)
    	external
    	nonReentrant
    	streamExists(streamId)
    	onlySender(streamId)
    	returns (bool)
    {
    	Types.Stream memory stream = streams[streamId];
    	uint256 refund = newDeposit % (stream.stopTime - block.timestamp);
        newDeposit -= refund;
        require(newDeposit >= stream.stopTime - block.timestamp, "deposit smaller than time delta");

        cancelStream(streamId);
        createStream(stream.recipient, newDeposit, stream.tokenAddress, block.timestamp, stream.stopTime);

        if (refund > 0) require(token.transfer(stream.sender, refund), "sender token transfer failure");
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
    	uint256 refund = newDeposit % (newStopTime - stream.startTime);
        newDeposit -= refund;
        require(newDeposit >= newStopTime - stream.startTime, "deposit smaller than time delta");

        cancelStream(streamId);
        createStream(stream.recipient, newDeposit, stream.tokenAddress, block.timestamp, newStopTime);

        if (refund > 0) require(token.transfer(stream.sender, refund), "sender token transfer failure");
    }
}
