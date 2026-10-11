// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// إدارة اشتراكات USDT مع تجديد دوري بواسطة keeper مصرح.
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Nexus Protocol subscription manager
/// @notice Manages USDT plans and keeper-triggered renewals without taking custody of user wallets.
contract SubscriptionManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Plan {
        uint256 price;
        uint256 duration;
        bool active;
    }

    struct UserSubscription {
        uint256 planId;
        uint256 expiresAt;
        uint256 lastCharged;
        bool autoRenew;
    }

    IERC20 public immutable paymentToken;
    uint256 public planCount;
    mapping(uint256 planId => Plan) public plans;
    mapping(address user => UserSubscription) public subscriptions;
    mapping(address keeper => bool) public keepers;

    event PlanCreated(uint256 indexed planId, uint256 price, uint256 duration);
    event PlanUpdated(uint256 indexed planId, uint256 price, uint256 duration, bool active);
    event Subscribed(address indexed user, uint256 indexed planId, uint256 expiresAt);
    event Charged(address indexed user, uint256 indexed planId, uint256 periods, uint256 amount, uint256 expiresAt);
    event Cancelled(address indexed user, uint256 indexed planId, uint256 accessUntil);
    event KeeperSet(address indexed keeper, bool authorized);
    event Withdrawn(address indexed recipient, uint256 amount);

    modifier onlyKeeper() {
        require(keepers[msg.sender], "SubscriptionManager: not keeper");
        _;
    }

    constructor(address payment_) Ownable(msg.sender) {
        require(payment_ != address(0), "SubscriptionManager: zero payment token");
        paymentToken = IERC20(payment_);
    }

    function createPlan(uint256 price, uint256 duration) external onlyOwner returns (uint256 planId) {
        require(price > 0 && duration > 0, "SubscriptionManager: invalid plan");
        planId = ++planCount;
        plans[planId] = Plan({price: price, duration: duration, active: true});
        emit PlanCreated(planId, price, duration);
    }

    function updatePlan(uint256 planId, uint256 price, uint256 duration, bool active) external onlyOwner {
        require(planId > 0 && planId <= planCount, "SubscriptionManager: unknown plan");
        require(price > 0 && duration > 0, "SubscriptionManager: invalid plan");
        plans[planId] = Plan({price: price, duration: duration, active: active});
        emit PlanUpdated(planId, price, duration, active);
    }

    function subscribe(uint256 planId) external nonReentrant {
        Plan memory plan = plans[planId];
        require(plan.active, "SubscriptionManager: inactive plan");
        require(!isActive(msg.sender), "SubscriptionManager: subscription active");

        paymentToken.safeTransferFrom(msg.sender, address(this), plan.price);
        uint256 expiresAt = block.timestamp + plan.duration;
        subscriptions[msg.sender] = UserSubscription({
            planId: planId,
            expiresAt: expiresAt,
            lastCharged: block.timestamp,
            autoRenew: true
        });
        emit Subscribed(msg.sender, planId, expiresAt);
    }

    /// @notice Charges every elapsed renewal period in one transferFrom call.
    function charge(address user) external onlyKeeper nonReentrant {
        UserSubscription storage userSub = subscriptions[user];
        require(userSub.autoRenew, "SubscriptionManager: renewal disabled");
        require(userSub.expiresAt <= block.timestamp, "SubscriptionManager: not due");

        Plan memory plan = plans[userSub.planId];
        require(plan.active, "SubscriptionManager: inactive plan");
        uint256 periods = (block.timestamp - userSub.lastCharged) / plan.duration;
        require(periods > 0, "SubscriptionManager: not due");
        uint256 amount = periods * plan.price;

        paymentToken.safeTransferFrom(user, address(this), amount);
        uint256 extension = periods * plan.duration;
        userSub.lastCharged += extension;
        userSub.expiresAt += extension;
        emit Charged(user, userSub.planId, periods, amount, userSub.expiresAt);
    }

    function cancel() external {
        UserSubscription storage userSub = subscriptions[msg.sender];
        require(userSub.autoRenew, "SubscriptionManager: renewal already disabled");
        userSub.autoRenew = false;
        emit Cancelled(msg.sender, userSub.planId, userSub.expiresAt);
    }

    function isActive(address user) public view returns (bool) {
        return subscriptions[user].expiresAt > block.timestamp;
    }

    function setKeeper(address keeper, bool authorized) external onlyOwner {
        require(keeper != address(0), "SubscriptionManager: zero keeper");
        keepers[keeper] = authorized;
        emit KeeperSet(keeper, authorized);
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 amount = paymentToken.balanceOf(address(this));
        require(amount > 0, "SubscriptionManager: no payment balance");
        paymentToken.safeTransfer(owner(), amount);
        emit Withdrawn(owner(), amount);
    }
}
