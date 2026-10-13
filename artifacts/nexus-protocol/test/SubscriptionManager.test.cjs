// Offline tests for subscription payments, renewals, cancellation, and upgrades.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 86_400n;
const MONTH = 30n * DAY;
const e18 = (value) => ethers.parseUnits(String(value), 18);

describe("SubscriptionManager", function () {
  async function deployManager() {
    const [owner, alice, keeper, outsider, treasury] = await ethers.getSigners();
    const Payment = await ethers.getContractFactory("MockPaymentToken");
    const usdt = await Payment.deploy();
    const Nexus = await ethers.getContractFactory("NexusToken");
    const nexus = await Nexus.deploy(owner.address);
    const Manager = await ethers.getContractFactory("SubscriptionManager");
    const manager = await Manager.deploy(await usdt.getAddress(), await nexus.getAddress(), treasury.address);
    await manager.createPlan("STARTER", e18(49), e18(3920), MONTH);
    await manager.createPlan("PRO", e18(199), e18(15920), MONTH);
    await manager.createPlan("ENTERPRISE", e18(999), e18(79920), 365n * DAY);
    await usdt.mint(alice.address, e18(100_000));
    await nexus.transfer(alice.address, e18(100_000));
    await usdt.connect(alice).approve(await manager.getAddress(), ethers.MaxUint256);
    await nexus.connect(alice).approve(await manager.getAddress(), ethers.MaxUint256);
    await manager.setKeeper(keeper.address, true);
    return { manager, usdt, nexus, owner, alice, keeper, outsider, treasury };
  }

  it("sets plan zero to FREE and enforces the configured 80:1 conversion", async function () {
    const { manager, alice, owner } = await deployManager();
    const freePlan = await manager.getPlan(0);
    expect(freePlan.name).to.equal("FREE");
    expect(await manager.isActive(alice.address)).to.equal(true);
    expect(await manager.getSubscription(alice.address)).to.deep.equal([0n, 0n, false]);
    await expect(manager.connect(owner).createPlan("BAD", e18(49), e18(4900), MONTH))
      .to.be.revertedWith("SubscriptionManager: incorrect NEXUS price");
  });

  it("charges the selected token and grants access only after a confirmed contract call", async function () {
    const { manager, usdt, nexus, alice, treasury } = await deployManager();
    const beforeUsdt = await usdt.balanceOf(alice.address);
    const treasuryUsdtBefore = await usdt.balanceOf(treasury.address);
    await manager.connect(alice).subscribe(1, await usdt.getAddress());
    const subscription = await manager.subscriptions(alice.address);
    expect(await usdt.balanceOf(alice.address)).to.equal(beforeUsdt - e18(49));
    expect(await usdt.balanceOf(treasury.address)).to.equal(treasuryUsdtBefore + e18(49));
    expect(await usdt.balanceOf(await manager.getAddress())).to.equal(0n);
    expect(subscription.planId).to.equal(1n);
    expect(subscription.autoRenew).to.equal(false);
    expect(subscription.paymentToken).to.equal(await usdt.getAddress());
    expect(await manager.isActive(alice.address)).to.equal(true);

    const beforeNexus = await nexus.balanceOf(alice.address);
    const treasuryNexusBefore = await nexus.balanceOf(treasury.address);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(subscription.expiresAt + 1n)]);
    await ethers.provider.send("evm_mine", []);
    await manager.connect(alice).subscribe(1, await nexus.getAddress());
    expect(await nexus.balanceOf(alice.address)).to.equal(beforeNexus - e18(3920));
    expect(await nexus.balanceOf(treasury.address)).to.equal(treasuryNexusBefore + e18(3920));
    expect(await nexus.balanceOf(await manager.getAddress())).to.equal(0n);
  });

  it("requires explicit opt-in and only charges one renewal period at a time", async function () {
    const { manager, usdt, alice, keeper, outsider, treasury } = await deployManager();
    await manager.connect(alice).subscribe(1, await usdt.getAddress());
    await expect(manager.connect(keeper).renew(alice.address))
      .to.be.revertedWith("SubscriptionManager: renewal disabled");
    await manager.connect(alice).setAutoRenew(true);
    const first = await manager.subscriptions(alice.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(first.expiresAt + 60n * DAY)]);
    await ethers.provider.send("evm_mine", []);
    const before = await usdt.balanceOf(alice.address);
    const treasuryBeforeRenewal = await usdt.balanceOf(treasury.address);
    const tx = await manager.connect(keeper).renew(alice.address);
    const receipt = await tx.wait();
    const afterRenewal = await manager.subscriptions(alice.address);
    expect(await usdt.balanceOf(alice.address)).to.equal(before - e18(49));
    expect(await usdt.balanceOf(treasury.address)).to.equal(treasuryBeforeRenewal + e18(49));
    expect(await usdt.balanceOf(await manager.getAddress())).to.equal(0n);
    expect(afterRenewal.expiresAt).to.equal(BigInt((await ethers.provider.getBlock(receipt.blockNumber)).timestamp) + MONTH);
    expect(afterRenewal.autoRenew).to.equal(true);
    await expect(manager.connect(outsider).renew(alice.address))
      .to.be.revertedWith("SubscriptionManager: not keeper");
    await manager.connect(alice).cancel();
    expect((await manager.subscriptions(alice.address)).autoRenew).to.equal(false);
    expect(await manager.isActive(alice.address)).to.equal(true);
  });

  it("charges the greater of the prorated difference and 15% minimum, forwarding payment to treasury", async function () {
    const { manager, usdt, alice, treasury } = await deployManager();
    await manager.connect(alice).subscribe(1, await usdt.getAddress());
    const initial = await manager.subscriptions(alice.address);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(initial.lastCharged + 15n * DAY)]);
    await ethers.provider.send("evm_mine", []);
    const tx = await manager.connect(alice).upgrade(2, await usdt.getAddress());
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const remaining = initial.expiresAt - BigInt(block.timestamp);
    const oldCredit = e18(49) * remaining / MONTH;
    const newCost = e18(199) * remaining / MONTH;
    const proratedDifference = newCost > oldCredit ? newCost - oldCredit : 0n;
    const minimumDue = e18(199) * 15n / 100n;
    const paymentEvent = receipt.logs
      .map((log) => { try { return manager.interface.parseLog(log); } catch { return null; } })
      .find((event) => event?.name === "SubscriptionPayment");
    expect(paymentEvent.args.amount).to.equal(
      proratedDifference > minimumDue ? proratedDifference : minimumDue,
    );
    expect(await usdt.balanceOf(treasury.address)).to.equal(paymentEvent.args.amount + e18(49));
    expect(await usdt.balanceOf(await manager.getAddress())).to.equal(0n);
    const upgraded = await manager.subscriptions(alice.address);
    expect(upgraded.planId).to.equal(2n);
    expect(upgraded.expiresAt).to.equal(initial.expiresAt);
    expect(upgraded.autoRenew).to.equal(false);
  });

  it("charges the 15% Enterprise minimum for a PRO upgrade paid in USDT", async function () {
    const { manager, usdt, alice, treasury } = await deployManager();
    await manager.connect(alice).subscribe(2, await usdt.getAddress());
    await manager.connect(alice).setAutoRenew(true);
    const initial = await manager.subscriptions(alice.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(initial.lastCharged + 15n * DAY)]);
    await ethers.provider.send("evm_mine", []);
    const tx = await manager.connect(alice).upgrade(3, await usdt.getAddress());
    const receipt = await tx.wait();
    const paymentEvent = receipt.logs
      .map((log) => { try { return manager.interface.parseLog(log); } catch { return null; } })
      .find((event) => event?.name === "SubscriptionPayment");

    expect(paymentEvent.args.amount).to.equal(e18(149.85));
    expect(await usdt.balanceOf(treasury.address)).to.equal(e18(199) + e18(149.85));
    expect(await usdt.balanceOf(await manager.getAddress())).to.equal(0n);
    const upgraded = await manager.subscriptions(alice.address);
    expect(upgraded.planId).to.equal(3n);
    expect(upgraded.expiresAt).to.equal(initial.expiresAt);
    expect(upgraded.autoRenew).to.equal(false);
  });

  it("converts the 15% Enterprise minimum to 11,988 NEXUS and forwards it to treasury", async function () {
    const { manager, nexus, alice, treasury } = await deployManager();
    await manager.connect(alice).subscribe(2, await nexus.getAddress());
    const initial = await manager.subscriptions(alice.address);

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(initial.lastCharged + 15n * DAY)]);
    await ethers.provider.send("evm_mine", []);
    const tx = await manager.connect(alice).upgrade(3, await nexus.getAddress());
    const receipt = await tx.wait();
    const paymentEvent = receipt.logs
      .map((log) => { try { return manager.interface.parseLog(log); } catch { return null; } })
      .find((event) => event?.name === "SubscriptionPayment");

    expect(paymentEvent.args.amount).to.equal(e18(11_988));
    expect(await nexus.balanceOf(treasury.address)).to.equal(e18(15_920) + e18(11_988));
    expect(await nexus.balanceOf(await manager.getAddress())).to.equal(0n);
    const upgraded = await manager.subscriptions(alice.address);
    expect(upgraded.planId).to.equal(3n);
    expect(upgraded.expiresAt).to.equal(initial.expiresAt);
  });

  it("sends any accidentally transferred payment-token balance to treasury on owner withdrawal", async function () {
    const { manager, usdt, treasury } = await deployManager();
    await usdt.mint(await manager.getAddress(), e18(7));
    await manager.withdraw(await usdt.getAddress());
    expect(await usdt.balanceOf(treasury.address)).to.equal(e18(7));
    expect(await usdt.balanceOf(await manager.getAddress())).to.equal(0n);
  });

  it("restricts plan administration, accepts only configured payment tokens, and rejects bad decimals", async function () {
    const { manager, alice, outsider } = await deployManager();
    await expect(manager.connect(outsider).createPlan("TEST", e18(1), e18(80), DAY)).to.be.reverted;
    await expect(manager.connect(alice).subscribe(1, outsider.address))
      .to.be.revertedWith("SubscriptionManager: unsupported payment token");
    await expect(manager.connect(alice).updatePlan(1, "STARTER", e18(1), e18(80), DAY, true))
      .to.be.reverted;
  });
});
