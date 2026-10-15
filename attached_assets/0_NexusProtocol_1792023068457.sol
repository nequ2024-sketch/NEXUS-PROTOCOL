// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts@4.9.0/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts@4.9.0/access/Ownable.sol";
import "@openzeppelin/contracts@4.9.0/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts@4.9.0/security/Pausable.sol";

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80,
        int256,
        uint256,
        uint256,
        uint80
    );
}

contract NexusProtocol is ERC20, Ownable, ReentrancyGuard, Pausable {
    AggregatorV3Interface internal priceFeed;

    // ═══════════════════════════════════════
    //    التعديل: الكمية صارت مليار
    // ═══════════════════════════════════════
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;       // مليار
    uint256 public constant MAX_PRESALE_TOKENS = 300_000_000 * 10**18; // 300 مليون

    // ═══════════════════════════════════════
    //    التعديل: السعر صار $0.01
    //    المعادلة: SINGLE_UNIT_PRICE * 1e16 = السعر بالدولار
    //    1 * 1e16 = 0.01 دولار ✓
    // ═══════════════════════════════════════
    uint256 public constant SINGLE_UNIT_PRICE = 1;  // $0.01
    uint256 public constant BULK_UNIT_PRICE = 1;    // $0.01 (نفس السعر)

    uint256 public constant MAX_BUY_PER_TX = 1_000_000 * 10**18;  // 1M توكن
    uint256 public constant BUY_DELAY = 5;

    uint256 public presaleTokensSold;
    bool public presaleActive;
    address public treasury;

    mapping(address => uint256) public lastBuyBlock;
    mapping(address => bool) public hasClaimedWelcomeBonus;

    event TokensPurchased(address indexed buyer, uint256 amount);
    event PresaleStatusChanged(bool active);

    constructor(address _priceFeedAddress, address _treasury)
        ERC20("Nexus Protocol", "NEXUS")
    {
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
        treasury = _treasury;
        // المنشئ يحصل على كل التوكنات ما عدا حصة البيع
        _mint(msg.sender, MAX_SUPPLY - MAX_PRESALE_TOKENS);
    }

    function togglePresale() external onlyOwner {
        presaleActive = !presaleActive;
        emit PresaleStatusChanged(presaleActive);
    }

    function getLatestBNBPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return uint256(price) * 10**10;
    }

    function buyTokens(address referrer) external payable nonReentrant whenNotPaused {
        require(presaleActive, "Presale is not active");
        require(
            block.number > lastBuyBlock[msg.sender] + BUY_DELAY,
            "Wait before next buy"
        );

        uint256 bnbPrice = getLatestBNBPrice();
        uint256 usdValue = (msg.value * bnbPrice) / 1e18;

        uint256 tokensToBuy = (usdValue * 1e18) / (SINGLE_UNIT_PRICE * 1e16);

        // سعر الجملة (نفس السعر هنا، لكن البنية محفوظة للتوسع)
        if (tokensToBuy >= 2 * 10**18) {
            tokensToBuy = (usdValue * 1e18) / (BULK_UNIT_PRICE * 1e16);
        }

        require(tokensToBuy <= MAX_BUY_PER_TX, "Max buy exceeded");
        require(presaleTokensSold + tokensToBuy <= MAX_PRESALE_TOKENS, "Presale sold out");

        uint256 referralBonus = 0;
        if (referrer != address(0) && referrer != msg.sender) {
            referralBonus = (tokensToBuy * 5) / 100;
        }

        uint256 welcomeBonus = 0;
        if (!hasClaimedWelcomeBonus[msg.sender]) {
            welcomeBonus = 1 * 10**18;  // 1 NEXUS
            hasClaimedWelcomeBonus[msg.sender] = true;
        }

        uint256 totalTokens = tokensToBuy + referralBonus + welcomeBonus;

        presaleTokensSold += tokensToBuy;
        lastBuyBlock[msg.sender] = block.number;

        _mint(msg.sender, totalTokens);
        if (referralBonus > 0) {
            _mint(referrer, referralBonus);
        }

        emit TokensPurchased(msg.sender, totalTokens);
    }

    function withdrawFunds() external onlyOwner {
        (bool success, ) = payable(treasury).call{value: address(this).balance}("");
        require(success, "Withdrawal failed");
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}