// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// سجل on-chain لبصمات الإشارات ونتائج التنفيذ التي يعلنها الناشر.
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Nexus Protocol signal registry
/// @notice Stores signal commitments and publisher-reported execution outcomes on-chain.
contract SignalRegistry is Ownable {
    struct Signal {
        uint256 id;
        bytes32 signalHash;
        string symbol;
        string action;
        uint256 entryPrice;
        uint256 timestamp;
        address publisher;
        bool executed;
        int256 pnlBps;
    }

    uint256 public signalCount;
    mapping(address publisher => bool) public authorizedPublishers;
    mapping(uint256 id => Signal) private signals;

    event PublisherAuthorized(address indexed publisher, bool authorized);
    event SignalPublished(uint256 indexed signalId, bytes32 indexed signalHash, string symbol, string action, uint256 entryPrice, address indexed publisher);
    event SignalExecuted(uint256 indexed signalId, int256 pnlBps, address indexed publisher);

    modifier onlyPublisher() {
        require(authorizedPublishers[msg.sender], "SignalRegistry: not authorized publisher");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function authorizePublisher(address publisher, bool authorized) external onlyOwner {
        require(publisher != address(0), "SignalRegistry: zero publisher");
        authorizedPublishers[publisher] = authorized;
        emit PublisherAuthorized(publisher, authorized);
    }

    function publishSignal(
        bytes32 signalHash,
        string calldata symbol,
        string calldata action,
        uint256 entryPrice
    ) external onlyPublisher returns (uint256 signalId) {
        require(signalHash != bytes32(0), "SignalRegistry: empty hash");
        require(bytes(symbol).length > 0 && bytes(action).length > 0, "SignalRegistry: empty signal");
        require(entryPrice > 0, "SignalRegistry: zero entry price");

        signalId = ++signalCount;
        signals[signalId] = Signal({
            id: signalId,
            signalHash: signalHash,
            symbol: symbol,
            action: action,
            entryPrice: entryPrice,
            timestamp: block.timestamp,
            publisher: msg.sender,
            executed: false,
            pnlBps: 0
        });
        emit SignalPublished(signalId, signalHash, symbol, action, entryPrice, msg.sender);
    }

    function recordExecution(uint256 id, int256 pnlBps) external onlyPublisher {
        Signal storage signal = signals[id];
        require(signal.id != 0, "SignalRegistry: unknown signal");
        require(!signal.executed, "SignalRegistry: already executed");
        require(signal.publisher == msg.sender, "SignalRegistry: not signal publisher");

        signal.executed = true;
        signal.pnlBps = pnlBps;
        emit SignalExecuted(id, pnlBps, msg.sender);
    }

    function getSignal(uint256 id) external view returns (Signal memory) {
        require(signals[id].id != 0, "SignalRegistry: unknown signal");
        return signals[id];
    }
}
