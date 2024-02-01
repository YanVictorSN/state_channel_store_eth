//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * A smart contract that allows changing a state variable of the contract and tracking the changes
 * It also allows the owner to withdraw the Ether in the contract
 * @author BuidlGuidl
 */
contract DeliveryStore is Ownable {
	constructor(address _owner) {
		transferOwnership(_owner);
	}

	struct Channel {
		address customer;
		uint256 channelBalance;
		bool isOpen;
		bytes32 orderIdentifier;
	}

	struct Order {
		uint256 orderId;
		address customer;
		string product;
		uint256 price;
		DeliveryStatus status;
		address deliveryPersonAddress;
		uint256 channelId;
	}

	event OrderPlaced(
		uint256 orderId,
		address customer,
		string product,
		uint256 price,
		DeliveryStatus status,
		address deliveryPersonAddress
	);

	event ConfirmDelivery(
		uint256 orderId,
		address customer,
		string product,
		uint256 price,
		DeliveryStatus status
	);

	enum DeliveryStatus {
		Processing,
		Accepted,
		EnRoute,
		Delivered
	}

	uint256 private orderIdCounter;
	uint256 private channelIdCounter;

	mapping(uint256 => Order) public orders;
	mapping(uint256 => Channel) public channels;
	mapping(bytes32 => uint256) channelIdsByOrderIdentifier;
	mapping(address => uint256) customerOpenChannels;

	event ChannelOpened(uint256 channelId, address customer, uint256 deposit);

	event ChannelClosed(
		uint256 channelId,
		address customer,
		uint256 channelBalance
	);

	modifier onlyChannelParticipant(uint256 _channelId) {
		require(
			msg.sender == channels[_channelId].customer,
			"Invalid participant"
		);
		_;
	}

	modifier channelIsOpen(uint256 _channelId) {
		require(channels[_channelId].isOpen, "Channel is closed");
		_;
	}

	function openChannel() external payable {
		channelIdCounter++;

		Channel storage newChannel = channels[channelIdCounter];
		newChannel.customer = msg.sender;
		newChannel.channelBalance = msg.value;
		newChannel.isOpen = true;

		customerOpenChannels[msg.sender] = channelIdCounter;

		emit ChannelOpened(channelIdCounter, msg.sender, msg.value);
	}

	// function closeChannel(
	// 	uint256 _channelId
	// ) external onlyChannelParticipant(_channelId) channelIsOpen(_channelId) {
	// 	Channel storage channel = channels[_channelId];
	// 	channel.isOpen = false;

	// 	// Distribute funds based on the final state
	// 	channel.customer.transfer(channel.channelBalance / 2);
	// 	channel.seller.transfer(channel.channelBalance / 2);

	// 	emit ChannelClosed(
	// 		_channelId,
	// 		channel.customer,
	// 		channel.seller,
	// 		channel.channelBalance
	// 	);
	// }

	function orderProduct(string memory _product) public payable {
		uint256 channelId = customerOpenChannels[msg.sender];

		Channel storage associatedChannel = channels[channelId];

		Order memory newOrder = Order({
			orderId: orderIdCounter,
			customer: msg.sender,
			product: _product,
			price: msg.value,
			status: DeliveryStatus.Processing,
			deliveryPersonAddress: address(0),
			channelId: channelId
		});

		orders[orderIdCounter] = newOrder;
		associatedChannel.orderIdentifier = bytes32(orderIdCounter);

		emit OrderPlaced(
			orderIdCounter,
			msg.sender,
			_product,
			msg.value,
			DeliveryStatus.Processing,
			address(0)
		);
	}

	function setDeliveryPerson(
		uint256 _orderId,
		address _deliveryPersonAddress
	) public onlyOwner {
		require(_orderId <= orderIdCounter, "Invalid order ID");
		require(
			orders[_orderId].status == DeliveryStatus.Processing,
			"Order must be in Processing state"
		);

		orders[_orderId].deliveryPersonAddress = _deliveryPersonAddress;

		emit OrderPlaced(
			_orderId,
			orders[_orderId].customer,
			orders[_orderId].product,
			orders[_orderId].price,
			DeliveryStatus.EnRoute,
			_deliveryPersonAddress
		);
	}

	function confirmDelivery(uint256 _orderId) public {
		require(
			orders[_orderId].status == DeliveryStatus.EnRoute,
			"Order must be in Processing state"
		);

		uint256 channelId = customerOpenChannels[msg.sender];
		Channel storage associatedChannel = channels[channelId];
		associatedChannel.isOpen = false;

		emit ConfirmDelivery(
			_orderId,
			orders[_orderId].customer,
			orders[_orderId].product,
			orders[_orderId].price,
			DeliveryStatus.Delivered
		);
	}

	receive() external payable {}
}
