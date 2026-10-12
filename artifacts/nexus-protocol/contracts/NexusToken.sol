// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// رمز NEXUS بإمداد ثابت ورسوم قابلة للضبط ضمن حدود معلنة.
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Nexus Protocol token
/// @notice Fixed-supply NEXUS token with capped transfer burn and treasury fees.
contract NexusToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;
    uint256 public constant MAX_FEE_BPS = 500;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    address public treasury;
    uint256 public burnFee;
    uint256 public treasuryFee;
    mapping(address account => bool) public isExcludedFromFee;

    event FeesUpdated(uint256 burnFee, uint256 treasuryFee);
    event FeeExclusionUpdated(address indexed account, bool excluded);

    constructor(address treasury_) ERC20("Nexus Protocol", "NEXUS") Ownable() {
        require(treasury_ != address(0), "NexusToken: zero treasury");
        treasury = treasury_;
        isExcludedFromFee[msg.sender] = true;
        isExcludedFromFee[treasury_] = true;
        _mint(msg.sender, MAX_SUPPLY);
    }

    function setFees(uint256 burnFee_, uint256 treasuryFee_) external onlyOwner {
        require(burnFee_ <= MAX_FEE_BPS, "NexusToken: burn fee too high");
        require(treasuryFee_ <= MAX_FEE_BPS, "NexusToken: treasury fee too high");
        burnFee = burnFee_;
        treasuryFee = treasuryFee_;
        emit FeesUpdated(burnFee_, treasuryFee_);
    }

    function excludeFromFee(address account, bool excluded) external onlyOwner {
        require(account != address(0), "NexusToken: zero account");
        isExcludedFromFee[account] = excluded;
        emit FeeExclusionUpdated(account, excluded);
    }

    function _transfer(address from, address to, uint256 value) internal override {
        if (
            isExcludedFromFee[from] ||
            isExcludedFromFee[to] ||
            (burnFee == 0 && treasuryFee == 0)
        ) {
            super._transfer(from, to, value);
            return;
        }

        uint256 burnAmount = (value * burnFee) / BPS_DENOMINATOR;
        uint256 treasuryAmount = (value * treasuryFee) / BPS_DENOMINATOR;
        uint256 recipientAmount = value - burnAmount - treasuryAmount;

        super._transfer(from, to, recipientAmount);
        if (burnAmount > 0) _burn(from, burnAmount);
        if (treasuryAmount > 0) super._transfer(from, treasury, treasuryAmount);
    }
}
