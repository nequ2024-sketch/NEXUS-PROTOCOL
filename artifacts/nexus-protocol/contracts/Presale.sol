// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// عقد البيع المسبق يقبل رمز دفع يحدده المشغّل صراحةً.
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Nexus Protocol presale
/// @notice Accepts a configured 18-decimal payment token and sells NEXUS on a fixed schedule.
contract Presale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant RATE_SCALE = 1 ether;
    IERC20 public immutable nexus;
    IERC20 public immutable paymentToken;
    uint256 public immutable rate;
    uint256 public immutable hardCap;
    uint256 public immutable minPurchase;
    uint256 public immutable startTime;
    uint256 public immutable endTime;

    mapping(address account => uint256) public contributions;
    mapping(address account => uint256) public purchasedTokens;

    event TokensPurchased(address indexed buyer, uint256 paymentAmount, uint256 tokenAmount);
    event Withdrawn(address indexed recipient, address indexed token, uint256 amount);

    constructor(
        address nexus_,
        address payment_,
        uint256 rate_,
        uint256 hardCap_,
        uint256 minPurchase_,
        uint256 start_,
        uint256 duration_
    ) Ownable(msg.sender) {
        require(nexus_ != address(0) && payment_ != address(0), "Presale: zero token");
        require(rate_ > 0 && hardCap_ > 0 && minPurchase_ > 0, "Presale: zero sale setting");
        require(duration_ > 0 && start_ >= block.timestamp, "Presale: invalid schedule");
        nexus = IERC20(nexus_);
        paymentToken = IERC20(payment_);
        rate = rate_;
        hardCap = hardCap_;
        minPurchase = minPurchase_;
        startTime = start_;
        endTime = start_ + duration_;
    }

    function buy(uint256 usdtAmount) external nonReentrant {
        require(block.timestamp >= startTime && block.timestamp < endTime, "Presale: sale inactive");
        require(usdtAmount >= minPurchase, "Presale: below minimum");

        uint256 tokenAmount = (usdtAmount * rate) / RATE_SCALE;
        require(tokenAmount > 0, "Presale: zero token amount");
        require(purchasedTokens[msg.sender] + tokenAmount <= hardCap, "Presale: hard cap exceeded");
        require(nexus.balanceOf(address(this)) >= tokenAmount, "Presale: insufficient token inventory");

        contributions[msg.sender] += usdtAmount;
        purchasedTokens[msg.sender] += tokenAmount;
        paymentToken.safeTransferFrom(msg.sender, address(this), usdtAmount);
        nexus.safeTransfer(msg.sender, tokenAmount);

        emit TokensPurchased(msg.sender, usdtAmount, tokenAmount);
    }

    function withdrawPayment() external onlyOwner nonReentrant {
        uint256 amount = paymentToken.balanceOf(address(this));
        require(amount > 0, "Presale: no payment balance");
        paymentToken.safeTransfer(owner(), amount);
        emit Withdrawn(owner(), address(paymentToken), amount);
    }

    function withdrawUnsoldTokens() external onlyOwner nonReentrant {
        require(block.timestamp >= endTime, "Presale: sale not ended");
        uint256 amount = nexus.balanceOf(address(this));
        require(amount > 0, "Presale: no unsold tokens");
        nexus.safeTransfer(owner(), amount);
        emit Withdrawn(owner(), address(nexus), amount);
    }
}
