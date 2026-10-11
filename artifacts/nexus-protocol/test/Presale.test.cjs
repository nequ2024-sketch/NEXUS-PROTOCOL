// اختبارات Presale بالعربية: التوقيت وحد الشراء وحركة الرموز.
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Presale", function () {
  async function deploySale() {
    const [owner, alice, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("NexusToken");
    const nexus = await Token.deploy(treasury.address);
    const Payment = await ethers.getContractFactory("MockPaymentToken");
    const payment = await Payment.deploy();
    const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    const start = now + 100n;
    const rate = ethers.parseEther("100");
    const hardCap = ethers.parseEther("10000");
    const minPurchase = ethers.parseEther("10");
    const Sale = await ethers.getContractFactory("Presale");
    const sale = await Sale.deploy(
      await nexus.getAddress(),
      await payment.getAddress(),
      rate,
      hardCap,
      minPurchase,
      start,
      7n * 86_400n,
    );
    await nexus.transfer(await sale.getAddress(), ethers.parseEther("10000"));
    await payment.mint(alice.address, ethers.parseEther("100"));
    await payment.connect(alice).approve(await sale.getAddress(), ethers.MaxUint256);
    return { sale, nexus, payment, owner, alice, start };
  }

  it("sells tokens for the configured 18-decimal payment amount", async function () {
    const { sale, nexus, payment, alice, start } = await deploySale();
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(start)]);
    await ethers.provider.send("evm_mine", []);
    await sale.connect(alice).buy(ethers.parseEther("10"));
    expect(await sale.contributions(alice.address)).to.equal(ethers.parseEther("10"));
    expect(await sale.purchasedTokens(alice.address)).to.equal(ethers.parseEther("1000"));
    expect(await nexus.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    expect(await payment.balanceOf(await sale.getAddress())).to.equal(ethers.parseEther("10"));
  });

  it("rejects purchases outside the schedule, below the minimum, and over the cap", async function () {
    const { sale, alice, start } = await deploySale();
    await expect(sale.connect(alice).buy(ethers.parseEther("10"))).to.be.revertedWith("Presale: sale inactive");
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(start)]);
    await ethers.provider.send("evm_mine", []);
    await expect(sale.connect(alice).buy(ethers.parseEther("9"))).to.be.revertedWith("Presale: below minimum");
    await expect(sale.connect(alice).buy(ethers.parseEther("101"))).to.be.revertedWith("Presale: hard cap exceeded");
  });

  it("allows the owner to recover unsold tokens only after the sale ends", async function () {
    const { sale, nexus, owner, start } = await deploySale();
    await expect(sale.withdrawUnsoldTokens()).to.be.revertedWith("Presale: sale not ended");
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(start + 7n * 86_400n)]);
    await ethers.provider.send("evm_mine", []);
    await sale.withdrawUnsoldTokens();
    expect(await nexus.balanceOf(owner.address)).to.equal(ethers.parseEther("1000000000"));
  });
});
