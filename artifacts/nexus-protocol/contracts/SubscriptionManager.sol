// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title NEXUS Protocol subscription manager
/// @notice BSC Testnet-first subscription plans paid in 18-decimal USDT or NEXUS.
contract SubscriptionManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant NEXUS_PER_USDT = 80;
    uint8 public constant ACTION_SUBSCRIBE = 1;
    uint8 public constant ACTION_RENEW = 2;
    uint8 public constant ACTION_UPGRADE = 3;

    struct Plan {
        string name;
        uint256 priceUSDT;
        uint256 priceNEXUS;
        uint256 duration;
        bool active;
    }

    struct UserSubscription {
        uint256 planId;
        uint256 expiresAt;
        uint256 lastCharged;
        bool autoRenew;
        address paymentToken;
    }

    IERC20 public immutable usdt;
    IERC20 public immutable nexus;
    uint256 public planCount;
    mapping(uint256 planId => Plan) public plans;
    mapping(address user => UserSubscription) public subscriptions;
    mapping(address keeper => bool) public keepers;

    event PlanCreated(uint256 indexed planId, string name, uint256 priceUSDT, uint256 priceNEXUS, uint256 duration);
    event PlanUpdated(uint256 indexed planId, string name, uint256 priceUSDT, uint256 priceNEXUS, uint256 duration, bool active);
    event SubscriptionPayment(
        address indexed user,
        uint256 indexed planId,
        address indexed paymentToken,
        uint256 amount,
        uint8 action,
        uint256 expiresAt
    );
    event SubscriptionCancelled(address indexed user, uint256 indexed planId, uint256 accessUntil);
    event AutoRenewChanged(address indexed user, bool enabled);
    event KeeperSet(address indexed keeper, bool authorized);
    event Withdrawn(address indexed recipient, address indexed token, uint256 amount);

    modifier onlyKeeper() {
        require(keepers[msg.sender], "SubscriptionManager: not keeper");
        _;
    }

    constructor(address usdt_, address nexus_) Ownable() {
        require(usdt_ != address(0) && nexus_ != address(0), "SubscriptionManager: zero token");
        require(usdt_ != nexus_, "SubscriptionManager: duplicate token");
        require(IERC20Metadata(usdt_).decimals() == 18, "SubscriptionManager: USDT must use 18 decimals");
        require(IERC20Metadata(nexus_).decimals() == 18, "SubscriptionManager: NEXUS must use 18 decimals");
        usdt = IERC20(usdt_);
        nexus = IERC20(nexus_);
    }

    function createPlan(
        string calldata name,
        uint256 priceUSDT,
        uint256 priceNEXUS,
        uint256 duration
    ) external onlyOwner returns (uint256 planId) {
        _validatePlan(name, priceUSDT, priceNEXUS, duration);
        planId = ++planCount;
        plans[planId] = Plan(name, priceUSDT, priceNEXUS, duration, true);
        emit PlanCreated(planId, name, priceUSDT, priceNEXUS, duration);
    }

    function updatePlan(
        uint256 planId,
        string calldata name,
        uint256 priceUSDT,
        uint256 priceNEXUS,
        uint256 duration,
        bool active
    ) external onlyOwner {
        require(planId > 0 && planId <= planCount, "SubscriptionManager: unknown plan");
        _validatePlan(name, priceUSDT, priceNEXUS, duration);
        plans[planId] = Plan(name, priceUSDT, priceNEXUS, duration, active);
        emit PlanUpdated(planId, name, priceUSDT, priceNEXUS, duration, active);
    }

    function subscribe(uint256 planId, address paymentToken) external nonReentrant {
        Plan memory plan = plans[planId];
        require(planId > 0 && plan.active, "SubscriptionManager: inactive plan");
        require(!isActive(msg.sender) || subscriptions[msg.sender].planId == 0, "SubscriptionManager: subscription active");
        _requirePaymentToken(paymentToken);
        uint256 amount = _priceFor(plan, paymentToken);
        _collectExact(paymentToken, msg.sender, amount);

        uint256 expiresAt = block.timestamp + plan.duration;
        subscriptions[msg.sender] = UserSubscription({
            planId: planId,
            expiresAt: expiresAt,
            lastCharged: block.timestamp,
            autoRenew: false,
            paymentToken: paymentToken
        });
        emit SubscriptionPayment(msg.sender, planId, paymentToken, amount, ACTION_SUBSCRIBE, expiresAt);
    }

    /// @notice Renew one period at a time; late renewals do not charge arrears.
    function renew(address user) external onlyKeeper nonReentrant {
        UserSubscription storage subscription = subscriptions[user];
        require(subscription.planId > 0, "SubscriptionManager: no paid plan");
        require(subscription.autoRenew, "SubscriptionManager: renewal disabled");
        require(subscription.expiresAt <= block.timestamp, "SubscriptionManager: not due");

        Plan memory plan = plans[subscription.planId];
        require(plan.active, "SubscriptionManager: inactive plan");
        uint256 amount = _priceFor(plan, subscription.paymentToken);
        _collectExact(subscription.paymentToken, user, amount);

        subscription.lastCharged = block.timestamp;
        subscription.expiresAt = block.timestamp + plan.duration;
        emit SubscriptionPayment(
            user,
            subscription.planId,
            subscription.paymentToken,
            amount,
            ACTION_RENEW,
            subscription.expiresAt
        );
    }

    /// @notice User must separately approve a recurring token allowance before opting in.
    function setAutoRenew(bool enabled) external {
        UserSubscription storage subscription = subscriptions[msg.sender];
        require(subscription.planId > 0, "SubscriptionManager: no paid plan");
        if (enabled) {
            require(isActive(msg.sender), "SubscriptionManager: subscription expired");
            Plan memory plan = plans[subscription.planId];
            require(plan.active, "SubscriptionManager: inactive plan");
            require(
                IERC20(subscription.paymentToken).allowance(msg.sender, address(this))
                    >= _priceFor(plan, subscription.paymentToken),
                "SubscriptionManager: approve at least one renewal"
            );
        }
        subscription.autoRenew = enabled;
        emit AutoRenewChanged(msg.sender, enabled);
    }

    function cancel() external {
        UserSubscription storage subscription = subscriptions[msg.sender];
        require(subscription.planId > 0, "SubscriptionManager: no paid plan");
        require(subscription.autoRenew, "SubscriptionManager: renewal already disabled");
        subscription.autoRenew = false;
        emit AutoRenewChanged(msg.sender, false);
        emit SubscriptionCancelled(msg.sender, subscription.planId, subscription.expiresAt);
    }

    /// @notice Upgrade immediately for the remaining term; prior unused value is credited.
    function upgrade(uint256 newPlanId, address paymentToken) external nonReentrant {
        UserSubscription storage subscription = subscriptions[msg.sender];
        require(subscription.planId > 0 && isActive(msg.sender), "SubscriptionManager: no active paid plan");
        require(newPlanId > subscription.planId, "SubscriptionManager: plan is not an upgrade");
        Plan memory oldPlan = plans[subscription.planId];
        Plan memory newPlan = plans[newPlanId];
        require(newPlan.active, "SubscriptionManager: inactive plan");
        _requirePaymentToken(paymentToken);

        uint256 remaining = subscription.expiresAt - block.timestamp;
        uint256 oldCreditUSDT = Math.mulDiv(oldPlan.priceUSDT, remaining, oldPlan.duration);
        uint256 newCostUSDT = Math.mulDiv(newPlan.priceUSDT, remaining, newPlan.duration);
        uint256 differenceUSDT = newCostUSDT > oldCreditUSDT ? newCostUSDT - oldCreditUSDT : 0;
        uint256 amount = paymentToken == address(usdt)
            ? differenceUSDT
            : Math.mulDiv(differenceUSDT, NEXUS_PER_USDT, 1);
        _collectExact(paymentToken, msg.sender, amount);

        subscription.planId = newPlanId;
        subscription.paymentToken = paymentToken;
        subscription.lastCharged = block.timestamp;
        if (subscription.autoRenew) {
            subscription.autoRenew = false;
            emit AutoRenewChanged(msg.sender, false);
        }
        emit SubscriptionPayment(
            msg.sender,
            newPlanId,
            paymentToken,
            amount,
            ACTION_UPGRADE,
            subscription.expiresAt
        );
    }

    function isActive(address user) public view returns (bool) {
        UserSubscription storage subscription = subscriptions[user];
        if (subscription.planId == 0) return true;
        return subscription.expiresAt > block.timestamp;
    }

    function getSubscription(address user)
        external
        view
        returns (uint256 planId, uint256 expiresAt, bool autoRenew)
    {
        UserSubscription storage subscription = subscriptions[user];
        return (subscription.planId, subscription.expiresAt, subscription.autoRenew);
    }

    function setKeeper(address keeper, bool authorized) external onlyOwner {
        require(keeper != address(0), "SubscriptionManager: zero keeper");
        keepers[keeper] = authorized;
        emit KeeperSet(keeper, authorized);
    }

    function withdraw(address token) external onlyOwner nonReentrant {
        _requirePaymentToken(token);
        uint256 amount = IERC20(token).balanceOf(address(this));
        require(amount > 0, "SubscriptionManager: no payment balance");
        IERC20(token).safeTransfer(owner(), amount);
        emit Withdrawn(owner(), token, amount);
    }

    function _validatePlan(
        string calldata name,
        uint256 priceUSDT,
        uint256 priceNEXUS,
        uint256 duration
    ) private pure {
        require(bytes(name).length > 0 && bytes(name).length <= 32, "SubscriptionManager: invalid name");
        require(priceUSDT > 0 && duration > 0, "SubscriptionManager: invalid plan");
        require(priceUSDT <= type(uint256).max / NEXUS_PER_USDT, "SubscriptionManager: price overflow");
        require(priceNEXUS == priceUSDT * NEXUS_PER_USDT, "SubscriptionManager: incorrect NEXUS price");
    }

    function _requirePaymentToken(address paymentToken) private view {
        require(
            paymentToken == address(usdt) || paymentToken == address(nexus),
            "SubscriptionManager: unsupported payment token"
        );
    }

    function _priceFor(Plan memory plan, address paymentToken) private view returns (uint256) {
        if (paymentToken == address(usdt)) return plan.priceUSDT;
        require(paymentToken == address(nexus), "SubscriptionManager: unsupported payment token");
        return plan.priceNEXUS;
    }

    function _collectExact(address token, address payer, uint256 amount) private {
        if (amount == 0) return;
        IERC20 payment = IERC20(token);
        uint256 beforeBalance = payment.balanceOf(address(this));
        payment.safeTransferFrom(payer, address(this), amount);
        require(
            payment.balanceOf(address(this)) - beforeBalance == amount,
            "SubscriptionManager: fee-on-transfer tokens unsupported"
        );
    }
}
