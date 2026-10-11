// اختبارات SubscriptionManager بالعربية: الخطط والخصم المتأخر والإلغاء.
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SubscriptionManager", function () {
  async function deployManager() {
    const [owner, alice, keeper, outsider] = await ethers.getSigners();
    const Payment = await ethers.getContractFactory("MockPaymentToken");
    const payment = await Payment.deploy();
    const Manager = await ethers.getContractFactory("SubscriptionManager");
    const manager = await Manager.deploy(await payment.getAddress());
    await manager.createPlan(ethers.parseEther("49"), 30n * 86_400n);
    await payment.mint(alice.address, ethers.parseEther("1000"));
    await payment.connect(alice).approve(await manager.getAddress(), ethers.MaxUint256);
    await manager.setKeeper(keeper.address, true);
    return { manager, payment, owner, alice, keeper, outsider };
  }

  it("charges the first payment immediately and permits access until expiry after cancellation", async function () {
    const { manager, payment, alice } = await deployManager();
    const before = await payment.balanceOf(alice.address);
    await manager.connect(alice).subscribe(1);
    const subscription = await manager.subscriptions(alice.address);
    expect(await payment.balanceOf(alice.address)).to.equal(before - ethers.parseEther("49"));
    expect(subscription.autoRenew).to.equal(true);
    expect(await manager.isActive(alice.address)).to.equal(true);
    await manager.connect(alice).cancel();
    expect((await manager.subscriptions(alice.address)).autoRenew).to.equal(false);
    expect(await manager.isActive(alice.address)).to.equal(true);
  });

  it("charges all elapsed periods once and extends access by the same periods", async function () {
    const { manager, payment, alice, keeper } = await deployManager();
    await manager.connect(alice).subscribe(1);
    const initial = await manager.subscriptions(alice.address);
    const price = ethers.parseEther("49");
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(initial.lastCharged + 60n * 86_400n)]);
    await ethers.provider.send("evm_mine", []);
    await payment.connect(alice).approve(await manager.getAddress(), ethers.MaxUint256);
    await expect(manager.connect(keeper).charge(alice.address))
      .to.emit(manager, "Charged").withArgs(alice.address, 1, 2, price * 2n, initial.expiresAt + 60n * 86_400n);
    expect(await manager.isActive(alice.address)).to.equal(true);
    expect((await manager.subscriptions(alice.address)).lastCharged).to.equal(initial.lastCharged + 60n * 86_400n);
  });

  it("restricts keeper charges and plan administration", async function () {
    const { manager, alice, outsider } = await deployManager();
    await expect(manager.connect(outsider).createPlan(1, 1)).to.be.reverted;
    await manager.connect(alice).subscribe(1);
    await expect(manager.connect(outsider).charge(alice.address)).to.be.revertedWith("SubscriptionManager: not keeper");
    await expect(manager.connect(alice).updatePlan(1, 1, 1, true)).to.be.reverted;
  });
});
